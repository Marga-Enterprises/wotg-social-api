const express = require("express");

module.exports = (io) => {
    const router = express.Router();
    const messageController = require("../controllers/message");

    // Message Routes (Protected)
    router.get("/:chatroomId", (req, res) => messageController.getMessagesByChatroom(req, res, io));
    router.post("/send-text", (req, res) => messageController.sendTextMessage(req, res, io));
    router.post("/send-file", (req, res) => messageController.sendFileMessage(req, res, io));    
    router.post("/react", (req, res) => messageController.reactToMessage(req, res, io));

    return router;
};
