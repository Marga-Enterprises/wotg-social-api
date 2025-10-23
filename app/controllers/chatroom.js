// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const User = require('../models/User'); 
const Message = require('../models/Message'); 
const MessageReadStatus = require('../models/MessageReadStatus'); 

// redis 
const redisClient = require("../../config/redis");

// clear cache
const { clearChatroomsCache, clearUsersCache } = require("../../utils/clearBlogCache");

const uploadMemory = require('./uploadMemory');
const { uploadFileToSpaces } = require('./spaceUploader');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    processImageToSpace,
    removeFileFromSpaces,
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
            // Step 0: check if its cached
            const cacheKey = `chatrooms_user_${userDecoded.user.id}_search_${search || ''}`;
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return sendSuccess(res, JSON.parse(cachedData));
            }

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
                        attributes: ['id', 'createdAt', 'content', 'senderId'], // Select necessary fields
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
                        attributes: ['id', 'user_fname', 'user_lname', 'email', 'user_profile_picture', 'user_role'],
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

            // Step 6: Cache the result in Redis for 30 minutes
            await redisClient.setEx(cacheKey, 1800, JSON.stringify(chatroomsWithParticipants));

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
// Create a new chatroom
exports.createChatroom = async (req, res, io) => {
  console.log("🟢 createChatroom controller called");

  let token = getToken(req.headers);
  if (!token) {
    return sendErrorUnauthorized(res, "", "Please login first.");
  }

  const { name, participants, target_user_id } = req.body;

  if (!Array.isArray(participants) || participants.length <= 1) {
    return sendError(res, null, "At least two participants are required.");
  }

  try {
    let chatroomName = name;

    // ✅ Check for existing private chatroom between same two participants
    if (participants.length === 2) {
      const existingChatroom = await Participant.findAll({
        where: { userId: participants },
        attributes: ['chatRoomId'],
        include: [{
          model: Chatroom,
          attributes: [],
          where: { type: 'private' },
        }],
        group: ['chatRoomId'],
        having: sequelize.literal(`COUNT(DISTINCT user_id) = 2`),
      });

      if (existingChatroom.length > 0) {
        console.warn("⚠️ Chatroom already exists for these participants.");
        return sendError(res, null, "A chatroom already exists for these participants.");
      }

      const users = await User.findAll({
        where: { id: participants },
        attributes: ['user_fname', 'user_lname'],
      });

      chatroomName = users
        .map((u) => `${u.user_fname} ${u.user_lname}`)
        .join(', ');
    }

    const chatroomType = participants.length <= 2 ? "private" : "group";

    // ✅ Create chatroom
    const chatroom = await Chatroom.create({
      name: chatroomName,
      type: chatroomType,
      target_user_id: target_user_id || null,
    });

    // ✅ Create participants
    const participantsData = participants.map((userId) => ({
      userId,
      chatRoomId: chatroom.id,
    }));

    await Participant.bulkCreate(participantsData);

    // ✅ Fetch all participants with user details
    const chatroomParticipants = await Participant.findAll({
      where: { chatRoomId: chatroom.id },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'user_fname', 'user_lname', 'email'],
      }],
      attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
    });

    // ✅ Update target user's guest status safely
    if (target_user_id && participants.includes(target_user_id)) {
      const targetUser = await User.findByPk(target_user_id);
      if (targetUser) {
        await targetUser.update({ guest_status: 'in_contact' }).catch(err => {
          console.warn("⚠️ Failed to update guest status:", err.message);
        });
        await clearUsersCache(target_user_id).catch(err => {
          console.warn("⚠️ clearUsersCache failed:", err.message);
        });
      }
    }

    // ✅ Construct response object
    const chatroomWithParticipants = {
      id: chatroom.id,
      name: chatroom.name,
      type: chatroomType,
      createdAt: chatroom.createdAt,
      updatedAt: chatroom.updatedAt,
      messages: [],
      Participants: chatroomParticipants,
      unreadCount: 0,
      hasUnread: false,
    };

    // ✅ Emit socket event safely
    if (io) {
      io.emit('new_chatroom', chatroomWithParticipants);
    }

    // ✅ Clear cache for all affected users safely
    const userDecoded = decodeToken(token);
    const affectedUserIds = new Set([...participants, userDecoded.user.id]);

    for (const userId of affectedUserIds) {
      try {
        await clearChatroomsCache(userId);
      } catch (cacheErr) {
        console.warn(`⚠️ clearChatroomsCache failed for user ${userId}:`, cacheErr.message);
      }
    }

    console.log("✅ Chatroom created successfully:", chatroom.id);
    return sendSuccess(res, chatroomWithParticipants);

  } catch (error) {
    console.error("❌ Error creating chatroom:", error.message);
    return sendError(res, error, "Failed to create chatroom.");
  }
};


