const Message = require('../models/Message'); // Import Message model
const GuestBotState = require('../models/GuestBotState'); // Import Message model
const Chatroom = require('../models/Chatroom'); // Import Message model
const Subscription = require('../models/Subscription'); // Import Message model
const Participant = require('../models/Participant'); // Import Message model
const MessageReadStatus = require('../models/MessageReadStatus'); // Import Message model
const MessageReact = require('../models/MessageReactions'); // Import Message model
const User = require('../models/User'); // Import User model

const { uploadFileToSpaces } = require('./spaceUploader');
const uploadMemory = require('./uploadMemory');

const { sendNotification } = require('../../utils/sendNotification'); // Import FCM notification function

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    processImageToSpace
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
                                attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'],
                            },
                        ],
                    },
                ],
            });

            if (!chatroom) {
                return sendError(res, null, "Chatroom not found.");
            }

            // Fetch messages from the chatroom **including reactions**
            const messages = await Message.findAll({
                where: { chatroomId },
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'], // Fetch only the necessary fields
                    },
                    {
                        model: MessageReact, // Include reactions
                        as: 'reactions',
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'], // Fetch only the necessary fields
                            },
                        ],
                        attributes: ['id', 'react', 'userId', 'messageId', 'createdAt'],
                    },
                ],
                order: [['createdAt', 'DESC']], // Order messages by createdAt in ascending order
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
                messages, // Include messages with reactions
            });
        } catch (error) {
            console.error('Error fetching messages:', error);
            return sendError(res, error, 'Failed to retrieve messages.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

exports.sendTextMessage = async (req, res, io) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

  const { content, senderId, chatroomId, type } = req.body;
  if (!content || !senderId || !chatroomId) {
    return sendError(res, '', 'Missing required fields.');
  }

  try {
    const fullMessage = await createAndEmitMessage({ 
        content, 
        senderId, 
        chatroomId, 
        type, 
        category: 'normal',
        io 
    });
    return sendSuccess(res, fullMessage);
  } catch (error) {
    console.error('❌ sendTextMessage error:', error);
    return sendError(res, error, 'Failed to send message.');
  }
};  

exports.sendBotMessage = async (req, res, io) => {
    const token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

    const { senderId, receiverFname, receiverLname } = req.body; 
    if (!senderId) {
        return sendError(res, '', 'Missing required fields.');
    }

    try {
        const fullMessage = await createAndEmitMessage({
            content: 
              `Welcome aboard, Guests!\n
              Para mas madali ka naming tawagin sa iyong pangalan at ma-assist nang maayos, pakisagot po ito:\n
              1. Full Name\n
              2. Last Name\n
              3. Email\n
              4. Phone Number\n
              5. Mobile Number\n
              6. FB Messenger Name`,
            senderId,
            chatroomId: 7,
            type: 'text', 
            category: 'automated',
            io
        });

        return sendSuccess(res, fullMessage);
    } catch (error) {
        console.error('❌ sendBotMessage error:', error);
        return sendError(res, error, 'Failed to send bot message.');
    }
};

exports.sendFileMessage = (req, res, io) => {
  uploadMemory.single('file')(req, res, async (err) => {
    if (err) return sendError(res, err, 'Failed to upload file.', 500);

    const token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

    const { senderId, chatroomId, type } = req.body;

    if (!req.file || !senderId || !chatroomId) {
      return sendError(res, '', 'Missing file or required fields.');
    }

    let finalFileName = req.file.filename;

    try {
      const convertedFilename = await processImageToSpace(req.file);
      const processedImage = await uploadFileToSpaces(convertedFilename);
      if (processedImage) finalFileName = processedImage;
      
    } catch (error) {
      console.error('[[[[[[[[[IMAGE CONVERSION FAILED]]]]]]]]]', error);
      return sendError(res, error, 'Image conversion failed.');
    }

    // ✅ Construct content like a JSON request
    const content = finalFileName;

    // ✅ Instead of calling sendTextMessage(req, res, io)
    // 👉 Call the internal helper with same structure
    const fullMessage = await createAndEmitMessage({
      content,
      senderId,
      chatroomId,
      type,
      io
    });

    // ✅ Response same as JSON flow
    return sendSuccess(res, fullMessage);
  });
};

exports.reactToMessage = async (req, res, io) => {
    const token = getToken(req.headers);
    if (!token) {
        return sendErrorUnauthorized(res, '', 'Please login first.');
    }

    const userDecoded = decodeToken(token);
    const userId = userDecoded.user.id;
    const { messageId, react } = req.body;

    try {
        // Fetch the message and its sender
        const message = await Message.findOne({ 
            where: { id: messageId },
            include: [{ 
                model: User, 
                as: 'sender', 
                attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'] // Fetch only the necessary fields
            }]
        });

        if (!message) {
            return sendError(res, null, 'Message not found.', 404);
        }

        // Prevent user from reacting to their own message (optional)
        if (message.sender.id === userId) {
            return sendError(res, null, "You can't react to your own message.", 400);
        }

        // Create reaction
        const reaction = await MessageReact.create({
            messageId,
            userId,
            react,
        });

        // Fetch full reaction details with user info
        const fullReaction = await MessageReact.findOne({
            where: { id: reaction.id },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
            ],
        });

        // Emit real-time event for the reaction
        if (io) {
            io.to(message.chatroomId).emit('new_message_reaction', fullReaction);
        }

        // ✅ SEND PUSH NOTIFICATION TO MESSAGE SENDER (not the reacter)
        const subscriptions = await Subscription.findAll({
            where: { userId: message.sender.id }, // Ensure only the sender gets the notification
        });

        if (subscriptions.length > 0) {
            // Reaction emoji mapping
            const reactionEmojis = {
                "heart": "❤️",
                "pray": "🙏",
                "praise": "🙌",
                "clap": "👏"
            };

            const reactionEmoji = reactionEmojis[react] || ""; // Default to empty if reaction is unknown

            // Send notifications to all subscribed devices of the sender
            const sendPromises = subscriptions.map(async (subscription) => {
                try {
                    let subscriptionData = subscription.subscription;

                    if (typeof subscriptionData === "string") {
                        try {
                            subscriptionData = JSON.parse(subscriptionData); // Convert string to object
                        } catch (error) {
                            console.error("Error parsing subscription JSON:", error);
                        }
                    }
                    
                    const fcmToken = subscriptionData?.fcmToken; // Access safely
                    
                    if (fcmToken) {
                        await sendNotification(
                            fcmToken,
                            'WOTG Community',
                            `${fullReaction.user.user_fname} ${fullReaction.user.user_lname} reacted ${reactionEmoji} to your message`
                        );
                    }
                } catch (error) {
                    console.error('Error sending push notification:', error);
                }
            });

            await Promise.all(sendPromises);
        }

        return sendSuccess(res, fullReaction);
    } catch (error) {
        console.error('Error reacting to message:', error);
        return sendError(res, error, 'Failed to react to message.', 500);
    }
};

