const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware"); // ✅ Import authentication middleware

module.exports = (io) => {
    const router = express.Router();
    const messageController = require("../controllers/message");

    // Apply `authMiddleware` to all routes
    // router.use(authMiddleware);

    // Message Routes (Protected)
    router.get("/:chatroomId", (req, res) => messageController.getMessagesByChatroom(req, res, io));
    router.post("/send-text", (req, res) => messageController.sendTextMessage(req, res, io));
    router.post("/send-file", (req, res) => messageController.sendFileMessage(req, res, io));    
    router.post("/react", (req, res) => messageController.reactToMessage(req, res, io));

    return router;
};
