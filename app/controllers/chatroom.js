// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const User = require('../models/User'); 
const Message = require('../models/Message'); 
const MessageReadStatus = require('../models/MessageReadStatus'); 

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

let io; // Global variable to hold the Socket.IO instance

// Method to set `io`
exports.setIO = (socketInstance) => {
    io = socketInstance;
};

// Fetch all chatrooms
exports.getAllChatrooms = async (req, res) => {
  let token = getToken(req.headers);
  if (token) {
      const userDecoded = decodeToken(token); // Decode the token and retrieve the user ID
      try {
          // Step 1: Fetch all chatrooms where the logged-in user is a participant
          const chatrooms = await Chatroom.findAll({
              include: [
                  {
                      model: Participant,
                      required: true, // Ensures the chatroom must include the logged-in user
                      where: { userId: userDecoded.user.id }, // Filter by logged-in user
                      attributes: [], // Exclude redundant data for filtering
                  },
                  {
                      model: Message, // Include the messages to fetch the latest message
                      as: 'messages', // Alias for the association
                      required: false, // Allow chatrooms with no messages
                      attributes: ['id', 'createdAt', 'content'], // Select necessary fields
                      order: [['createdAt', 'DESC']], // Sort messages by the most recent
                      limit: 1, // Fetch only the most recent message
                  },
              ],
          });

          // Step 2: Fetch unread messages for the logged-in user
          const unreadStatuses = await MessageReadStatus.findAll({
              where: {
                  userId: userDecoded.user.id,
                  read: false, // Filter unread messages
              },
              attributes: ['messageId'], // Only need the message ID
          });

          const unreadMessageIds = unreadStatuses.map(status => status.messageId);

          // Step 3: Add `hasUnread` and participants to each chatroom
          const chatroomIds = chatrooms.map(chatroom => chatroom.id);
          const participants = await Participant.findAll({
              where: { chatRoomId: chatroomIds },
              include: [
                  {
                      model: User,
                      as: 'user',
                      attributes: ['id', 'user_fname', 'user_lname', 'email'],
                  },
              ],
              attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
          });

          const chatroomsWithParticipants = chatrooms.map(chatroom => {
              const chatroomParticipants = participants.filter(
                  participant => participant.chatRoomId === chatroom.id
              );

              const recentMessage = chatroom.messages ? chatroom.messages[0] : null;

              // Determine if this chatroom has unread messages
              const hasUnread = chatroom.messages.some(
                  message => unreadMessageIds.includes(message.id)
              );

              return {
                  ...chatroom.toJSON(),
                  Participants: chatroomParticipants,
                  RecentMessage: recentMessage,
                  hasUnread, // Add unread status to the chatroom
              };
          });

          // Step 4: Sort the chatrooms by the createdAt of the most recent message
          chatroomsWithParticipants.sort((a, b) => {
              const dateA = a.RecentMessage ? new Date(a.RecentMessage.createdAt) : 0;
              const dateB = b.RecentMessage ? new Date(b.RecentMessage.createdAt) : 0;
              return dateB - dateA; // Sort in descending order
          });

          // Return the chatrooms with unread status
          return sendSuccess(res, chatroomsWithParticipants);
      } catch (error) {
          console.error('Error fetching chatrooms:', error);
          return sendError(res, error, 'Failed to retrieve chatrooms.');
      }
  } else {
      return sendErrorUnauthorized(res, "", "Please login first.");
  }
};


  
  



// Create a new chatroom
exports.createChatroom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { name, type, participants } = req.body; // Get name, type, and participants from the request body

        // Validate the participants
        if (!Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: "At least one participant is required." });
        }

        try {
            // Create a new chatroom
            const chatroom = await Chatroom.create({ name, type });

            // Create participants for the chatroom
            const participantsData = participants.map((userId) => ({
                userId, 
                chatRoomId: chatroom.id,  // Link the participant to the newly created chatroom
            }));

            // Insert participants into the Participant model
            await Participant.bulkCreate(participantsData);

            // Emit a real-time event for the new chatroom with participants
            if (io) {
                io.emit('new_chatroom', { chatroom, participants });
            }

            return sendSuccess(res, chatroom);
        } catch (error) {
            console.error('Error creating chatroom:', error);
            return res.status(500).json({ error: 'Failed to create chatroom.' });
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};


