// app/routes/auth.js
const express = require('express');
const router = express.Router();

// Import the authentication controller functions
const { register, login } = require('../controllers/auth');

// POST request to register a new user
router.post('/register', register);

// POST request to log in an existing user
router.post('/login', login);

module.exports = router;
