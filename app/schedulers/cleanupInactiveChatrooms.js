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

// 🕒 Schedule: Every day at 1:00 AM (Manila time)
cron.schedule(
  "0 1 * * *",
  async () => {
    console.log("🧹 [CRON] Starting cleanup for inactive welcome chatrooms...");

    const transaction = await sequelize.transaction();

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 1️⃣ Find all welcome chatrooms
      const welcomeChats = await Chatroom.findAll({
        where: { welcome_chat: true },
        attributes: ["id", "target_user_id"],
        transaction,
      });

      if (!welcomeChats.length) {
        console.log("✅ [CRON] No welcome chatrooms found.");
        await transaction.commit();
        return;
      }

      const chatroomsToDelete = [];

      // 2️⃣ Check message activity and guest status
      for (const chat of welcomeChats) {
        const user = await User.findByPk(chat.target_user_id, { transaction });

        if (!user) continue;

        const hasRecentMessage = await Message.findOne({
          where: {
            chatroom_id: chat.id,
            sender_id: chat.target_user_id,
            created_at: { [Op.gte]: oneDayAgo },
          },
          transaction,
        });

        const guest_account = user.guest_account;
        const isGuest = guest_account === true;

        // Update guest_status depending on activity
        await user.update(
          {
            guest_status: hasRecentMessage || !isGuest ? "active" : "abandoned",
          },
          { transaction }
        );

        await clearUsersCache(chat.target_user_id);

        // 🧠 DELETE only if user is still guest AND no recent message
        if (isGuest && !hasRecentMessage) {
          chatroomsToDelete.push(chat.id);
        }
      }

      if (chatroomsToDelete.length === 0) {
        console.log("✅ [CRON] No inactive guest welcome chats to delete.");
        await transaction.commit();
        return;
      }

      console.log(
        `⚠️ [CRON] Found ${chatroomsToDelete.length} inactive guest welcome chats:`,
        chatroomsToDelete
      );

      // 3️⃣ Collect related message IDs
      const messages = await Message.findAll({
        where: { chatroom_id: { [Op.in]: chatroomsToDelete } },
        attributes: ["id"],
        transaction,
      });
      const messageIds = messages.map((m) => m.id);

      // 4️⃣ Delete related data in correct order
      if (messageIds.length > 0) {
        await MessageReactions.destroy({
          where: { message_id: { [Op.in]: messageIds } },
          transaction,
        });
        await MessageReadStatus.destroy({
          where: { message_id: { [Op.in]: messageIds } },
          transaction,
        });
        await Message.destroy({
          where: { id: { [Op.in]: messageIds } },
          transaction,
        });
      }

      await Participant.destroy({
        where: { chat_room_id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      await Chatroom.destroy({
        where: { id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      // ✅ Commit DB changes
      await transaction.commit();
      console.log(`🧽 [CRON] Deleted ${chatroomsToDelete.length} inactive guest welcome chatrooms.`);

      // 🧠 Clear Redis/Cache
      await clearChatroomsCache();
      console.log("🧠 [CRON] Cache cleared successfully.");

      console.log("✅ [CRON] Cleanup job completed successfully.");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ [CRON] Cleanup job failed:", error);
    }
  },
  {
    timezone: "Asia/Manila", // ✅ Ensures it runs at 1:00 AM Manila time
  }
);
