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
const bcrypt = require('bcryptjs');
const nodemailer = require("nodemailer");
const { sendNotification } = require('../../utils/sendNotification'); // Import FCM notification function

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    generateAccessToken,
    processImageToSpace
} = require("../../utils/methods");

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com", // Hostinger's SMTP server
  port: 465, // Use 465 for SSL, or 587 for STARTTLS
  secure: true, // True for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER, // Your Hostinger email (e.g., no-reply@yourdomain.com)
    pass: process.env.EMAIL_PASS, // Your Hostinger email password
  },
});

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
    return sendErrorUnauthorized(res, "", "Please login first.");
  }

  const userDecoded = decodeToken(token);
  const userId = userDecoded.user.id;
  const { messageId, react } = req.body;

  try {
    // ✅ Fetch the message and its sender
    const message = await Message.findOne({
      where: { id: messageId },
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "user_fname", "user_lname", "user_profile_picture", "user_role"],
        },
      ],
    });

    if (!message) {
      return sendError(res, null, "Message not found.", 404);
    }

    // ✅ Optional: prevent self-reactions
    if (message.sender.id === userId) {
      return sendError(res, null, "You can't react to your own message.", 400);
    }

    // ✅ Create new reaction record
    const reaction = await MessageReact.create({ messageId, userId, react });

    // ✅ Fetch full reaction details with user info
    const fullReaction = await MessageReact.findOne({
      where: { id: reaction.id },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "user_fname", "user_lname", "user_profile_picture"],
        },
      ],
    });

    // ✅ Emit real-time event to all clients in this chatroom
    if (io) {
      io.to(message.chatroomId).emit("new_message_reaction", fullReaction);
    }

    // ✅ Prepare reaction emoji mapping
    const reactionEmojis = {
      heart: "❤️",
      pray: "🙏",
      praise: "🙌",
      clap: "👏",
    };
    const reactionEmoji = reactionEmojis[react] || "";

    // ✅ Notify the message sender via push notification
    const subscriptions = await Subscription.findAll({ where: { userId: message.sender.id } });

    if (subscriptions.length > 0) {
      console.log(`🔔 Sending reaction notification to ${subscriptions.length} subscriber(s)...`);

      // Handle all subscriptions concurrently, safely
      const results = await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          try {
            let subscriptionData = subscription.subscription;

            // Parse safely if stored as a string
            if (typeof subscriptionData === "string") {
              try {
                subscriptionData = JSON.parse(subscriptionData);
              } catch (error) {
                console.error("⚠️ Error parsing subscription JSON:", error);
                return; // skip invalid entry
              }
            }

            const fcmToken = subscriptionData?.fcmToken;
            if (!fcmToken) return;

            // ✅ Construct consistent data payload for SW + util
            const data = {
              type: "chat_reaction",
              chatroomId: String(message.chatroomId),
              messageId: String(message.id),
              url: `https://community.wotgonline.com/chat?chat=${message.chatroomId}`,
            };

            const title = "WOTG Community";
            const body = `${fullReaction.user.user_fname} ${fullReaction.user.user_lname} reacted ${reactionEmoji} to your message`;

            // ✅ Uses updated sendNotification util (Android + Web optimized)
            await sendNotification(fcmToken, title, body, data);
          } catch (err) {
            console.error("❌ Error sending push notification:", err);
          }
        })
      );

      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.filter((r) => r.status === "rejected").length;
      console.log(`✅ Reaction notifications summary: ${successCount} sent, ${failCount} failed`);
    } else {
      console.log("ℹ️ No subscriptions found for this user.");
    }

    return sendSuccess(res, fullReaction);
  } catch (error) {
    console.error("🔥 Error reacting to message:", error);
    return sendError(res, error, "Failed to react to message.", 500);
  }
};

