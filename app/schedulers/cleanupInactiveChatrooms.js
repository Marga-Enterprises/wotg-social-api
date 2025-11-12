const cron = require("node-cron");
const { Op } = require("sequelize");
const sequelize = require("../../config/db");

// 🧩 Import Models
const Chatroom = require("../models/Chatroom");
const Message = require("../models/Message");
const MessageReactions = require("../models/MessageReactions");
const MessageReadStatus = require("../models/MessageReadStatus");
const Participant = require("../models/Participant");
const User = require("../models/User");

// 🧠 Import cache clearer
const { clearChatroomsCache, clearUsersCache } = require("../../utils/clearBlogCache");

// Utility for timestamped logs
const log = (msg, color = "36") => {
  const time = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  console.log(`\x1b[${color}m[${time}] ${msg}\x1b[0m`);
};

// 🕒 Schedule: Every day at 12:00 AM (Manila time)
cron.schedule(
  "0 0 * * *",
  async () => {
    log("🧹 [CRON] Starting cleanup for inactive welcome chatrooms...", "33");

    const transaction = await sequelize.transaction();

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      log(`📅 Checking messages created after: ${oneDayAgo.toISOString()}`, "36");

      // 1️⃣ Find all welcome chatrooms
      log("🔍 Fetching all welcome chatrooms...", "36");
      const welcomeChats = await Chatroom.findAll({
        where: { welcome_chat: true },
        attributes: ["id", "target_user_id"],
        transaction,
      });

      log(`📋 Found ${welcomeChats.length} welcome chatrooms.`, "36");

      if (!welcomeChats.length) {
        log("✅ No welcome chatrooms found. Exiting cleanup.", "32");
        await transaction.commit();
        return;
      }

      const chatroomsToDelete = [];

      // 2️⃣ Check message activity and guest status
      for (const chat of welcomeChats) {
        log(`➡️ Checking chatroom ID: ${chat.id}, target user ID: ${chat.target_user_id}`, "34");

        const user = await User.findByPk(chat.target_user_id, { transaction });

        if (!user) {
          log(`⚠️ Skipping chatroom ${chat.id} — user not found.`, "33");
          continue;
        }

        const hasRecentMessage = await Message.findOne({
          where: {
            chatroom_id: chat.id,
            sender_id: chat.target_user_id,
            created_at: { [Op.gte]: oneDayAgo },
          },
          transaction,
        });

        const isGuest = user.guest_account === true;
        const guestStatus = hasRecentMessage || !isGuest ? "active" : "abandoned";

        log(
          `👤 User ${user.id} (${isGuest ? "guest" : "registered"}) - Recent message: ${
            hasRecentMessage ? "✅ Yes" : "❌ No"
          } → Setting status to "${guestStatus}"`,
          "36"
        );

        await user.update({ guest_status: guestStatus }, { transaction });
        await clearUsersCache(chat.target_user_id);

        // 🧠 DELETE only if user is still guest AND no recent message
        if (isGuest && !hasRecentMessage) {
          chatroomsToDelete.push(chat.id);
          log(`🗑️ Marked chatroom ${chat.id} for deletion.`, "31");
        }
      }

      if (chatroomsToDelete.length === 0) {
        log("✅ No inactive guest welcome chats to delete.", "32");
        await transaction.commit();
        return;
      }

      log(
        `⚠️ Found ${chatroomsToDelete.length} inactive guest welcome chats to delete: ${chatroomsToDelete.join(
          ", "
        )}`,
        "33"
      );

      // 3️⃣ Collect related message IDs
      log("🔎 Collecting related message IDs...", "36");
      const messages = await Message.findAll({
        where: { chatroom_id: { [Op.in]: chatroomsToDelete } },
        attributes: ["id"],
        transaction,
      });
      const messageIds = messages.map((m) => m.id);
      log(`🧾 Found ${messageIds.length} related messages to delete.`, "36");

      // 4️⃣ Delete related data in correct order
      if (messageIds.length > 0) {
        log("💥 Deleting message reactions...", "35");
        await MessageReactions.destroy({
          where: { message_id: { [Op.in]: messageIds } },
          transaction,
        });

        log("💥 Deleting message read statuses...", "35");
        await MessageReadStatus.destroy({
          where: { message_id: { [Op.in]: messageIds } },
          transaction,
        });

        log("💥 Deleting messages...", "35");
        await Message.destroy({
          where: { id: { [Op.in]: messageIds } },
          transaction,
        });
      }

      log("💥 Deleting participants...", "35");
      await Participant.destroy({
        where: { chat_room_id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      log("💥 Deleting chatrooms...", "35");
      await Chatroom.destroy({
        where: { id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      // ✅ Commit DB changes
      await transaction.commit();
      log(`🧽 Deleted ${chatroomsToDelete.length} inactive guest welcome chatrooms.`, "32");

      // 🧠 Clear Redis/Cache
      log("🧠 Clearing chatroom cache...", "36");
      await clearChatroomsCache();

      log("✅ [CRON] Cleanup job completed successfully.", "32");
    } catch (error) {
      await transaction.rollback();
      log(`❌ [CRON] Cleanup job failed: ${error.message}`, "31");
      console.error(error);
    }
  },
  {
    timezone: "Asia/Manila", // ✅ Ensures it runs at 12:00 AM Manila time
  }
);
