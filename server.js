const path = require('path');
const webPush = require('web-push');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const sequelize = require('./config/db');

// Import routes
const authRoutes = require('./app/routes/auth');
const chatroomRoutes = require('./app/routes/chatroom');
const meetingroomRoutes = require('./app/routes/meetingroom');
const messageRoutes = require('./app/routes/message');
const subscriptionRoutes = require('./app/routes/subscription');
const userRoutes = require('./app/routes/user');

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === "production"
        ? ["https://community.wotgonline.com", "https://www.wotgonline.com", "https://wotgonline.com"]
        : ["http://localhost:3000"], // URL for development
      methods: ['GET', 'POST', 'DELETE', 'PUT'], // Allowed methods
    },
    transports: ['websocket', 'polling'], // Allow both WebSocket and Polling for development
});

// Web Push Configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY, // Set in your .env file
  privateKey: process.env.VAPID_PRIVATE_KEY, // Set in your .env file
};

webPush.setVapidDetails(
  'mailto:your-email@example.com', // Contact email
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/chatrooms', chatroomRoutes(io));
app.use('/meetingrooms', meetingroomRoutes);
app.use('/messages', messageRoutes(io)); 
app.use('/subscriptions', subscriptionRoutes); 

// Socket.IO implementation
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a chatroom
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);
  });

  socket.on('leave_room', (room) => {
    socket.leave(room);
    console.log(`User ${socket.id} left room ${room}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Synchronize Sequelize models with the database
sequelize.sync({ force: false }) // Set force: true only if you want to drop and recreate tables every time
  .then(() => {
    console.log('Database synchronized...');
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Error synchronizing the database:', err);
  });
