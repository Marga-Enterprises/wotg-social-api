// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const User = require('../models/User'); 
const Message = require('../models/Message'); 
const MessageReadStatus = require('../models/MessageReadStatus'); 
const upload = require('./upload');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

const sequelize = require('../../config/db');

/*
let io; // Global variable to hold the Socket.IO instance

// Method to set `io`
exports.setIO = (socketInstance) => {
    io = socketInstance;
};
*/

// Fetch all chatrooms
exports.getAllChatrooms = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const userDecoded = decodeToken(token); // Decode the token and retrieve the user ID
        const { search } = req.query; // Extract search query parameter

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

            // Step 2: Fetch unread messages for the logged-in user and group by chatroom
            const unreadStatuses = await MessageReadStatus.findAll({
                where: {
                    userId: userDecoded.user.id,
                    read: false, // Filter unread messages
                },
                include: [
                    {
                        model: Message,
                        as: 'message', // Specify the alias used in the association
                        attributes: ['chatroomId'], // Fetch chatroomId from the related message
                    },
                ],
                raw: true, // Return plain objects
            });

            // Group unread counts by chatroom
            const unreadCountByChatroom = unreadStatuses.reduce((acc, status) => {
                const chatroomId = status['message.chatroomId']; // Access the joined chatroomId
                if (chatroomId) {
                    acc[chatroomId] = (acc[chatroomId] || 0) + 1; // Increment count
                }
                return acc;
            }, {});

            // Step 3: Add `unreadCount`, `hasUnread`, and participants to each chatroom
            const chatroomIds = chatrooms.map(chatroom => chatroom.id);
            const participants = await Participant.findAll({
                where: { chatRoomId: chatroomIds },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'user_fname', 'user_lname', 'email', 'user_profile_picture'],
                    },
                ],
                attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
            });

            let chatroomsWithParticipants = chatrooms.map(chatroom => {
                const chatroomParticipants = participants.filter(
                    participant => participant.chatRoomId === chatroom.id
                );

                const recentMessage = chatroom.messages ? chatroom.messages[0] : null;

                // Get unread count for this chatroom
                const unreadCount = unreadCountByChatroom[chatroom.id] || 0;

                return {
                    ...chatroom.toJSON(),
                    Participants: chatroomParticipants,
                    RecentMessage: recentMessage,
                    unreadCount, // Add unread count to the chatroom
                    hasUnread: unreadCount > 0, // Add hasUnread based on unreadCount
                };
            });

            // Step 4: Apply search filtering (if a search term is provided)
            if (search) {
                const lowerSearch = search.toLowerCase();
            
                // Filter chatrooms based on search criteria
                chatroomsWithParticipants = chatroomsWithParticipants.filter(chatroom => {
                    // Check if the chatroom name matches the search term
                    const chatroomNameMatches = chatroom.name.toLowerCase().includes(lowerSearch);
            
                    // Check if any participant's name matches the search term
                    const participantNameMatches = chatroom.Participants.some(participant => {
                        const fullName = `${participant.user.user_fname} ${participant.user.user_lname}`.toLowerCase();
                        return fullName.includes(lowerSearch);
                    });
            
                    return chatroomNameMatches || participantNameMatches;
                });
            
                // Sort the filtered chatrooms:
                // 1. Private conversations at the top
                // 2. Group chatrooms afterward
                // 3. Further sort by the most recent message within each type
                chatroomsWithParticipants.sort((a, b) => {
                    // Private chatrooms come first
                    if (a.type === "private" && b.type === "group") return -1;
                    if (a.type === "group" && b.type === "private") return 1;
            
                    // Sort by the most recent message within the same type
                    const dateA = a.RecentMessage ? new Date(a.RecentMessage.createdAt) : 0;
                    const dateB = b.RecentMessage ? new Date(b.RecentMessage.createdAt) : 0;
                    return dateB - dateA;
                });
            }
            

            // Step 5: Sort the chatrooms by the createdAt of the most recent message
            chatroomsWithParticipants.sort((a, b) => {
                const dateA = a.RecentMessage ? new Date(a.RecentMessage.createdAt) : 0;
                const dateB = b.RecentMessage ? new Date(b.RecentMessage.createdAt) : 0;
                return dateB - dateA; // Sort in descending order
            });

            // Return the chatrooms with unread counts and hasUnread
            return sendSuccess(res, chatroomsWithParticipants);
        } catch (error) {
            return sendError(res, error, 'Failed to retrieve chatrooms.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};



// Create a new chatroom
exports.createChatroom = async (req, res, io) => {
    let token = getToken(req.headers);
    if (token) {
        const { name, participants } = req.body; // Get name, type, and participants from the request body

        // Validate the participants
        if (!Array.isArray(participants) || participants.length <= 1) {
            return sendError(res, null, "At least two participant is required.");
        }

        try {
            let chatroomName = name;

            // Check if participants are exactly 2
            if (participants.length === 2) {
                const existingChatroom = await Participant.findAll({
                    where: { userId: participants }, // Filter participants matching the provided IDs
                    attributes: ['chatRoomId'], // Only select the chatRoomId
                    include: [
                        {
                            model: Chatroom, // Join with the Chatroom model
                            attributes: [], // Exclude Chatroom fields from the result
                            where: { type: 'private' }, // Only include private chatrooms
                        },
                    ],
                    group: ['chatRoomId'], // Group by chatRoomId
                    having: sequelize.literal(`COUNT(DISTINCT user_id) = 2`), // Ensure exactly 2 participants in the same chatroom
                });
                                       
                
                console.log('[[[[[[[[[[[[[[existingChatroom]]]]]]]]]]]]]]', existingChatroom);

                if (existingChatroom.length > 0) {
                    // Return an error if a chatroom already exists for these participants
                    return sendError(res, null, "A chatroom already exists for these participants.");
                }

                // Fetch user details to construct the chatroom name
                const users = await User.findAll({
                    where: { id: participants },
                    attributes: ['user_fname', 'user_lname'], // Only select the required fields
                });

                // Construct the chatroom name using the participants' full names
                chatroomName = users
                    .map((user) => `${user.user_fname} ${user.user_lname}`)
                    .join(', ');
            }

            // Determine chatroom type based on the number of participants
            const chatroomType = participants.length <= 2 ? "private" : "group";

            // Create a new chatroom with the determined type and name
            const chatroom = await Chatroom.create({ name: chatroomName, type: chatroomType });

            // Create participants for the chatroom
            const participantsData = participants.map((userId) => ({
                userId,
                chatRoomId: chatroom.id, // Link the participant to the newly created chatroom
            }));

            // Insert participants into the Participant model
            await Participant.bulkCreate(participantsData);

            // Fetch participants' user details to include in the response
            const chatroomParticipants = await Participant.findAll({
                where: { chatRoomId: chatroom.id },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'user_fname', 'user_lname', 'email'],
                    },
                ],
                attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
            });

            // Prepare the chatroom data with participants to be returned
            const chatroomWithParticipants = {
                id: chatroom.id,
                name: chatroom.name,
                type: chatroomType, // Use the dynamically determined type
                createdAt: chatroom.createdAt,
                updatedAt: chatroom.updatedAt,
                messages: [], // No messages yet for the newly created chatroom
                Participants: chatroomParticipants,
                unreadCount: 0, // Initially, no unread messages
                hasUnread: false, // No unread messages
            };

            // Emit a real-time event for the new chatroom with participants
            if (io) {
                io.emit('new_chatroom', chatroomWithParticipants);
            }

            // Return the success response using sendSuccess, chatroom data will be passed directly
            return sendSuccess(res, chatroomWithParticipants); // Automatically handles the JSON response
        } catch (error) {
            return sendError(res, error, 'Failed to create chatroom.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

exports.updateChatroom = async (req, res, io) => {
    // Use Multer middleware to handle file upload
    upload.single("chatroom_photo")(req, res, async (err) => {
      if (err) {
        console.error("❌ Error uploading file:", err);
        return sendError(res, err, "Failed to upload file.");
      }
  
      try {
        const { id } = req.params;
        const { name } = req.body;
        const userId = req.user.id; // ✅ Get authenticated user ID
  
        console.log("🔍 Checking chatroom ID:", id);
        console.log("🔍 Checking user ID:", userId);
  
        const chatroom = await Chatroom.findByPk(id);
        if (!chatroom) {
          return sendError(res, "", "Chatroom not found.");
        }
  
        // ✅ Check if the user is a participant
        const isParticipant = await Participant.findOne({
          where: { chatRoomId: id, userId: userId }, // Make sure field names match DB
        });
  
        if (!isParticipant) {
          console.warn("🚫 Unauthorized: User is not a participant of this chatroom.");
          return sendError(res, "", "You are not allowed to edit this chatroom.");
        }
  
        // ✅ Update chatroom details
        chatroom.name = name || chatroom.name;
        if (req.file) {
          chatroom.chatroom_photo = req.file.filename;
        }
  
        await chatroom.save();
  
        console.log("✅ Chatroom updated:", chatroom);
  
        // 🔥 Emit real-time event to notify participants
        io.to(`chatroom_${id}`).emit("chatroomUpdated", {
          id: chatroom.id,
          name: chatroom.name,
          chatroom_photo: chatroom.chatroom_photo
            ? `${process.env.BASE_URL}/uploads/${chatroom.chatroom_photo}`
            : null,
        });
  
        return sendSuccess(res, chatroom, "Chatroom updated successfully.");
  
      } catch (error) {
        console.error("❌ Error updating chatroom:", error);
        return sendError(res, error, "Failed to update chatroom.");
      }
    });
};






