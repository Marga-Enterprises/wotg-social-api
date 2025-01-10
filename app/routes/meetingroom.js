// routes/meetingroom.js
const express = require('express');
const router = express.Router();
const meetingroomController = require('../controllers/meetingroom'); // Import Meetingroom Controller

// Route for creating a new meeting room
router.post('/', meetingroomController.createMeetingRoom);

// Route for getting all meeting rooms
router.get('/', meetingroomController.getAllMeetingRooms);

// Route for joining a meeting room
router.post('/join', meetingroomController.joinMeetingRoom);

// Route for leaving a meeting room
router.delete('/leave', meetingroomController.leaveMeetingRoom);

module.exports = router;
