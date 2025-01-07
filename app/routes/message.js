const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const messageController = require('../controllers/message'); // Import controller

    router.get('/:chatroomId', messageController.getMessagesByChatroom);
    router.post('/', (req, res) => messageController.sendMessage(req, res, io));

    return router;
};
