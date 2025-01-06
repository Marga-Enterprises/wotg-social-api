const express = require('express');
const router = express.Router();
const chatroomController = require('../controllers/chatroom'); // Import Chatroom Controller

router.get('/', chatroomController.getAllChatrooms);
router.post('/', chatroomController.createChatroom);

module.exports = router;