exports.sendBotReply = async ({ message, userId, chatroomId, io }) => {
  try {
    const content = message.content.trim();
    let botState = await GuestBotState.findOne({ where: { userId } });

    if (!botState || botState.currentStep === 'completed') return;

    switch (botState.currentStep) {
      case 'awaiting_name':
        if (/^[a-zA-Z\s]{2,}$/.test(content)) {
          botState.fullName = content;
          botState.currentStep = 'awaiting_email';
          await botState.save();
          return sendBot({
            chatroomId,
            content: `Salamat, ${content}! 🙌\nMasaya kaming makilala ka.\nAno naman ang iyong email address para maipadala namin ang mga updates at resources sa’yo?`,
            io
          });
        } else {
          return sendBot({
            chatroomId,
            content: `Hehe, puwede ko bang malaman ang **buong pangalan mo**? Halimbawa: Juan Dela Cruz 😊`,
            io
          });
        }

      case 'awaiting_email':
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
          botState.email = content;
          botState.currentStep = 'awaiting_mobile';
          await botState.save();
          return sendBot({
            chatroomId,
            content: `Nice! ✅\nAno naman ang iyong **mobile number**, para makapagpadala kami ng reminders at mabilis na updates? (Promise, walang spam 😇)`,
            io
          });
        } else {
          return sendBot({
            chatroomId,
            content: `Hmm, parang hindi valid email ‘yan. Puwede mo bang i-type ulit? 📧`,
            io
          });
        }

      case 'awaiting_mobile':
        if (/^(09|\+639)\d{9}$/.test(content)) {
          botState.mobile = content;
          botState.currentStep = 'awaiting_fb_name';
          await botState.save();
          return sendBot({
            chatroomId,
            content: `Perfect 👍\nLast na lang—ano ang iyong **Facebook Messenger name**, para madali kang mahanap ng volunteer natin at makausap ka nang personal?`,
            io
          });
        } else {
          return sendBot({
            chatroomId,
            content: `Parang hindi valid number ‘yan. Puwede mo bang i-check at i-send ulit? 📱`,
            io
          });
        }

      case 'awaiting_fb_name':
        if (content.length >= 2) {
          botState.fbName = content;
          botState.currentStep = 'completed';
          await botState.save();
          return sendBot({
            chatroomId,
            content: `🎉 Salamat, ${botState.fullName}!\nKumpleto na. May volunteer na lalapit sa’yo dito para makausap ka at i-guide sa susunod na steps.\nHabang hinihintay mo, eto muna ang isang maikling mensahe para sa’yo 👉 [insert link/video]`,
            io
          });
        } else {
          return sendBot({
            chatroomId,
            content: `Sige lang, paki-send ng **Messenger name** mo para ma-contact ka namin. 😊`,
            io
          });
        }

      default:
        return;
    }

  } catch (error) {
    console.error("❌ Bot Reply Error:", error);
  }
};

