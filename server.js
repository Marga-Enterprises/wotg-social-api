// server.js
const express = require('express');
require('dotenv').config();  // Load environment variables from .env file
const db = require('./config/db');  // Import the database connection

// Initialize the Express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Import the authentication routes
const authRoutes = require('./app/routes/auth');

// Use the authentication routes for '/auth' path
app.use('/auth', authRoutes);

// Example route to check if the server is up and running
app.get('/', (req, res) => {
    res.send('Server is up and running!');
});

// Start the server on a specified port (from .env or default to 5000)
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