exports.addParticipants = async (req, res, io) => {
    let token = getToken(req.headers);
    if (token) {
        const userDecoded = decodeToken(token);
        const { chatroomId, userIds } = req.body;

        if (!chatroomId || !Array.isArray(userIds) || userIds.length === 0) {
            return sendError(res, null, "Chatroom ID and at least one User ID are required.");
        }

        try {
            const chatroom = await Chatroom.findByPk(chatroomId);
            if (!chatroom) {
                return sendError(res, null, "Chatroom not found.");
            }

            const existingParticipants = await Participant.findAll({
                where: { chatRoomId: chatroomId, userId: userIds },
                attributes: ['userId'],
            });

            const existingUserIds = existingParticipants.map(participant => participant.userId);
            const newUserIds = userIds.filter(userId => !existingUserIds.includes(userId));

            if (newUserIds.length === 0) {
                return sendError(res, null, "All users are already participants in this chatroom.");
            }

            const users = await User.findAll({
                where: { id: newUserIds },
                attributes: ['id', 'user_fname', 'user_lname', 'email', 'user_profile_picture'],
            });

            await Participant.bulkCreate(
                users.map(user => ({
                    chatRoomId: chatroomId,
                    userId: user.id,
                    userName: `${user.user_fname} ${user.user_lname}`,
                }))
            );

            const chatroomParticipants = await Participant.findAll({
                where: { chatRoomId: chatroomId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'user_fname', 'user_lname', 'email', 'user_profile_picture'],
                    },
                ],
                attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
            });

            const chatroomWithParticipants = {
                id: chatroom.id,
                name: chatroom.name,
                type: chatroom.type,
                createdAt: chatroom.createdAt,
                updatedAt: chatroom.updatedAt,
                messages: [],
                Participants: chatroomParticipants,
                unreadCount: 0,
                hasUnread: false,
            };

            if (io) {
                io.emit('new_participants', chatroomWithParticipants);
            }

            // Clear chatroom cache for new participants and the user who added them
            const affectedUserIds = [...newUserIds, userDecoded.user.id];
            for (const userId of affectedUserIds) {
                await clearChatroomCache(userId);
            }

            return sendSuccess(res, chatroomWithParticipants, 'You are added to the group chat.');
        } catch (error) {
            return sendError(res, error, 'Failed to add participants to chatroom.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

exports.updateChatroom = async (req, res, io) => {
    uploadMemory.single("file")(req, res, async (err) => {
        if (err) {
            return sendError(res, null, "File upload failed.");
        }

        let token = getToken(req.headers);
        if (!token) {
            return sendErrorUnauthorized(res, "", "Please login first.");
        }

        const chatroomId = req.params.id; // Get chatroom ID from params
        const { name } = req.body;

        if (!chatroomId) {
            return sendError(res, null, "Chatroom ID is required.");
        }

        try {
            // Find the chatroom
            const chatroom = await Chatroom.findByPk(chatroomId);
            if (!chatroom) {
                return sendError(res, null, "Chatroom not found.");
            }


            if (chatroom.chatroom_photo) {
                await removeFileFromSpaces('images', chatroom.chatroom_photo);
            }

            const convertedImage = await processImageToSpace(req.file);
            const processedImage = await uploadFileToSpaces(convertedImage);

            // Update fields dynamically
            const updateFields = {};
            if (name) updateFields.name = name;
            if (processedImage) updateFields.chatroom_photo = processedImage;

            // Perform update
            await chatroom.update(updateFields);

            // Fetch updated chatroom with participants
            const updatedChatroom = await Chatroom.findByPk(chatroomId, {
                include: [
                    {
                        model: Participant,
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['id', 'user_fname', 'user_lname', 'email', 'user_profile_picture'],
                            },
                        ],
                        attributes: ['id', 'chatRoomId', 'userId', 'userName', 'joinedAt'],
                    },
                ],
            });

            // Emit real-time update event
            if (io) {
                io.emit("chatroom_updated", updatedChatroom);
            }

            // Clear chatroom cache for all participants
            const participants = await Participant.findAll({
                where: { chatRoomId: chatroomId },
                attributes: ['userId'],
            });

            for (const participant of participants) {
                await clearChatroomsCache(participant.userId);
            }

            return sendSuccess(res, updatedChatroom, "Chatroom updated successfully.");
        } catch (error) {
            return sendError(res, error, "Failed to update chatroom.");
        }
    });
};
