const express = require('express');

module.exports = (io) => {
    const router = express.Router();
    const authController = require('../controllers/auth');

    router.post('/register', (req, res) => authController.createUser(req, res, io));
    router.post('/login', (req, res) => authController.loginUser(req, res, io));
    router.post('/logout', authController.logoutUser); 
    router.post('/forgot-password', authController.forgotPassword);
    router.post('/reset-password/:token', authController.resetPassword);
    router.post('/login-guest', (req, res) => authController.guestLogin(req, res, io));

    return router;
};




