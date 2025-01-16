const express = require('express');
const router = express.Router();

module.exports = () => {
    const meetingroomController = require('../controllers/meetingroom');

    // Route to join a meeting
    router.post('/access', meetingroomController.validateAndRedirect);

    return router;
};
