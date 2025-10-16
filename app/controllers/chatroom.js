// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const User = require('../models/User'); 
const Message = require('../models/Message'); 
const MessageReadStatus = require('../models/MessageReadStatus'); 

// redis 
const redisClient = require("../../config/redis");

// clear cache
const { clearChatroomsCache } = require("../../utils/clearBlogCache");

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
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  const userDecoded = decodeToken(token);
  const { search, pageIndex, pageSize } = req.query;

  try {
    // ✅ Validate pagination parameters
    let page = parseInt(pageIndex) || 1;
    let size = parseInt(pageSize) || 10;

    if (isNaN(page) || isNaN(size) || page <= 0 || size <= 0) {
      return sendError(res, "", "Invalid query parameters: pageIndex and pageSize must be positive numbers.");
    }

    const offset = (page - 1) * size;
    const limit = size;

    // ✅ Build Redis cache key
    const cacheKey = `chatrooms:user:${userDecoded.user.id}:page:${page}:size:${size}:search:${search || ''}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached), "From cache");
    }

    // Step 1: Fetch all chatrooms for the logged-in user
    const chatrooms = await Chatroom.findAll({
      include: [
        {
          model: Participant,
          required: true,
          where: { userId: userDecoded.user.id },
          attributes: [],
        },
        {
          model: Message,
          as: "messages",
          required: false,
          attributes: ["id", "createdAt", "content", "senderId"],
          order: [["createdAt", "DESC"]],
          limit: 1,
        },
      ],
      offset,
      limit,
    });

    // Step 2: Fetch unread message counts
    const unreadStatuses = await MessageReadStatus.findAll({
      where: {
        userId: userDecoded.user.id,
        read: false,
      },
      include: [
        {
          model: Message,
          as: "message",
          attributes: ["chatroomId"],
        },
      ],
      raw: true,
    });

    const unreadCountByChatroom = unreadStatuses.reduce((acc, status) => {
      const chatroomId = status["message.chatroomId"];
      if (chatroomId) acc[chatroomId] = (acc[chatroomId] || 0) + 1;
      return acc;
    }, {});

    // Step 3: Fetch participants
    const chatroomIds = chatrooms.map((c) => c.id);
    const participants = await Participant.findAll({
      where: { chatRoomId: chatroomIds },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "user_fname",
            "user_lname",
            "email",
            "user_profile_picture",
            "user_role",
          ],
        },
      ],
      attributes: ["id", "chatRoomId", "userId", "userName", "joinedAt"],
    });

    let chatroomsWithParticipants = chatrooms.map((chatroom) => {
      const chatroomParticipants = participants.filter(
        (p) => p.chatRoomId === chatroom.id
      );
      const recentMessage = chatroom.messages ? chatroom.messages[0] : null;
      const unreadCount = unreadCountByChatroom[chatroom.id] || 0;

      return {
        ...chatroom.toJSON(),
        Participants: chatroomParticipants,
        RecentMessage: recentMessage,
        unreadCount,
        hasUnread: unreadCount > 0,
      };
    });

    // Step 4: Apply search filter (if any)
    if (search) {
      const lowerSearch = search.toLowerCase();

      chatroomsWithParticipants = chatroomsWithParticipants.filter((chatroom) => {
        const chatroomNameMatches = chatroom.name?.toLowerCase().includes(lowerSearch);
        const participantMatches = chatroom.Participants.some((p) => {
          const fullName = `${p.user.user_fname} ${p.user.user_lname}`.toLowerCase();
          return fullName.includes(lowerSearch);
        });
        return chatroomNameMatches || participantMatches;
      });

      // Sort filtered: private → group → recent
      chatroomsWithParticipants.sort((a, b) => {
        if (a.type === "private" && b.type === "group") return -1;
        if (a.type === "group" && b.type === "private") return 1;
        const dateA = a.RecentMessage ? new Date(a.RecentMessage.createdAt) : 0;
        const dateB = b.RecentMessage ? new Date(b.RecentMessage.createdAt) : 0;
        return dateB - dateA;
      });
    }

    // Step 5: Sort by latest message
    chatroomsWithParticipants.sort((a, b) => {
      const dateA = a.RecentMessage ? new Date(a.RecentMessage.createdAt) : 0;
      const dateB = b.RecentMessage ? new Date(b.RecentMessage.createdAt) : 0;
      return dateB - dateA;
    });

    // Step 6: Count total chatrooms (for pagination)
    const totalCount = await Chatroom.count({
      include: [
        {
          model: Participant,
          required: true,
          where: { userId: userDecoded.user.id },
          attributes: [],
        },
      ],
    });

    const totalPages = Math.ceil(totalCount / size);

    const response = {
      pageIndex: page,
      pageSize: size,
      totalItems: totalCount,
      totalPages,
      chatrooms: chatroomsWithParticipants,
    };

    // Step 7: Cache result (30 min)
    await redisClient.setEx(cacheKey, 1800, JSON.stringify(response));

    return sendSuccess(res, response);
  } catch (error) {
    console.error("Error in getAllChatrooms:", error);
    return sendError(res, error, "Failed to retrieve chatrooms.");
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

            // clear cache for the participants as well as the creator
            const userDecoded = decodeToken(token);
            const affectedUserIds = new Set([...participants, userDecoded.user.id]); // Use Set to avoid duplicates

            for (const userId of affectedUserIds) {
                await clearChatroomsCache(userId);
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
