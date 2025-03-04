const path = require('path');
const sequelize = require('../../config/db');

// Forcefully load environment variables from the specific path of the .env file
require('dotenv').config({
  path: path.resolve(__dirname, '.env') // Forcefully specify the path to .env
});

const bcrypt = require('bcryptjs'); // Change to bcryptjs
const jwt = require('jsonwebtoken');
const { ValidationError } = require('sequelize');
const User = require('../models/User'); // Import your User model
const Chatroom = require('../models/Chatroom'); 
const Participant = require('../models/Participant'); 
const validator = require('validator'); // Import the validator library for email validation

const {
    sendError,
    sendSuccess,
    convertMomentWithFormat,
    getToken,
    generateAccessToken,
    generateRefreshToken,
    sendErrorUnauthorized,
} = require("../../utils/methods");

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

    // 🔹 Debugging: Log the refresh token to ensure it's generated
    console.log('[[[[[ REFRESH TOKEN GENERATED ]]]]]');
    console.log('Generated Refresh Token:', refreshToken);

    return sendSuccess(res, { accessToken, refreshToken }, "Login successful.");

  } catch (err) {
    console.error('Sequelize error:', err);
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

    // 🔹 Debugging: Log the refresh token to ensure it's generated
    console.log("[[[[[ REFRESH TOKEN GENERATED ]]]]]");
    console.log("Generated Refresh Token:", refreshToken);

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

