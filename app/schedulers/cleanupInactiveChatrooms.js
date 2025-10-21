const cron = require("node-cron");
const { Op } = require("sequelize");
const sequelize = require("../../config/db");

// 🧩 Import Models
const Chatroom = require("../models/Chatroom");
const Message = require("../models/Message");
const MessageReactions = require("../models/MessageReactions");
const MessageReadStatus = require("../models/MessageReadStatus");
const Participant = require("../models/Participant");

// 🧠 Import cache clearer
const { clearChatroomsCache } = require("../../utils/clearBlogCache");

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

      // 2️⃣ Check if target user sent a message in the last 24 hours
      for (const chat of welcomeChats) {
        const hasRecentMessage = await Message.findOne({
          where: {
            chatroom_id: chat.id,
            sender_id: chat.target_user_id,
            created_at: { [Op.gte]: oneDayAgo },
          },
          transaction,
        });

        if (!hasRecentMessage) {
          chatroomsToDelete.push(chat.id);
        }
      }

      if (chatroomsToDelete.length === 0) {
        console.log("✅ [CRON] All welcome chats are active.");
        await transaction.commit();
        return;
      }

      console.log(
        `⚠️ [CRON] Found ${chatroomsToDelete.length} inactive welcome chats:`,
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
      console.log(`🧽 [CRON] Deleted ${chatroomsToDelete.length} inactive welcome chatrooms.`);

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