const sendBot = async ({ chatroomId, content, io }) => {
  const message = await Message.create({
    content,
    senderId: 10,
    chatroomId,
    type: 'text',
    category: 'automated'
  });

  const fullMessage = await Message.findOne({
    where: { id: message.id },
    attributes: ['id', 'content', 'senderId', 'chatroomId', 'type', 'category', 'createdAt'],
    include: [
      {
        model: User,
        as: 'sender',
        attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'],
      },
      {
        model: Chatroom,
        as: 'chatroom',
        include: [
          {
            model: Participant,
            as: 'Participants',
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'],
              }
            ]
          }
        ]
      }
    ]
  });

  io.to(chatroomId).emit('new_message', fullMessage);

  const participants = await Participant.findAll({
    where: { chatRoomId: chatroomId },
    include: [{ model: User, as: 'user', attributes: ['id', 'user_fname', 'user_lname'] }]
  });

  const recipients = participants.filter(p => p.user.id !== 10);

  await Promise.all(recipients.map(participant =>
    MessageReadStatus.create({
      messageId: message.id,
      userId: participant.user.id,
      read: false
    })
  ));

  for (const participant of recipients) {
    const unreadCount = await MessageReadStatus.count({
      where: { userId: participant.user.id, read: false },
      include: [{ model: Message, as: 'message', attributes: [], where: { chatroomId } }]
    });

    io.to(`user_${participant.user.id}`).emit('unread_update', {
      chatroomId,
      unreadCount
    });

    const subscriptions = await Subscription.findAll({ where: { userId: participant.user.id } });
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        const subData = typeof subscription.subscription === 'string'
          ? JSON.parse(subscription.subscription)
          : subscription.subscription;

        const fcmToken = subData?.fcmToken;
        if (fcmToken) {
          await sendNotification(
            fcmToken,
            `Bagong mensahe mula sa admin`,
            content
          );
        }
      } catch (err) {
        console.error('❌ Push notification error:', err);
      }
    }));
  }

  return fullMessage;
};

const createAndEmitMessage = async ({ content, senderId, chatroomId, type, category, io }) => {
  const message = await Message.create({ content, senderId, chatroomId, type, category });

  const fullMessage = await Message.findOne({
    where: { id: message.id },
    attributes: ['id', 'content', 'senderId', 'chatroomId', 'type', 'category', 'createdAt'],
    include: [
        {
            model: User,
            as: 'sender',
            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role', 'user_role'], 
        },
        {
            model: Chatroom,
            as: 'chatroom',
            include: [
                {
                    model: Participant,
                    as: 'Participants',
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture', 'user_role'], // Fetch only the necessary fields
                        }
                    ]
                }
            ]
        }
    ]
  });

  io.to(chatroomId).emit('new_message', fullMessage);

  const participants = await Participant.findAll({
    where: { chatRoomId: chatroomId },
    include: [{ model: User, as: 'user', attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'] }]
  });

  const filteredParticipants = participants.filter(p => p.user.id !== senderId);

  await Promise.all(filteredParticipants.map(participant =>
    MessageReadStatus.create({
      messageId: message.id,
      userId: participant.user.id,
      read: false
    })
  ));

  // Emit unread count
  for (const participant of filteredParticipants) {
    const unreadCount = await MessageReadStatus.count({
      where: { userId: participant.user.id, read: false },
      include: [{ model: Message, as: 'message', attributes: [], where: { chatroomId } }]
    });

    io.to(`user_${participant.user.id}`).emit('unread_update', {
      chatroomId,
      unreadCount
    });
  }

  // Send push notifications
  await Promise.all(filteredParticipants.map(async (participant) => {
    const subscriptions = await Subscription.findAll({ where: { userId: participant.user.id } });

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        const subData = typeof subscription.subscription === 'string'
          ? JSON.parse(subscription.subscription)
          : subscription.subscription;

        const fcmToken = subData?.fcmToken;
        if (fcmToken) {
          await sendNotification(
            fcmToken,
            `New message from ${fullMessage.sender.user_fname} ${fullMessage.sender.user_lname}`,
            fullMessage.type === 'file' ? 'Sent an image' : content
          );
        }
      } catch (err) {
        console.error('❌ Push notification error:', err);
      }
    }));
  }));

  return fullMessage;
};


