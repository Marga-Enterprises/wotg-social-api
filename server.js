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

// Synchronize Sequelize models with the database
sequelize.sync({ force: false })  // Set force: true only if you want to drop and recreate tables every time
    .then(() => {
        console.log('Database synchronized...');
        // Start server after DB synchronization
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.log('Error synchronizing the database:', err);
    });
