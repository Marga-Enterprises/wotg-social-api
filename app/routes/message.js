const express = require('express');
const messageController = require('../controllers/message'); // Import controller

const router = express.Router();

// Define routes
router.get('/:chatroomId', messageController.getMessagesByChatroom);
router.post('/', messageController.sendMessage);

module.exports = router; // Correctly export the router
