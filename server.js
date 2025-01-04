const express = require('express');
const cors = require('cors');

require('dotenv').config();

const sequelize = require('./config/db'); // Import Sequelize connection
const authRoutes = require('./app/routes/auth'); // Import routes

const app = express();
const port = process.env.PORT || 4000;

// Middleware to parse JSON
app.use(express.json());

// Enable CORS
app.use(cors());

// Use routes
app.use('/auth', authRoutes);

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

module.exports = sequelize; // Export Sequelize connection
