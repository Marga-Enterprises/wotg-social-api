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
const streamRoutes = require("./app/routes/stream"); // 🔥 Updated route file

const streamController = require("./app/controllers/stream");

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

// ✅ Initialize Mediasoup (Starts the worker)
streamController.initializeMediasoup();

// ✅ Use Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/chatrooms", chatroomRoutes(io));
app.use("/messages", messageRoutes(io));
app.use("/meetingrooms", meetingroomRoutes(io));
app.use("/stream", streamRoutes(io)); // 🔥 WebRTC API routes
app.use("/subscriptions", subscriptionRoutes);
app.use("/uploads", express.static("uploads"));

// ✅ WebRTC Signaling Handled by `streamController.js`
streamController.handleWebRTCSignaling(io);

// **Socket.IO Connection** (Keep this part in `server.js`)
io.on("connection", (socket) => {
    console.log(`🟢 User connected: ${socket.id}`);

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
