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

// Create an HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for testing
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/auth', authRoutes);
app.use('/chatrooms', chatroomRoutes);
app.use('/messages', messageRoutes);

// Socket.IO implementation
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a chatroom
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    // Send and broadcast a message
    socket.on('send_message', async (data) => {
        const { content, senderId, chatroomId } = data;

        // Save message to the database (optional)
        try {
            const message = {
                content,
                senderId,
                chatroomId,
                createdAt: new Date(), // Simulating database timestamp
            };

            // Broadcast the message to all clients in the room
            io.to(chatroomId).emit('receive_message', message);

            console.log('Message sent and broadcast:', message);
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', { message: 'Failed to send message.' });
        }
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
        // Start server after DB synchronization
        server.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error('Error synchronizing the database:', err);
    });