exports.sendBotReply = async (req, res, io) => {
  const token = getToken(req.headers);
  let triggerRefresh = false;
  let accessToken = null;
  if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

  const { message, userId, chatroomId } = req.body;
  const content = message.content.trim();

  const menupageLink = process.env.NODE_ENV === "development"
    ? `http://localhost:3000/`
    : `https://community.wotgonline.com/`;

  try {
    let botState = await GuestBotState.findOne({ where: { userId } });
    let user; // Declare globally here 👈

    if (!botState) {
      botState = await GuestBotState.create({
        userId,
        currentStep: 'awaiting_name'
      });
    } else if (botState.currentStep === 'completed') {
      return sendSuccess(res, { status: 'done' }, 'Bot flow is already completed.');
    }

    let botReply;

    switch (botState.currentStep) {
      case 'awaiting_name':
        if (/^[a-zA-Z\s]{2,}$/.test(content)) {
          botState.firstName = content.trim();
          botState.currentStep = 'awaiting_lname';
          await botState.save();
          botReply = `Salamat, ${content.trim()}! \nPaki-share naman ang iyong apelyido.\nHalimbawa: Dela Cruz`;
        } else {
          botReply = `Pakisulat muna ang iyong unang pangalan.\nHalimbawa: Juan`;
        }
        break;

      case 'awaiting_lname':
        if (/^[a-zA-Z\s]{2,}$/.test(content)) {
          botState.lastName = content.trim();
          botState.currentStep = 'awaiting_email';
          await botState.save();
          botReply = `Ayos, ${botState.firstName} ${botState.lastName}! \nNgayon, ano naman ang iyong email address?\nHalimbawa: juandelacruz@email.com`;
        } else {
          botReply = `Pakisulat ang iyong apelyido.\nHalimbawa: Dela Cruz`;
        }
        break;

      case 'awaiting_email':
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content)) {
          user = await User.findOne({ where: { email: content.trim() } }); // Check kung existing na
          if (user) {
            botReply = `Pasensya na, naka-register na ang email na ito. \nPaki-try ang ibang email address.`;
            break;
          }

          botState.email = content.trim();
          botState.currentStep = 'awaiting_mobile';
          await botState.save();
          botReply = `Salamat! \nNgayon naman, pakibigay ang iyong mobile number para makapadala kami ng mga paalala at balita.\nHalimbawa: 09171234567 o +639171234567`;
        } else {
          botReply = `Mukhang hindi tama ang format ng email. \nPakisubukan ulit.\nHalimbawa: juandelacruz@email.com`;
        }
        break;

      case 'awaiting_mobile':
        if (/^(?:\+?\d{1,4}|0)\d{9,14}$/.test(content)) {
          botState.mobile = content.trim();
          botState.currentStep = 'awaiting_fb_name';
          await botState.save();
          botReply = `Okay, salamat! \nHuli na lang—ano ang iyong Facebook Messenger name para mas madali kang makausap ng volunteer namin.\nHalimbawa: Juan Miguel Dela Cruz o JM Cruz`;
        } else {
          botReply = `Mukhang may mali sa number. \nPaki-type ulit.\nHalimbawa: 09171234567 o +639171234567`;
        }
        break;

      case 'awaiting_fb_name':
        if (content.length >= 2) {
          botState.fbName = content.trim();
          botState.currentStep = 'completed';
          await botState.save();

          botReply = `Salamat, ${botState.firstName} ${botState.lastName}! \nKumpleto na ang iyong registration. \n\nNarito ang iyong mga detalye:\nEmail: ${botState.email}\nPassword: ang inilagay mong mobile number (${botState.mobile})\n\nPwede mong bisitahin ang ating community page dito: ${menupageLink}\n\nMay volunteer na lalapit sa iyo para makausap ka at ipaliwanag ang mga susunod na hakbang.`;

          // Update User once complete
          user = await User.findOne({ where: { id: userId } });
          if (user && user.user_role === 'guest') {
            const hashedPassword = await bcrypt.hash(botState.mobile, 10);
            await user.update({
              user_role: 'member',
              user_fname: botState.firstName,
              user_lname: botState.lastName,
              user_mobile: botState.mobile,
              email: botState.email,
              password: hashedPassword,
              user_social_media: botState.fbName
            });

            accessToken = generateAccessToken(user);
            triggerRefresh = true;
          }
        } else {
          botReply = `Pakisulat ang iyong Messenger name para makontak ka namin.`;
        }
        break;

      default:
        botReply = `Nagkaroon ng kaunting problema. Subukan mong i-refresh o i-type ulit.`;
        break;
    }

    // Send the message to chatroom
    await sendBot({ chatroomId, content: botReply, io });

    return sendSuccess(res, { step: botState.currentStep, reply: botReply, triggerRefresh, user, accessToken }, 'Bot reply sent.');
  } catch (error) {
    console.error('❌ sendBotReply error:', error);
    return sendError(res, error, 'Failed to send bot reply.');
  }
};


const sendBot = async ({ chatroomId, content, io }) => {
  return await createAndEmitMessage({
    content,
    senderId: 10,
    chatroomId,
    type: 'text',
    category: 'automated',
    io
  });
};


