const Message = require('../models/Message'); // Import Message model
const Subscription = require('../models/Subscription'); // Import Message model
const User = require('../models/User'); // Import User model
const webPush = require('web-push');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
} = require("../../utils/methods");

// Fetch messages by chatroom ID
exports.getMessagesByChatroom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { chatroomId } = req.params;

        try {
            const messages = await Message.findAll({
                where: { chatroomId },
                include: [
                    {
                        model: User,
                        as: 'sender', // Use the alias defined in the model
                        attributes: ['id', 'user_fname', 'user_lname'], // Fetch only the necessary fields
                    },
                ],
                order: [['createdAt', 'ASC']],
            });

            return sendSuccess(res, messages);
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
                        attributes: ['id', 'user_fname', 'user_lname'], // Fetch sender's details
                    },
                ],
            });

            // Fetch the subscriptions for the sender's user (assuming users want notifications for messages)
            const subscriptions = await Subscription.findAll({
                where: { userId: senderId }, // Find subscriptions for the specific user
            });

            // Send notifications to all the users subscribed to this sender
            const pushPromises = subscriptions.map(async (subscription) => {
                //const subscriptionObject = JSON.parse(subscription.subscription);
                // const subscriptionObject1 = JSON.parse(subscriptionObject);

                // const isDevelopment = process.env.NODE_ENV === 'development';
                // const subscriptionToUse = isDevelopment ? subscriptionObject1 : subscriptionObject;

                try {
                    await webPush.sendNotification(subscription.subscription, JSON.stringify({
                        title: `New message from ${fullMessage.sender.user_fname} ${fullMessage.sender.user_lname}`,
                        body: content,
                        icon: '/images/icon.png', // Example, replace with actual icon
                    }));
                } catch (error) {
                    console.error('Error sending push notification:', error);
                }
            });

            // Wait for all notifications to be sent
            await Promise.all(pushPromises);

            // Emit the new message to the chatroom via Socket.IO
            if (io) {
                io.to(chatroomId).emit('new_message', fullMessage);
            }

            return sendSuccess(res, fullMessage);
        } catch (error) {
            console.error('Error sending message:', error);
            return sendError(res, error, 'Failed to send message.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};


