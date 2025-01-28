const Message = require('../models/Message'); // Import Message model
const Chatroom = require('../models/Chatroom'); // Import Message model
const Subscription = require('../models/Subscription'); // Import Message model
const Participant = require('../models/Participant'); // Import Message model
const MessageReadStatus = require('../models/MessageReadStatus'); // Import Message model
const User = require('../models/User'); // Import User model
const webPush = require('web-push');
const upload = require('./upload');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

exports.getMessagesByChatroom = async (req, res, io) => {
    let token = getToken(req.headers); // Get token from request headers
    if (token) {
        const userDecoded = decodeToken(token); // Decode the token to get user info

        const { chatroomId } = req.params; // Get chatroomId from request parameters

        try {
            // Check if the user is a participant of the specified chatroom
            const participant = await Participant.findOne({
                where: { chatRoomId: chatroomId, userId: userDecoded.user.id },
            });

            if (!participant) {
                return sendErrorUnauthorized(res, "", "You are not a participant of this chatroom.");
            }

            // Fetch the chatroom details
            const chatroom = await Chatroom.findOne({
                where: { id: chatroomId },
                include: [
                    {
                        model: Participant,
                        as: 'Participants',
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['id', 'user_fname', 'user_lname'],
                            },
                        ],
                    },
                ],
            });

            if (!chatroom) {
                return sendError(res, null, "Chatroom not found.");
            }

            // Fetch messages from the chatroom
            const messages = await Message.findAll({
                where: { chatroomId },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'user_fname', 'user_lname'], // Fetch only the necessary fields
                    },
                ],
                order: [['createdAt', 'ASC']], // Order messages by createdAt in ascending order
            });

            // Identify unread messages for the user
            const unreadMessageIds = messages
                .filter(message => message.sender.id !== userDecoded.user.id) // Ignore messages sent by the user
                .map(message => message.id);

            if (unreadMessageIds.length > 0) {
                // Update unread messages to "read"
                await MessageReadStatus.update(
                    { read: true },
                    {
                        where: {
                            messageId: unreadMessageIds,
                            userId: userDecoded.user.id,
                            read: false, // Only update unread messages
                        },
                    }
                );

                // Emit real-time updates to other participants
                const participants = await Participant.findAll({
                    where: { chatRoomId: chatroomId },
                    attributes: ['userId'],
                });

                participants.forEach(async participant => {
                    const unreadCount = await MessageReadStatus.count({
                        where: {
                            userId: participant.userId,
                            read: false,
                        },
                        include: [
                            {
                                model: Message,
                                as: 'message',
                                attributes: [],
                                where: { chatroomId },
                            },
                        ],
                    });

                    // Emit the updated unread count for each participant
                    io.to(`user_${participant.userId}`).emit('unread_update', {
                        chatroomId,
                        unreadCount,
                    });
                });

                // Emit a real-time event to notify this user about marked-as-read messages
                io.to(chatroomId).emit('message_read', {
                    userId: userDecoded.user.id,
                    messageIds: unreadMessageIds,
                });
            }

            return sendSuccess(res, {
                chatroom, // Include chatroom details
                messages, // Include messages
            });
        } catch (error) {
            console.error('Error fetching messages:', error);
            return sendError(res, error, 'Failed to retrieve messages.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};




// Save a new message and broadcast it
exports.sendMessage = async (req, res, io) => {
    // Use the multer middleware for handling file uploads
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return sendError(res, err, 'Failed to upload file.', 500);
        }

        const token = getToken(req.headers);
        if (!token) {
            return sendErrorUnauthorized(res, '', 'Please login first.');
        }

        const { senderId, chatroomId } = req.body;

        // Check if a file was uploaded
        const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

        try {
            // If a file is uploaded, use the file URL as the content
            const content = fileUrl || req.body.content;

            // Save the new message with or without file URL
            const message = await Message.create({
                content,
                senderId,
                chatroomId,
                fileUrl, // Save file URL if present
            });

            // Fetch the message with sender details to return in the response
            const fullMessage = await Message.findOne({
                where: { id: message.id },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'user_fname', 'user_lname'],
                    },
                ],
            });

            if (io) {
                io.to(chatroomId).emit('new_message', fullMessage);
            }

            // Process the participants and handle unread status, notifications, etc. (no changes needed here)
            const participants = await Participant.findAll({
                where: { chatRoomId: chatroomId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'user_fname', 'user_lname'],
                    },
                ],
            });

            const filteredParticipants = participants.filter(
                (participant) => participant.user.id !== senderId
            );

            const readStatusPromises = filteredParticipants.map((participant) =>
                MessageReadStatus.create({
                    messageId: message.id,
                    userId: participant.user.id,
                    read: false, // Default to "unread"
                })
            );

            await Promise.all(readStatusPromises);

            for (const participant of filteredParticipants) {
                const unreadCount = await MessageReadStatus.count({
                    where: {
                        userId: participant.user.id,
                        read: false,
                    },
                    include: [
                        {
                            model: Message,
                            as: 'message',
                            attributes: [],
                            where: { chatroomId },
                        },
                    ],
                });

                io.to(`user_${participant.user.id}`).emit('unread_update', {
                    chatroomId,
                    unreadCount,
                });
            }

            const pushPromises = filteredParticipants.map(async (participant) => {
                const subscription = await Subscription.findOne({
                    where: { userId: participant.user.id },
                });

                if (subscription) {
                    const subscriptionObject = JSON.parse(subscription.subscription);
                    try {
                        await webPush.sendNotification(subscriptionObject, JSON.stringify({
                            title: `New message from ${fullMessage.sender.user_fname} ${fullMessage.sender.user_lname}`,
                            body: content,
                            file: fileUrl, // Include file link in the notification if present
                        }));
                    } catch (error) {
                        console.error('Error sending push notification:', error);
                    }
                }
            });

            await Promise.all(pushPromises);

            return sendSuccess(res, fullMessage);
        } catch (error) {
            console.error('Error sending message:', error);
            return sendError(res, error, 'Failed to send message.', 500);
        }
    });
};






