const express = require('express');

module.exports = (io) => {
    const router = express.Router();
    const authController = require('../controllers/auth');

    router.post('/register', authController.createUser);
    router.post('/login', authController.loginUser);
    router.post('/refresh-token', authController.refreshToken);
    router.post('/logout', authController.logoutUser); 
    router.post('/forgot-password', authController.forgotPassword);
    router.post('/reset-password/:token', authController.resetPassword);
    router.post('/login-guest', (req, res) => authController.guestLogin(req, res, io));

    return router;
};




