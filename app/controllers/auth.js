const path = require('path');

// Forcefully load environment variables from the specific path of the .env file
require('dotenv').config({
  path: path.resolve(__dirname, '.env') // Forcefully specify the path to .env
});

// Import necessary libraries
const bcrypt = require('bcryptjs'); // Change to bcryptjs
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
const validator = require('validator'); 

// Import models
const User = require('../models/User'); // Import your User model
const Message = require('../models/Message'); // Import Message model
const Chatroom = require('../models/Chatroom'); // Import Message model
const Subscription = require('../models/Subscription'); // Import Message model
const Participant = require('../models/Participant'); // Import Message model
const MessageReadStatus = require('../models/MessageReadStatus'); // Import Message model

const { sendNotification } = require('../../utils/sendNotification');

// clear cache
const { clearChatroomsCache } = require("../../utils/clearBlogCache");

// import sequelize instance
const sequelize = require('../../config/db');
const { Op } = require('sequelize');

// Import utility functions
const {
    sendError,
    sendSuccess,
    generateAccessToken,
    sendErrorUnauthorized,
} = require("../../utils/methods");

// clear cache
const { clearUsersCache } = require('../../utils/clearBlogCache');

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// controller to handle user login
exports.loginUser = async (req, res, io) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendErrorUnauthorized(res, '', 'Email and password are required.');
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return sendErrorUnauthorized(res, '', 'User not found.');
    }

    if (!user.password) {
      return sendErrorUnauthorized(res, '', 'User password is not set.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return sendErrorUnauthorized(res, '', 'Password incorrect.');
    }

    // Auto-join system chatrooms
    const chatroomIds = [5, 7];

    for (const chatroomId of chatroomIds) {
      const chatroom = await Chatroom.findByPk(chatroomId);
      if (!chatroom) continue;

      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: user.id },
        defaults: { userName: `${user.user_fname} ${user.user_lname}` },
      });
    }

    const accessToken = generateAccessToken(user);

    let participants = [user.id, 10];
    let chatroomLoginId = 0;

    // Find existing private chatroom between the two users
    const existingChatroom = await Participant.findAll({
      where: { userId: participants },
      attributes: ['chatRoomId'],
      include: [
        {
          model: Chatroom,
          attributes: [],
          where: { type: 'private' },
        },
      ],
      group: ['chatRoomId'],
      having: sequelize.literal(`COUNT(DISTINCT user_id) = 2`),
    });

    if (existingChatroom.length === 0) {
      const users = await User.findAll({
        where: { id: participants },
        attributes: ['user_fname', 'user_lname'],
      });

      const chatroomName = users
        .map((u) => `${u.user_fname} ${u.user_lname}`)
        .join(', ');

      const chatroom = await Chatroom.create({
        name: chatroomName,
        type: 'private',
      });

      const participantRecords = participants.map((id) => ({
        userId: id,
        chatRoomId: chatroom.id,
      }));

      await Participant.bulkCreate(participantRecords);

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

      if (io) {
        io.emit('new_chatroom', {
          id: chatroom.id,
          name: chatroom.name,
          type: 'private',
          createdAt: chatroom.createdAt,
          updatedAt: chatroom.updatedAt,
          messages: [],
          Participants: chatroomParticipants,
          unreadCount: 0,
          hasUnread: false,
        });
      }

      chatroomLoginId = chatroom.id;
    } else {
      chatroomLoginId = existingChatroom[0].chatRoomId;
    }

    return sendSuccess(
      res,
      { accessToken, chatroomLoginId },
      "Login successful."
    );
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};


