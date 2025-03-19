const path = require('path');

// Forcefully load environment variables from the specific path of the .env file
require('dotenv').config({
  path: path.resolve(__dirname, '.env') // Forcefully specify the path to .env
});

const bcrypt = require('bcryptjs'); // Change to bcryptjs
const jwt = require('jsonwebtoken');
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const User = require('../models/User'); // Import your User model
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const validator = require('validator'); // Import the validator library for email validation

const {
    sendError,
    sendSuccess,
    generateAccessToken,
    generateRefreshToken,
    sendErrorUnauthorized,
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


exports.loginUser = async (req, res) => {
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
      return sendErrorUnauthorized(res, '', 'Password Incorrect.');
    }

    // Define chatroom IDs based on environment
    const chatroomIds = process.env.NODE_ENV === 'development' ? [37, 40] : [5, 7];

    // Add user to chatrooms if not already a participant
    for (const chatroomId of chatroomIds) {
      const chatroom = await Chatroom.findByPk(chatroomId);
      if (!chatroom) continue;

      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: user.id },
        defaults: { userName: `${user.user_fname} ${user.user_lname}` },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in DB (replacing old one)
    await User.update({ refreshToken: refreshToken }, { where: { id: user.id } });

    return sendSuccess(res, { accessToken, refreshToken }, "Login successful.");

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.createUser = async (req, res) => {
  const { user_fname, user_lname, email, password, user_gender = null } = req.body;

  if (!user_fname || !user_lname || !email || !password) {
    return sendError(res, {}, "All required fields must be filled.", 400, 101);
  }

  if (!validator.isEmail(email)) {
    return sendError(res, {}, "Invalid email format.", 400, 102);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        user_fname,
        user_lname,
        password: hashedPassword,
        user_role: "member",
        user_gender,
      },
    });

    if (!created) {
      return sendErrorUnauthorized(res, {}, "Email is already in use.", 400, 103);
    }

    // Define chatroom IDs based on environment
    const chatroomIds = process.env.NODE_ENV === "development" ? [37, 40] : [5, 7];

    // Fetch chatrooms in one query
    const chatrooms = await Chatroom.findAll({ where: { id: chatroomIds } });

    // Add the user to chatrooms as a participant
    for (const chatroom of chatrooms) {
      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: newUser.id },
        defaults: { userName: `${newUser.user_fname} ${newUser.user_lname}` },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // Store refresh token in DB
    await User.update({ refreshToken: refreshToken }, { where: { id: newUser.id } });

    return sendSuccess(res, { accessToken, refreshToken }, "User created successfully!", 201, 0);
  } catch (err) {
    console.error("Sequelize error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body; // ✅ Get refresh token from request body instead of cookies

  if (!refreshToken) {
      return sendErrorUnauthorized(res, {}, "No refresh token provided.");
  }

  try {
      // Verify the refresh token
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);

      // Fetch the user and validate the refresh token in DB
      const user = await User.findByPk(decoded.userId);
      if (!user || user.refreshToken !== refreshToken) {
          return sendErrorUnauthorized(res, {}, "Invalid refresh token.");
      }

      // Generate new access token
      const newAccessToken = generateAccessToken(user);

      return sendSuccess(res, { accessToken: newAccessToken }, "Access token refreshed successfully.");

  } catch (err) {
      return sendErrorUnauthorized(res, {}, "Invalid or expired refresh token.");
  }
};

exports.logoutUser = async (req, res) => {
  const { refreshToken } = req.body; // ✅ Get refresh token from request body instead of cookies

  if (!refreshToken) {
      return sendSuccess(res, {}, "User already logged out.");
  }

  try {
      // Find the user with the refresh token
      const user = await User.findOne({ where: { refreshToken } });

      if (user) {
          // Remove the refresh token from the database
          await User.update({ refreshToken: null }, { where: { id: user.id } });
      }

      return sendSuccess(res, {}, "Logged out successfully.");
  } catch (err) {
      console.error("Logout Error:", err);
      return res.status(500).json({ error: "Internal server error." });
  }
};


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

    // ✅ Generate Plain Text Reset Token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // ✅ Set Expiration Time in Asia/Manila Timezone (1 Hour Expiry)
    const expirationTime = moment().tz("Asia/Manila").add(1, "hour").format("YYYY-MM-DD HH:mm:ss");

    // ✅ Store in Database
    await User.update(
      {
        reset_password_token: resetToken, // ✅ Store in plain text
        reset_password_expires: expirationTime, // ✅ Now in Asia/Manila time
      },
      { where: { id: user.id } }
    );

    // ✅ Send Reset Email
    const resetURL = `${
      process.env.NODE_ENV === "development"
        ? process.env.LOCAL_FRONT_URL
        : process.env.FRONTEND_URL
    }/reset-password/${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Click the link below to reset your password:\n\n${resetURL}\n\nIf you did not request this, please ignore this email.`,
    };

    await transporter.sendMail(mailOptions);

    return sendSuccess(res, {}, "Password reset email sent successfully!", 200, 0);
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ✅ Reset Password (Using Asia/Manila Timezone)
exports.resetPassword = async (req, res) => {
  const { newPassword, confirmNewPassword } = req.body;
  const { token } = req.params; // ✅ Token received in plain text

  if (!token || !newPassword || !confirmNewPassword) {
    return sendError(res, {}, "Token, new password, and confirm password are required.", 400, 106);
  }

  if (newPassword !== confirmNewPassword) {
    return sendError(res, {}, "Passwords do not match.", 400, 108);
  }

  try {
    // ✅ Find user with the plain text token
    const user = await User.findOne({
      where: {
        reset_password_token: token,
      },
    });

    if (!user) {
      return sendErrorUnauthorized(res, {}, "Invalid reset token.", 400, 107);
    }

    // ✅ Retrieve expiration time from the database
    const dbExpirationTime = user.reset_password_expires;

    // ✅ Get current time in Asia/Manila
    const currentTime = moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");


    // ✅ Compare times (Ensure token is still valid)
    if (!dbExpirationTime || moment(dbExpirationTime).isBefore(currentTime)) {
      return sendErrorUnauthorized(res, {}, "Expired reset token.", 400, 109);
    }

    // ✅ Hash New Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✅ Update Password & Remove Reset Token
    await User.update(
      {
        password: hashedPassword,
        reset_password_token: null, // Remove token after use
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

