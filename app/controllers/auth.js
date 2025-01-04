// app/controllers/auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db'); 

// User Registration
exports.register = async (req, res) => {
    const { user_fname, user_lname, user_role, email, password, user_gender, user_mobile_number,
        user_church_name, user_birthday, user_country, user_city, user_dgroup_leader,
        approval_token, user_ministry, user_already_a_dgroup_leader, user_already_a_dgroup_member,
        user_profile_picture, user_nickname, user_meeting_day, user_meeting_time, user_profile_banner } = req.body;

    // Input validation
    if (!user_fname || !user_lname || !email || !password) {
        return res.status(400).json({ message: 'First name, last name, email, and password are required' });
    }

    try {
        // Check if the user already exists
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, result) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err.message });
            if (result.length > 0) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // Hash password using bcrypt
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create new user
            const query = `
                INSERT INTO users 
                (user_fname, user_lname, user_role, email, password, user_gender, user_mobile_number, 
                user_church_name, user_birthday, user_country, user_city, user_dgroup_leader, 
                approval_token, user_ministry, user_already_a_dgroup_leader, user_already_a_dgroup_member, 
                user_profile_picture, user_nickname, user_meeting_day, user_meeting_time, user_profile_banner) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(query, [
                user_fname, user_lname, user_role, email, hashedPassword, user_gender, user_mobile_number, 
                user_church_name, user_birthday, user_country, user_city, user_dgroup_leader, approval_token, 
                user_ministry, user_already_a_dgroup_leader, user_already_a_dgroup_member, user_profile_picture, 
                user_nickname, user_meeting_day, user_meeting_time, user_profile_banner
            ], (err, result) => {
                if (err) return res.status(500).json({ message: 'Error creating user', error: err.message });
                res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
};

// User Login
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, result) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err.message });
            if (result.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }

            const user = result[0];

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // Create JWT token
            const token = jwt.sign({ id: user.id, username: user.user_fname }, process.env.JWT_SECRET, {
                expiresIn: '1h',
            });

            res.status(200).json({ message: 'Login successful', token });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};