// controller to handle user registration
exports.createUser = async (req, res, io) => {
  const {
    user_fname,
    user_lname,
    email,
    user_gender = null,
    user_mobile_number,
    user_social_media
  } = req.body;

  if (!user_fname || !user_lname || !email) {
    return sendError(res, {}, "All required fields must be filled.", 400, 101);
  }

  if (!validator.isEmail(email)) {
    return sendError(res, {}, "Invalid email format.", 400, 102);
  }

  try {
    const hashedPassword = await bcrypt.hash('12345678', 10);

    const [newUser, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        user_fname,
        user_lname,
        user_social_media,
        user_mobile_number,
        password: hashedPassword,
        user_role: "member",
        user_gender
      }
    });

    if (!created) {
      return sendErrorUnauthorized(res, {}, "Email is already in use.", 400, 103);
    }

    await clearUsersCache();

    const systemChatroomIds = [5, 7];
    const systemChatrooms = await Chatroom.findAll({
      where: { id: systemChatroomIds }
    });

    for (const chatroom of systemChatrooms) {
      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: newUser.id },
        defaults: { userName: `${newUser.user_fname} ${newUser.user_lname}` }
      });
    }

    const accessToken = generateAccessToken(newUser);

    const privateParticipantIds = [newUser.id, 10];

    const privateChatroomUsers = await User.findAll({
      where: { id: privateParticipantIds },
      attributes: ["user_fname", "user_lname"]
    });

    const privateChatroomName = privateChatroomUsers
      .map((u) => `${u.user_fname} ${u.user_lname}`)
      .join(", ");

    const privateChatroom = await Chatroom.create({
      name: privateChatroomName,
      type: "private"
    });

    const participantRecords = privateParticipantIds.map((id) => ({
      userId: id,
      chatRoomId: privateChatroom.id
    }));

    await Participant.bulkCreate(participantRecords);

    const chatroomParticipants = await Participant.findAll({
      where: { chatRoomId: privateChatroom.id },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "user_fname", "user_lname", "email"]
        }
      ],
      attributes: ["id", "chatRoomId", "userId", "userName", "joinedAt"]
    });

    const chatroomPayload = {
      id: privateChatroom.id,
      name: privateChatroom.name,
      type: "private",
      createdAt: privateChatroom.createdAt,
      updatedAt: privateChatroom.updatedAt,
      messages: [],
      Participants: chatroomParticipants,
      unreadCount: 0,
      hasUnread: false
    };

    if (io) {
      io.emit("new_chatroom", chatroomPayload);
    }

    return sendSuccess(
      res,
      { accessToken, chatroomLoginId: privateChatroom.id },
      "User created successfully!",
      201,
      0
    );

  } catch (err) {
    return res.status(500).json({ error: "Internal server error." });
  }
};


// controller to update user details through chat
exports.updateUserThroughChat = async (req, res, io) => {
  const { userId } = req.params;
  const { user_fname, user_lname, email } = req.body;

  if (!user_fname || !user_lname || !email) {
    return sendError(res, {}, "All required fields must be filled.", 400, 101);
  }

  if (!validator.isEmail(email)) {
    return sendError(res, {}, "Invalid email format.", 400, 102);
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return sendErrorUnauthorized(res, {}, "User not found.", 404, 105);
    }

    const emailInUse = await User.findOne({
      where: {
        email,
        id: { [Op.ne]: userId }
      }
    });

    if (emailInUse) {
      return sendErrorUnauthorized(res, {}, "Email is already in use.", 400, 103);
    }

    await user.update({
      user_fname,
      user_lname,
      email,
      guest_account: false
    });

    const accessToken = generateAccessToken(user);

    await clearUsersCache();

    const chatroom = await Chatroom.findOne({
      where: { target_user_id: user.id }
    });

    const messageContent = 
    `Kapatid, kumpleto na ang iyong registration! 🙌

    Narito ang iyong detalye:

    • Pangalan: ${user_fname} ${user_lname}
    • Email: ${email}
    • Password: 12345678

    Pwede mo nang i-access ang community menu dito:
    ${menuPageLink}

    Kung ikaw ay lalaki, maari mong i-message direkta ang ating admin dito:
    👉 https://m.me/eric.limjuco

    Kung ikaw naman ay babae, maari mong i-message direkta ang ating admin dito:
    👉 https://m.me/ate.dona.perez

    May volunteer na tutulong sa'yo sa iyong next steps.  
    Pwede mo rin silang i-chat ngayon kung gusto mo. 🙏`;


    if (chatroom) {
      await createAndEmitMessage({
        content: messageContent,
        senderId: 10,
        chatroomId: chatroom.id,
        type: "text",
        category: "automated",
        targetUserId: user.id,
        io
      });
    }

    return sendSuccess(
      res,
      { triggerRefresh: true, accessToken },
      "User updated successfully.",
      200,
      0
    );

  } catch (err) {
    return res.status(500).json({ error: "Internal server error." });
  }
};

