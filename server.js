const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http'); // For wrapping Express with Socket.IO
const { Server } = require('socket.io'); // Import Socket.IO
const sequelize = require('./config/db'); // Sequelize connection

// Import routes
const authRoutes = require('./app/routes/auth');
const chatroomRoutes = require('./app/routes/chatroom');
const messageRoutes = require('./app/routes/message');

const app = express();
const port = process.env.PORT || 4000;

// Determine the front-end URL based on the environment
const frontEndUrl = 
  process.env.NODE_ENV === "production"
    ? "https://explorevps.site" // URL for production
    : "http://localhost:3000"; // URL for development

// Create an HTTP server
const server = http.createServer(app);

// Initialize io conditionally based on NODE_ENV
let io;
if (process.env.NODE_ENV === "production") {
  io = new Server(server); // Default configuration for production
} else {
  io = new Server(server, {
    cors: {
      origin: frontEndUrl, // Dynamically set the origin based on NODE_ENV
      methods: ['GET', 'POST', 'DELETE', 'PUT'],
    },
  });
}

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/auth', authRoutes);
app.use('/chatrooms', chatroomRoutes(io)); // Pass io to chatroomRoutes
app.use('/messages', messageRoutes(io)); // Pass io to messageRoutes

// Socket.IO implementation
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
    console.log('User disconnected:', socket.id);
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
