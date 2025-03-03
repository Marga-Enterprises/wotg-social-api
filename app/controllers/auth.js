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
    sendErrorUnauthorized,
} = require("../../utils/methods");

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return sendErrorUnauthorized(res, '', 'User not found.');
    }

    // Ensure the password is stored as a hash
    if (!user.password) {
      return sendErrorUnauthorized(res, '', 'User password is not set.');
    }

    // Check if the password matches
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return sendErrorUnauthorized(res, '', 'Password Incorrect.');
    }

    // Define chatroom IDs based on environment
    const chatroomIds = process.env.NODE_ENV === 'development' ? [37, 40] : [5, 7];

    // Check if chatrooms exist and add user as a participant if not already added
    for (const chatroomId of chatroomIds) {
      const chatroom = await Chatroom.findByPk(chatroomId);

      if (!chatroom) {
        // console.warn(`Chatroom with ID ${chatroomId} does not exist. Skipping.`);
        continue; // Skip this chatroom if not found
      }

      const [participant, created] = await Participant.findOrCreate({
        where: { chatRoomId: chatroomId, userId: user.id },
        defaults: { userName: `${user.user_fname} ${user.user_lname}` },
      });
    }

    // Generate JWT token with safer expiration
    const token = jwt.sign(
      {
        user: {
          id: user.id,
          user_role: user.user_role,
          user_fname: user.user_fname,
          user_lname: user.user_lname,
          user_profile_picture: user.user_profile_picture,
          email: user.email,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Reduced expiration time
    );

    // Send response with token
    return sendSuccess(res, { token });
  } catch (err) {
    console.error('Sequelize error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};


exports.createUser = async (req, res) => {
  const { user_fname, user_lname, email, password, user_gender = null } = req.body;

  if (!user_fname || !user_lname || !email || !password) {
    return sendErrorBadRequest(res, {}, 'All required fields must be filled.', 400, 101);
  }

  if (!validator.isEmail(email)) {
    return sendErrorBadRequest(res, {}, 'Invalid email format.', 400, 102);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser, created] = await User.findOrCreate({
      where: { email },
      defaults: { 
        user_fname, 
        user_lname, 
        password: hashedPassword, 
        user_role: 'member', 
        user_gender 
      }
    });

    if (!created) {
      return sendErrorUnauthorized(res, {}, 'Email is already in use.', 400, 103);
    }

    // Define chatroom IDs based on environment
    const chatroomIds = process.env.NODE_ENV === 'development' ? [37, 40] : [5, 7];

    // Fetch chatrooms in one query
    const chatrooms = await Chatroom.findAll({ where: { id: chatroomIds } });

    // Add the user to chatrooms as a participant
    for (const chatroom of chatrooms) {
      await Participant.findOrCreate({
        where: { chatRoomId: chatroom.id, userId: newUser.id },
        defaults: { userName: `${newUser.user_fname} ${newUser.user_lname}` }
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user: {
          id: newUser.id,
          user_role: newUser.user_role,
          user_fname: newUser.user_fname,
          user_lname: newUser.user_lname,
          user_profile_picture: newUser.user_profile_picture,
          email: newUser.email,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Adjust as needed
    );

    // Send response with token
    return sendSuccess(res, { token }, 'User created successfully!', 201, 0);

  } catch (err) {
    console.error('Sequelize error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};