// controller to handle user logout
exports.logoutUser = async (req, res) => {
  try {
    return sendSuccess(res, {}, "Logged out successfully.", 200, 0);
  } catch (err) {
    console.error("Logout Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};



// controller to handle forgot password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return sendError(res, {}, "Email is required.", 400, 104);
  }

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return sendError(res, {}, "User not found.", 404, 105);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const expirationTime = moment()
      .tz("Asia/Manila")
      .add(1, "hour")
      .format("YYYY-MM-DD HH:mm:ss");

    await User.update(
      {
        reset_password_token: resetToken,
        reset_password_expires: expirationTime,
      },
      { where: { id: user.id } }
    );

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? process.env.LOCAL_FRONT_URL
        : process.env.FRONTEND_URL;

    const resetURL = `${baseUrl}/reset-password/${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Click the link below to reset your password:\n\n${resetURL}\n\nIf you did not request this, please ignore this email.`,
    };

    await transporter.sendMail(mailOptions);

    return sendSuccess(res, {}, "Password reset email sent successfully.", 200, 0);
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


// controller to handle password reset
exports.resetPassword = async (req, res) => {
  const { newPassword, confirmNewPassword } = req.body;
  const { token } = req.params;

  if (!token || !newPassword || !confirmNewPassword) {
    return sendError(res, {}, "Token, new password, and confirm password are required.", 400, 106);
  }

  if (newPassword !== confirmNewPassword) {
    return sendError(res, {}, "Passwords do not match.", 400, 108);
  }

  try {
    const user = await User.findOne({
      where: { reset_password_token: token },
    });

    if (!user) {
      return sendErrorUnauthorized(res, {}, "Invalid reset token.", 400, 107);
    }

    const dbExpirationTime = user.reset_password_expires;
    const currentTime = moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");

    if (!dbExpirationTime || moment(dbExpirationTime).isBefore(currentTime)) {
      return sendErrorUnauthorized(res, {}, "Expired reset token.", 400, 109);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.update(
      {
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null,
      },
      { where: { id: user.id } }
    );

    return sendSuccess(res, {}, "Password reset successful. You can now log in.", 200, 0);
  } catch (err) {
    console.error("Reset Password Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


exports.guestLogin = async (req, res, io) => {
  try {
    const user_fname = "Guest";

    // Generate unique 6-digit guest ID
    let user_lname;
    while (true) {
      const randomNumber = Math.floor(100000 + Math.random() * 900000).toString();
      const existingUser = await User.findOne({ where: { user_lname: randomNumber } });
      if (!existingUser) {
        user_lname = randomNumber;
        break;
      }
    }

    const email = `${user_fname}${user_lname}@wotgonline.com`;
    const plainPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Create guest user
    const [newUser, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        user_fname,
        user_lname,
        email,
        password: hashedPassword,
        user_role: "guest",
        user_gender: null,
        guest_account: true,
        guest_status: "no_contact"
      },
    });

    if (!created) {
      return sendErrorUnauthorized(res, {}, "Guest account already exists.", 400, 201);
    }

    if (!newUser.guest_account) {
      await newUser.update({ guest_account: true });
    }

    // Clear cached user list
    try {
      await clearUsersCache();
    } catch (cacheErr) {
      console.warn("Failed to clear users cache:", cacheErr.message);
    }

    // Add guest to system chatrooms
    const chatroomIds = [5, 7];
    const chatrooms = await Chatroom.findAll({ where: { id: chatroomIds } });

    for (const chatroom of chatrooms) {
      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: newUser.id },
        defaults: { userName: `${user_fname} ${user_lname}` },
      });
    }

    const accessToken = generateAccessToken(newUser);

    // Create welcome chat with admins
    const adminIds = [10, 49, 27, 251];
    const participants = [newUser.id, ...adminIds];

    const chatroom = await Chatroom.create({
      name: `Welcome Chat - ${user_fname} ${user_lname}`,
      type: "group",
      welcome_chat: true,
      target_user_id: newUser.id,
    });

    await Participant.bulkCreate(
      participants.map((uid) => ({
        userId: uid,
        chatRoomId: chatroom.id,
      }))
    );

    const chatroomParticipants = await Participant.findAll({
      where: { chatRoomId: chatroom.id },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "user_fname", "user_lname", "email"],
        },
      ],
      attributes: ["id", "chatRoomId", "userId", "userName", "joinedAt"],
    });

    const chatroomWithParticipants = {
      id: chatroom.id,
      name: chatroom.name,
      type: chatroom.type,
      Participants: chatroomParticipants,
      welcome_chat: true,
      messages: [],
      unreadCount: 0,
      hasUnread: false,
    };

    // Clear chatroom cache for each admin
    for (const uid of participants) {
      await clearChatroomsCache(uid);
    }

    if (io) {
      io.emit("new_chatroom", chatroomWithParticipants);
    }

    // Automated welcome message
    await createAndEmitMessage({
      content: 
    `Hello kapatid! 👋  
    Maraming salamat sa pag-bisita sa ating Word on the Go (WOTG) app.  
    Dito ay makikita mo ang mga inspiring features gaya ng *daily devotions, Bible, journal, community feeds,* at marami pang iba.  
    Maaari ka ring makipag-ugnayan sa amin dito mismo!

    Para makapagsimula, i-click mo muna ang **Sign Up** button sa ibaba at ilagay ang iyong:
    • First Name  
    • Last Name  
    • Email Address  

    Kapag nakapag-sign up ka na, maikokonek na kita sa ating team para tulungan kang makilala pa nang mas malalim ang Panginoon. 🙏

    Kung ikaw ay **lalaki**, maaari mong direktang i-message ang ating admin dito:  
    👉 https://m.me/eric.limjuco

    Kung ikaw ay **babae**, maaari mong direktang i-message ang ating admin dito:  
    👉 https://m.me/ate.dona.perez

    Pwede mo silang i-chat anytime kung may tanong ka o gusto mong ipag-pray. 🙏`,
      senderId: 10,
      chatroomId: chatroom.id,
      type: "text",
      category: "automated",
      targetUserId: newUser.id,
      io,
    });

    // Final response
    sendSuccess(
      res,
      { accessToken, chatroomLoginId: chatroom.id },
      "Guest account created successfully.",
      201
    );

    // Send admin email notifications
    const adminEmails =
      process.env.NODE_ENV === "development"
        ? ["pillorajem10@gmail.com"]
        : ["michael.marga@gmail.com"];

    const guestLink =
      process.env.NODE_ENV === "development"
        ? `http://localhost:3000/chat?chat=${chatroom.id}`
        : `https://community.wotgonline.com/chat?chat=${chatroom.id}`;

    for (const admin of adminEmails) {
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: admin,
        subject: `New Guest Account Created (${user_fname} ${user_lname})`,
        text:
          `A new guest has joined Word on the Go.\n\n` +
          `Name: ${user_fname} ${user_lname}\n\n` +
          `Chatroom: ${guestLink}\n\n` +
          `WOTG System Notification`,
      })
      .catch((err) => console.error(`Email send error to ${admin}:`, err));
    }

    // Push notifications for admin users
    const pushAdminIds = [10, 49, 27, 251];
    for (const adminId of pushAdminIds) {
      const subscriptions = await Subscription.findAll({ where: { userId: adminId } });

      for (const sub of subscriptions) {
        try {
          const subData = typeof sub.subscription === "string"
            ? JSON.parse(sub.subscription)
            : sub.subscription;

          const fcmToken = subData?.fcmToken;
          if (fcmToken) {
            await sendNotification(
              fcmToken,
              "New Guest Account Created",
              `A new guest (${user_fname} ${user_lname}) has joined Word on the Go.`,
              {
                chatroomId: chatroom.id.toString(),
                type: "guest_joined",
                url: guestLink,
              }
            );
          }
        } catch (err) {
          console.error(`Push notification error for admin ${adminId}:`, err.message);
        }
      }
    }

  } catch (err) {
    console.error("Guest Login Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


const createAndEmitMessage = async ({
  content,
  senderId,
  chatroomId,
  type,
  category,
  targetUserId,
  io
}) => {
  // Create message
  const message = await Message.create({
    content,
    senderId,
    chatroomId,
    type,
    category,
    targetUserId
  });

  // Fetch message with sender + participants
  const fullMessage = await Message.findOne({
    where: { id: message.id },
    attributes: ['id', 'content', 'senderId', 'chatroomId', 'type', 'createdAt'],
    include: [
      {
        model: User,
        as: 'sender',
        attributes: [
          'id',
          'user_fname',
          'user_lname',
          'user_profile_picture',
          'user_role'
        ]
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
                attributes: [
                  'id',
                  'user_fname',
                  'user_lname',
                  'user_profile_picture',
                  'user_role'
                ]
              }
            ]
          }
        ]
      }
    ]
  });

  // Broadcast message to chatroom
  io.to(chatroomId).emit('new_message', fullMessage);

  // Fetch participants except sender
  const participants = await Participant.findAll({
    where: { chatRoomId: chatroomId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture']
      }
    ]
  });

  const filteredParticipants = participants.filter(
    (p) => p.user.id !== senderId
  );

  // Create unread status for each user
  await Promise.all(
    filteredParticipants.map((participant) =>
      MessageReadStatus.create({
        messageId: message.id,
        userId: participant.user.id,
        read: false
      })
    )
  );

  // Emit unread count updates
  for (const participant of filteredParticipants) {
    const unreadCount = await MessageReadStatus.count({
      where: {
        userId: participant.user.id,
        read: false
      },
      include: [
        {
          model: Message,
          as: 'message',
          attributes: [],
          where: { chatroomId }
        }
      ]
    });

    io.to(`user_${participant.user.id}`).emit('unread_update', {
      chatroomId,
      unreadCount
    });
  }

  // Push notifications
  await Promise.all(
    filteredParticipants.map(async (participant) => {
      const subscriptions = await Subscription.findAll({
        where: { userId: participant.user.id }
      });

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            const subData =
              typeof sub.subscription === 'string'
                ? JSON.parse(sub.subscription)
                : sub.subscription;

            const fcmToken = subData?.fcmToken;
            if (!fcmToken) return;

            await sendNotification(
              fcmToken,
              `New message from ${fullMessage.sender.user_fname} ${fullMessage.sender.user_lname}`,
              type === 'file' ? 'Sent a file' : content
            );
          } catch (err) {
            console.error('Push notification error:', err);
          }
        })
      );
    })
  );

  return fullMessage;
};
