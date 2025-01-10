const Meetingroom = require('../models/Meetingroom');
const Participant = require('../models/Participant');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
} = require("../../utils/methods");

// Fetch all meeting rooms
exports.getAllMeetingRooms = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        try {
            const meetingRooms = await Meetingroom.findAll(); // Fetch all meeting rooms
            return sendSuccess(res, meetingRooms);
        } catch (error) {
            console.error('Error fetching meeting rooms:', error);
            return sendError(res, 'Failed to retrieve meeting rooms.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

// Create a new meeting room
exports.createMeetingRoom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { name, type } = req.body; // Get name and type from the request body

        // Input validation
        if (!name) {
            return sendError(res, 'Room name is required.');
        }

        try {
            // Generate Jitsi meeting URL (public server)
            const roomUrl = `https://meet.jit.si/${name}`;

            // Store the room in your database (optional)
            const meetingRoom = await Meetingroom.create({
                name,
                type,
                roomUrl,  // Save the Jitsi room URL
            });

            return sendSuccess(res, { meetingRoom, roomUrl });
        } catch (error) {
            console.error('Error creating meeting room:', error);
            return sendError(res, 'Failed to create meeting room.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

// Join a meeting room (Add a participant)
exports.joinMeetingRoom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { roomName, userId, userName } = req.body; // Get roomName, userId, and userName from the request body

        // Input validation
        if (!roomName || !userId || !userName) {
            return sendError(res, 'Missing required fields (roomName, userId, userName).');
        }

        try {
            // Find the meeting room by name
            const room = await Meetingroom.findOne({ where: { name: roomName } });
            if (!room) {
                return sendError(res, 'Meeting room not found.');
            }

            // Check if the user is already in the room
            const existingParticipant = await Participant.findOne({
                where: { meetingRoomId: room.id, userId }
            });
            if (existingParticipant) {
                return sendError(res, 'You are already a participant in this room.');
            }

            // Add the participant to the meeting room
            const newParticipant = await Participant.create({
                meetingRoomId: room.id,
                userId,
                userName,
            });

            // Generate the room URL (public Jitsi server)
            const roomUrl = `https://meet.jit.si/${roomName}`;

            return sendSuccess(res, { newParticipant, roomUrl });
        } catch (error) {
            console.error('Error joining meeting room:', error);
            return sendError(res, 'Failed to join meeting room.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

// Optionally, leave a meeting room (remove participant)
exports.leaveMeetingRoom = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        const { roomName, userId } = req.body; // Get roomName and userId from the request body

        try {
            // Find the meeting room by name
            const room = await Meetingroom.findOne({ where: { name: roomName } });
            if (!room) {
                return sendError(res, 'Meeting room not found.');
            }

            // Find the participant by userId and roomId (meetingRoomId)
            const participant = await Participant.findOne({
                where: { meetingRoomId: room.id, userId },
            });
            if (!participant) {
                return sendError(res, 'Participant not found in the meeting room.');
            }

            // Remove the participant from the meeting room
            await participant.destroy();

            return sendSuccess(res, 'Successfully left the meeting room.');
        } catch (error) {
            console.error('Error leaving meeting room:', error);
            return sendError(res, 'Failed to leave meeting room.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};
