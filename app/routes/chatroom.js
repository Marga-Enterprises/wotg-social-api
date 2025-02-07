const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const chatroomController = require('../controllers/chatroom'); // Import Chatroom Controller

    // Fetch all chatrooms
    router.get('/', chatroomController.getAllChatrooms);
    router.post('/', (req, res) => chatroomController.createChatroom(req, res, io));
    router.put('/:id', (req, res) => chatroomController.updateChatroom(req, res, io));
    router.post('/add-participants', (req, res) => chatroomController.addParticipants(req, res, io));

    return router;
};