const createAndEmitMessage = async ({ content, senderId, chatroomId, type, category, io }) => {
  // 1️⃣ Save the message
  const message = await Message.create({ content, senderId, chatroomId, type, category });

  // 2️⃣ Fetch full message with sender & participants
  const fullMessage = await Message.findOne({
    where: { id: message.id },
    attributes: ["id", "content", "senderId", "chatroomId", "type", "category", "createdAt"],
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "user_fname", "user_lname", "user_profile_picture", "user_role"],
      },
      {
        model: Chatroom,
        as: "chatroom",
        include: [
          {
            model: Participant,
            as: "Participants",
            include: [
              {
                model: User,
                as: "user",
                attributes: [
                  "id",
                  "user_fname",
                  "user_lname",
                  "user_profile_picture",
                  "user_role",
                  "email",
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  // 3️⃣ Emit the new message to connected sockets
  io.to(chatroomId).emit("new_message", fullMessage);

  // 4️⃣ Get all chat participants except the sender
  const participants = await Participant.findAll({
    where: { chatRoomId: chatroomId },
    include: [{ model: User, as: "user", attributes: ["id", "user_fname", "user_lname", "user_profile_picture", "email"] }],
  });

  const recipients = participants.filter((p) => p.user.id !== senderId);

  // 5️⃣ Save unread flags in bulk (avoids n separate inserts)
  await MessageReadStatus.bulkCreate(
    recipients.map((p) => ({ messageId: message.id, userId: p.user.id, read: false })),
    { ignoreDuplicates: true }
  );

  // 6️⃣ Emit unread counts concurrently
  await Promise.all(
    recipients.map(async (p) => {
      const unreadCount = await MessageReadStatus.count({
        where: { userId: p.user.id, read: false },
        include: [{ model: Message, as: "message", attributes: [], where: { chatroomId } }],
      });
      io.to(`user_${p.user.id}`).emit("unread_update", { chatroomId, unreadCount });
    })
  );

  // 7️⃣ Push Notifications ----------------------------------------------------
  const chatUrl =
    process.env.NODE_ENV === "development"
      ? `http://localhost:3000/chat?chat=${chatroomId}`
      : `https://community.wotgonline.com/chat?chat=${chatroomId}`;

  await Promise.allSettled(
    recipients.map(async (p) => {
      const subscriptions = await Subscription.findAll({ where: { userId: p.user.id } });
      if (!subscriptions.length) return;

      await Promise.allSettled(
        subscriptions.map(async (s) => {
          try {
            const subData = typeof s.subscription === "string" ? JSON.parse(s.subscription) : s.subscription;
            const fcmToken = subData?.fcmToken;
            if (!fcmToken) return;

            // Firebase requires string data values
            const data = {
              type: "chat_message",
              chatroomId: String(chatroomId),
              messageId: String(message.id),
              url: chatUrl,
            };

            const sender = fullMessage.sender;
            const title = `New message from ${sender.user_fname} ${sender.user_lname}`;
            const body = fullMessage.type === "file" ? "Sent an image 📷" : content;

            await sendNotification(fcmToken, title, body, data);
          } catch (err) {
            console.error("❌ Push notification error:", err);
          }
        })
      );
    })
  );

  // 8️⃣ Email Notifications ---------------------------------------------------
  if (recipients.length <= 4) {
    await Promise.allSettled(
      recipients.map(async (p) => {
        const recipient = p.user;
        if (!recipient.email) return;

        const sender = fullMessage.sender;
        const senderName = `${sender.user_fname} ${sender.user_lname}`;
        const preview =
          fullMessage.type === "file"
            ? "[Image file sent]"
            : content.length > 100
            ? content.slice(0, 100) + "…"
            : content;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: recipient.email,
          subject: `📩 Bagong mensahe mula kay ${senderName}`,
          text: `
Hi ${recipient.user_fname},

May bagong mensahe ka mula kay ${senderName} sa iyong Word on the Go chatroom:

"${preview}"

Mag-reply na ngayon 👉 ${chatUrl}

— WOTG System Notification
          `.trim(),
        };

        transporter.sendMail(mailOptions).catch((err) => console.error("❌ Email send error:", err));
      })
    );
  } else {
    console.log(`ℹ️ Email notification skipped (recipients > 4): ${recipients.length} users`);
  }

  return fullMessage;
};






