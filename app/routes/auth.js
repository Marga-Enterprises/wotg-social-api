const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');

router.post('/register', authController.createUser);
router.post('/login', authController.loginUser);
router.post('/refresh-token', authController.refreshToken); // 🔹 Refresh Token Route
router.post('/logout', authController.logoutUser); // 🔹 Logout Route

module.exports = router;
