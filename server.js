const path = require("path");
const webPush = require("web-push");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");

// Import routes
const authRoutes = require("./app/routes/auth");
const chatroomRoutes = require("./app/routes/chatroom");
const messageRoutes = require("./app/routes/message");
const subscriptionRoutes = require("./app/routes/subscription");
const userRoutes = require("./app/routes/user");
const meetingroomRoutes = require("./app/routes/meetingroom");
const streamRoutes = require("./app/routes/stream");

const streamController = require("./app/controllers/stream"); // ✅ Import stream controller

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production"
            ? ["https://chat.wotgonline.com", "https://www.wotgonline.com", "https://wotgonline.com", "https://live.wotgonline.com"]
            : ["http://localhost:3000"],
        methods: ["GET", "POST", "DELETE", "PUT"],
    },
    transports: ["websocket", "polling"],
});

// Web Push Configuration
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

webPush.setVapidDetails(
    "mailto:your-email@example.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/chatrooms", chatroomRoutes(io));
app.use("/messages", messageRoutes(io));
app.use("/meetingrooms", meetingroomRoutes(io));
app.use("/stream", streamRoutes(io));
app.use("/subscriptions", subscriptionRoutes);
app.use("/uploads", express.static("uploads"));

// **Socket.IO Connection**
io.on("connection", (socket) => {
    console.log(`🟢 User connected: ${socket.id}`);

    // ✅ Call WebRTC Stream Handler
    streamController.handleWebRTCStream(socket);

    socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    socket.on("leave_room", (room) => {
        socket.leave(room);
        console.log(`User ${socket.id} left room ${room}`);
    });

    socket.on("disconnect", () => {
        console.log(`🔴 User disconnected: ${socket.id}`);
    });
});

// Synchronize Sequelize models with the database
sequelize
    .sync({ force: false })
    .then(() => {
        console.log("Database synchronized...");
        server.listen(port, () => {
            console.log(`🚀 Server running on http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error("Error synchronizing the database:", err);
    });
