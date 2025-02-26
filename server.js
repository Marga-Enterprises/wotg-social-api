const path = require("path");
const webPush = require("web-push");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const sequelize = require("./config/db");

// Import Routes
const authRoutes = require("./app/routes/auth");
const chatroomRoutes = require("./app/routes/chatroom");
const messageRoutes = require("./app/routes/message");
const subscriptionRoutes = require("./app/routes/subscription");
const userRoutes = require("./app/routes/user");
const meetingroomRoutes = require("./app/routes/meetingroom");
const streamRoutes = require("./app/routes/stream");
const worshipRoutes = require("./app/routes/worship"); // 🔥 Worship API routes

const streamController = require("./app/controllers/stream");

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production"
            ? ["https://community.wotgonline.com", "https://www.wotgonline.com", "https://wotgonline.com", "https://live.wotgonline.com"]
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

// ✅ Initialize Mediasoup
streamController.initializeMediasoup();

// ✅ Use Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/chatrooms", chatroomRoutes(io));
app.use("/messages", messageRoutes(io));
app.use("/meetingrooms", meetingroomRoutes(io));
app.use("/stream", streamRoutes(io)); // 🔥 WebRTC API routes
app.use("/subscriptions", subscriptionRoutes);
app.use("/worship", worshipRoutes); // 🔥 Worship API routes
app.use("/uploads", express.static("uploads"));

// ✅ WebRTC Signaling Handled by `streamController.js`
streamController.handleWebRTCSignaling(io);

// **Live Viewer Count for Worship Page**
let liveViewers = 0; // Track active viewers

io.on("connection", (socket) => {
    console.log(`🟢 User connected: ${socket.id}`);

    // **Live Viewer Count for Worship Page**
    socket.on("join_worship", () => {
        liveViewers++;
        io.emit("update_viewers", liveViewers);
        console.log(`User joined worship. Viewers: ${liveViewers}`);
    });

    socket.on("leave_worship", () => {
        if (liveViewers > 0) liveViewers--;
        io.emit("update_viewers", liveViewers);
        console.log(`User left worship. Viewers: ${liveViewers}`);
    });

    // **New Feature: Real-Time Floating Reactions**
    socket.on("send_reaction", (reaction) => {
        console.log(`💬 Reaction received: ${reaction}`);

        // Broadcast to all users
        io.emit("new_reaction", reaction);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        if (liveViewers > 0) liveViewers--;
        io.emit("update_viewers", liveViewers);
        console.log(`🔴 User disconnected. Viewers: ${liveViewers}`);
    });

    // **Chatroom Features**
    socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    socket.on("leave_room", (room) => {
        socket.leave(room);
        console.log(`User ${socket.id} left room ${room}`);
    });
});

// ✅ Sync Database
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
