const cron = require("node-cron");
const { Op } = require("sequelize");
const sequelize = require("../../config/db");

const Chatroom = require("../models/Chatroom");
const Message = require("../models/Message");
const MessageReactions = require("../models/MessageReactions");
const MessageReadStatus = require("../models/MessageReadStatus");
const Participant = require("../models/Participant");
const User = require("../models/User");

const { clearChatroomsCache, clearUsersCache } = require("../../utils/clearBlogCache");

// Scheduled: Every day at 12:00 AM Manila time
cron.schedule(
  "0 0 * * *",
  async () => {
    const transaction = await sequelize.transaction();

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Find all welcome chatrooms
      const welcomeChats = await Chatroom.findAll({
        where: { welcome_chat: true },
        attributes: ["id", "target_user_id"],
        transaction,
      });

      if (!welcomeChats.length) {
        await transaction.commit();
        return;
      }

      const chatroomsToDelete = [];

      // Check activity and update guest status
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

        const isGuest = user.guest_account === true;
        const guestStatus = hasRecentMessage || !isGuest ? "active" : "abandoned";

        await user.update({ guest_status: guestStatus }, { transaction });
        await clearUsersCache(chat.target_user_id);

        if (isGuest && !hasRecentMessage) {
          chatroomsToDelete.push(chat.id);
        }
      }

      if (!chatroomsToDelete.length) {
        await transaction.commit();
        return;
      }

      // Collect messages
      const messages = await Message.findAll({
        where: { chatroom_id: { [Op.in]: chatroomsToDelete } },
        attributes: ["id"],
        transaction,
      });

      const messageIds = messages.map((m) => m.id);

      // Delete related message data
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

      // Delete participants and chatrooms
      await Participant.destroy({
        where: { chat_room_id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      await Chatroom.destroy({
        where: { id: { [Op.in]: chatroomsToDelete } },
        transaction,
      });

      // Commit DB changes
      await transaction.commit();

      // Clear Redis/Cache
      await clearChatroomsCache();
    } catch (error) {
      await transaction.rollback();
    }
  },
  {
    timezone: "Asia/Manila",
  }
);
