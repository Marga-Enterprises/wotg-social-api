require('dotenv').config(); // Load environment variables

const express = require('express');
const cors = require('cors');


// Log all environment variables
/*
console.log('Environment Variables:', process.env.DB_HOST);
console.log('Environment Variables:', process.env.DB_USER);
console.log('Environment Variables:', process.env.DB_PASSWORD);
console.log('Environment Variables:', process.env.DB_NAME);
console.log('Environment Variables:', process.env.PORT);
console.log('Environment Variables:', process.env.JWT_SECRET);
console.log('Environment Variables:', process.env.NODE_ENV);
*/
console.log('PROCESS ENV', process.env);  // Log all environment variables

const http = require('http'); // For wrapping Express with Socket.IO
const { Server } = require('socket.io'); // Import Socket.IO
const sequelize = require('./config/db'); // Sequelize connection

// Import routes
const authRoutes = require('./app/routes/auth');
const chatroomRoutes = require('./app/routes/chatroom');
const messageRoutes = require('./app/routes/message');

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

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/auth', authRoutes);
app.use('/chatrooms', chatroomRoutes(io)); // Pass io to chatroomRoutes
app.use('/messages', messageRoutes(io)); // Pass io to messageRoutes

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
