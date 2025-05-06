const express = require('express');
const followController = require('../controllers/follow');
const router = express.Router();

module.exports = (io) => {
    router.get('/followers/:userId', followController.getFollowersByUserId);
    router.get('/following/:userId', followController.getFollowingByUserId);
    router.post('/follow-user/:userId', (req, res) => followController.followUserById(req, res, io));
    router.delete('/unfollow-user/:userId', followController.unfollowUserById);

    return router;
}