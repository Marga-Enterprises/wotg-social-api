// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); // Import Chatroom model

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
  } = require("../../utils/methods");

// Fetch all chatrooms
exports.getAllChatrooms = async (req, res) => {
    let token = getToken(req.headers);
    if (token)  {
        try {
            const chatrooms = await Chatroom.findAll(); // Fetch all chatrooms
            return sendSuccess(res, chatrooms);
        } catch (error) {
            console.error('Error fetching chatrooms:', error);
            res.status(500).json({ error: 'Failed to retrieve chatrooms.' });
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

// Create a new chatroom
exports.createChatroom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { name, type } = req.body; // Get name and type from the request body

        try {
            const chatroom = await Chatroom.create({ name, type }); // Create a new chatroom
            return sendSuccess(res, chatroom);
        } catch (error) {
            console.error('Error creating chatroom:', error);
            res.status(500).json({ error: 'Failed to create chatroom.' });
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};
