// controllers/chatroom.js
const Chatroom = require('../models/Chatroom'); // Import Chatroom model
const Participant = require('../models/Participant'); // Import Chatroom model

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

let io; // Global variable to hold the Socket.IO instance

// Method to set `io`
exports.setIO = (socketInstance) => {
    io = socketInstance;
};

// Fetch all chatrooms
exports.getAllChatrooms = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const userDecoded = decodeToken(token); // Assuming this function decodes the token and gets the user ID
        try {
            // Find all chatrooms where the user is a participant
            const chatrooms = await Chatroom.findAll({
                include: [
                    {
                        model: Participant,
                        where: { userId: userDecoded.user.id }, // Ensure that the user is a participant
                        required: true, // Ensures the chatroom must have the user as a participant
                    }
                ]
            });

            // Return only the chatrooms that the user is a participant in
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
        const { name, type, participants } = req.body; // Get name, type, and participants from the request body

        // Validate the participants
        if (!Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: "At least one participant is required." });
        }

        try {
            // Create a new chatroom
            const chatroom = await Chatroom.create({ name, type });

            // Create participants for the chatroom
            const participantsData = participants.map((userId) => ({
                userId, 
                chatRoomId: chatroom.id,  // Link the participant to the newly created chatroom
            }));

            // Insert participants into the Participant model
            await Participant.bulkCreate(participantsData);

            // Emit a real-time event for the new chatroom with participants
            if (io) {
                io.emit('new_chatroom', { chatroom, participants });
            }

            return sendSuccess(res, chatroom);
        } catch (error) {
            console.error('Error creating chatroom:', error);
            return res.status(500).json({ error: 'Failed to create chatroom.' });
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};


