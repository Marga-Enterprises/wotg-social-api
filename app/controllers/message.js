const Message = require('../models/Message'); // Import Message model
const Subscription = require('../models/Subscription'); // Import Message model
const Participant = require('../models/Participant'); // Import Message model
const Chatroom = require('../models/Chatroom'); // Import Message model
const User = require('../models/User'); // Import User model
const webPush = require('web-push');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

// Fetch messages by chatroom ID
exports.getMessagesByChatroom = async (req, res) => {
    let token = getToken(req.headers);  // Get token from request headers
    if (token) {
        const userDecoded = decodeToken(token); // Decode the token to get user info

        const { chatroomId } = req.params;  // Get chatroomId from request parameters

        try {
            // Check if the user is a participant of the specified chatroom
            const participant = await Participant.findOne({
                where: { chatRoomId: chatroomId, userId: userDecoded.user.id },  // Check if the user is a participant
            });

            if (!participant) {
                return sendErrorUnauthorized(res, "", "You are not a participant of this chatroom.");
            }

            // If the user is a participant, fetch messages from the chatroom
            const messages = await Message.findAll({
                where: { chatroomId },
                include: [
                    {
                        model: User,
                        as: 'sender',  // Use alias defined in the model
                        attributes: ['id', 'user_fname', 'user_lname'],  // Fetch only the necessary fields
                    },
                ],
                order: [['createdAt', 'ASC']],  // Order messages by createdAt in ascending order
            });

            return sendSuccess(res, messages);  // Return success with messages
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
    let token = getToken(req.headers);
    if (token) {
        const { content, senderId, chatroomId } = req.body;

        try {
            // Save the new message
            const message = await Message.create({
                content,
                senderId,
                chatroomId,
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

            // Get participants of the chatroom
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

            const filteredParticipants = participants.filter((participant) => participant.user.id !== senderId);

            // Loop through each participant and send push notification
            const pushPromises = filteredParticipants.map(async (participant) => {
                const subscription = await Subscription.findOne({
                    where: { userId: participant.user.id },
                });

                if (subscription) {
                    const subscriptionObject = JSON.parse(subscription.subscription);
                    const isDevelopment = process.env.NODE_ENV === 'development';
                    const subscriptionToUse = isDevelopment ? JSON.parse(subscriptionObject) : subscriptionObject;

                    try {
                        // Send notification to each user with valid subscription
                        await webPush.sendNotification(subscriptionToUse, JSON.stringify({
                            title: `New message from ${fullMessage.sender.user_fname} ${fullMessage.sender.user_lname}`,
                            body: content,
                        }));
                    } catch (error) {
                        console.error('Error sending push notification:', error);
                    }
                }
            });

            // Wait for all notifications to be sent
            await Promise.all(pushPromises);

            return sendSuccess(res, fullMessage);
        } catch (error) {
            console.error('Error sending message:', error);
            return sendError(res, error, 'Failed to send message.', 500);
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};



