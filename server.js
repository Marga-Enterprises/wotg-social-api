const path = require("path");
const webPush = require("web-push");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const compression = require("compression");

const sequelize = require("./config/db");

// Import Routes
const authRoutes = require("./app/routes/auth");
const chatroomRoutes = require("./app/routes/chatroom");
const messageRoutes = require("./app/routes/message");
const subscriptionRoutes = require("./app/routes/subscription");
const userRoutes = require("./app/routes/user");
const worshipRoutes = require("./app/routes/worship"); // 🔥 Worship API routes
const blogRoutes = require("./app/routes/blogs");
const bibleRoutes = require("./app/routes/bible");
const journalRoutes = require("./app/routes/journal");
const musicRoutes = require("./app/routes/music");
const albumRoutes = require("./app/routes/album"); // Music API routes
const playListRoutes = require("./app/routes/playlist"); // Music API routes

const Playlist = require('./app/models/Playlist');
const Music = require('./app/models/Music');

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
app.use(compression());

// ✅ Use Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/chatrooms", chatroomRoutes(io));
app.use("/messages", messageRoutes(io));
app.use("/subscriptions", subscriptionRoutes);
app.use("/worship", worshipRoutes); // 🔥 Worship API routes
app.use("/blogs", blogRoutes);
app.use("/bibles", bibleRoutes);
app.use("/journals", journalRoutes);
app.use("/music", musicRoutes); // Music API routes
app.use("/albums", albumRoutes); // Music API routes
app.use("/playlists", playListRoutes); // Music API routes
app.use("/uploads", express.static("uploads"));

// **Live Viewer Count for Worship Page**
let viewersMap = {}; // Store unique viewers by user email

io.on("connection", (socket) => {
    // console.log(`🟢 User connected: ${socket.id}`);

    // **Live Viewer Count for Worship Page**
    socket.on("join_worship", (user) => {
        if (!user || !user.email) return; // Ensure user is authenticated

        // Add user to viewers map (avoid duplicates)
        if (!viewersMap[user.email]) {
            viewersMap[user.email] = {
                sockets: new Set(),
                fullName: `${user.user_fname} ${user.user_lname}`.trim(), // Store full name
                email: user.email,
            };
        }
        viewersMap[user.email].sockets.add(socket.id);

        // Broadcast updated viewer count and list
        updateViewerCount(io);
    });

    socket.on("leave_worship", (user) => {
        if (!user || !user.email) return; // Ensure user is authenticated

        // Remove this specific socket ID from the user's set
        if (viewersMap[user.email]) {
            viewersMap[user.email].sockets.delete(socket.id);

            // If the user has no open tabs/devices left, remove them completely
            if (viewersMap[user.email].sockets.size === 0) {
                delete viewersMap[user.email];
            }
        }

        // Broadcast updated viewer count and list
        updateViewerCount(io);
    });

    // Handle user disconnect (when closing tab, refresh, or lost connection)
    socket.on("disconnect", () => {
        for (const email in viewersMap) {
            if (viewersMap[email].sockets.has(socket.id)) {
                viewersMap[email].sockets.delete(socket.id);
                if (viewersMap[email].sockets.size === 0) {
                    delete viewersMap[email];
                }
                break;
            }
        }

        // Broadcast updated viewer count and list
        updateViewerCount(io);
    });

    // **New Feature: Real-Time Floating Reactions**
    socket.on("send_reaction", (reaction) => {
        console.log("[[[[[[[[[[[[[[[[[[🚀 New Reaction:]]]]]]]]]]]]]]]]]]", reaction);
        io.emit("new_reaction", reaction);
    });

    // **Chatroom Features**
    socket.on("join_room", (room) => {
        socket.join(room);
    });

    socket.on("leave_room", (room) => {
        socket.leave(room);
    });

    socket.on('new_message', (msg) => {
        console.log('[[[[[[[[[[[[[[[[[[[[[[📨 Received new_message from frontend]]]]]]]]]]]]]]]]]]]]]]', msg);
        io.to(msg.chatroomId).emit('new_message', msg); // echo to others
    });

    // Function to update and broadcast viewer count and list
    function updateViewerCount(io) {
        const viewersArray = Object.values(viewersMap).map((viewer) => ({
            fullName: viewer.fullName,
            email: viewer.email,
        }));

        io.emit("update_viewers", { count: viewersArray.length, viewers: viewersArray });
    }
});

Playlist.belongsToMany(Music, {
    through: 'playlist_music',
    foreignKey: 'playlist_id',
    otherKey: 'music_id',
});

Music.belongsToMany(Playlist, {
    through: 'playlist_music',
    foreignKey: 'music_id',
    otherKey: 'playlist_id',
});
  

// ✅ Sync Database
sequelize
    .sync({ force: false })
    .then(() => console.log("Database synchronized..."))
    .catch((err) => console.error("Error synchronizing the database:", err))
    .finally(() => {
        server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://localhost:${port}`);
        });
    });
