const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const messageController = require('../controllers/message'); // Import controller

    router.get('/:chatroomId', (req, res) => messageController.getMessagesByChatroom(req, res, io));
    router.post('/', (req, res) => messageController.sendMessage(req, res, io));

    return router;
};
