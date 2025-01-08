const path = require('path');

// Forcefully load environment variables from the specific path of the .env file
require('dotenv').config({
  path: path.resolve(__dirname, '.env') // Forcefully specify the path to .env
});

const bcrypt = require('bcryptjs'); // Change to bcryptjs
const jwt = require('jsonwebtoken');
const { ValidationError } = require('sequelize');
const User = require('../models/User'); // Import your User model
const validator = require('validator'); // Import the validator library for email validation

const {
    sendError,
    sendSuccess,
    convertMomentWithFormat,
    getToken,
    sendErrorUnauthorized,
  } = require("../../utils/methods");

exports.createUser = async (req, res) => {
    const { 
        user_fname, 
        user_lname, 
        email, 
        password, 
        user_gender = null,  // Gender is optional, default to null
    } = req.body;

    // Validate required fields
    if (!user_fname || !user_lname || !email || !password) {
        return sendErrorUnauthorized(res, {}, 'First name, last name, email, and password are required.', 400, 101);
    }

    // Validate email format
    if (!validator.isEmail(email)) {
        return sendErrorUnauthorized(res, {}, 'Invalid email format.', 400, 102);
    }

    // Check if email is already used
    try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return sendErrorUnauthorized(res, {}, 'Email is already in use.', 400, 103);
        }
    } catch (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: 'Internal server error.' }); // Standard 500 error response
    }

    try {
        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user with 'member' as default role
        const newUser = await User.create({
            user_fname,
            user_lname,
            email,
            password: hashedPassword, // Store the hashed password
            user_gender, // Gender (optional, defaults to null if not provided)
            user_role: 'member', // Default role set to 'member'
            verification_token: null, // Initial value for verification token
        });

        // Send success response with user data (excluding password)
        const { password: _, ...userWithoutPassword } = newUser.toJSON();
        return sendSuccess(res, {
            id: userWithoutPassword.id,
            email: userWithoutPassword.email,
            user_role: userWithoutPassword.user_role,
            user_fname: userWithoutPassword.user_fname,
            user_lname: userWithoutPassword.user_lname,
            created_at: userWithoutPassword.created_at,
            updated_at: userWithoutPassword.updated_at,
        }, 'User created successfully!', 201, 0);

    } catch (err) {
        console.error('Sequelize error:', err);
        if (err instanceof ValidationError) {
            return sendErrorUnauthorized(res, {}, err.errors.map(e => e.message), 400, 106);
        }
        return res.status(500).json({ error: 'Internal server error.' }); // Standard 500 error response
    }
};



exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Find user by email
        const user = await User.findOne({ where: { email } });
        if (!user) {
            // return res.status(401).json({ error: 'Invalid email or password.' });
            return sendErrorUnauthorized(res, '', 'User not found.');
        }

        // Check if the password matches
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return sendErrorUnauthorized(res, '', 'Password Incorrect.');
        }

        // Generate JWT token (optional)
        const token = jwt.sign(
            {
              user: {
                id: user.id,
                user_role: user.user_role,
                user_fname: user.user_fname,
                user_lname: user.user_lname
              }
            },
            process.env.JWT_SECRET,
            { expiresIn: '1y' }
          );
          

        // Send the response with user details and token
        return sendSuccess(res, { token });
    } catch (err) {
        console.error('Sequelize error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
};
