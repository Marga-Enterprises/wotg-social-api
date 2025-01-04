// config/db.js
const mysql = require('mysql2');
require('dotenv').config();  // Load environment variables

// Create a connection to the database
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // Ensure to replace with your MySQL password
    database: process.env.DB_NAME  // Replace with your actual database name
});

// Establish the MySQL connection and handle errors
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }
    console.log('Connected to MySQL successfully');
});

// Export the database connection so it can be used in other parts of the app
module.exports = db;
