const express = require("express");

module.exports = (io) => {
    const router = express.Router();
    const chatroomController = require("../controllers/chatroom");
    
    // Fetch all chatrooms
    router.get("/", (req, res) => chatroomController.getAllChatrooms(req, res, io));
    router.post("/", (req, res) => chatroomController.createChatroom(req, res, io));
    router.put("/:id", (req, res) => chatroomController.updateChatroom(req, res, io));
    router.post("/add-participants", (req, res) => chatroomController.addParticipants(req, res, io));

    return router;
};
