const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const chatroomController = require('../controllers/chatroom'); // Import Chatroom Controller

    // Fetch all chatrooms
    router.get('/', chatroomController.getAllChatrooms);
    router.post('/', (req, res) => chatroomController.createChatroom(req, res, io));

    return router;
};
