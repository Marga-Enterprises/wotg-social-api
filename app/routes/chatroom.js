const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware"); // ✅ Import authentication middleware

module.exports = (io) => {
    const router = express.Router();
    const chatroomController = require("../controllers/chatroom");

    // Apply `authMiddleware` to all chatroom routes
    router.use(authMiddleware);

    // Fetch all chatrooms
    router.get("/", chatroomController.getAllChatrooms);
    router.post("/", (req, res) => chatroomController.createChatroom(req, res, io));
    router.put("/:id", (req, res) => chatroomController.updateChatroom(req, res, io));
    router.post("/add-participants", (req, res) => chatroomController.addParticipants(req, res, io));

    return router;
};
