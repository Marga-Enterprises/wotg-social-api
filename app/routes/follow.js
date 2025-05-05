const express = require('express');
const followController = require('../controllers/follow');
const router = express.Router();

router.get('/followers/:userId', followController.getFollowersByUserId);
router.get('/following/:userId', followController.getFollowingByUserId);
router.post('/follow-user/:userId', followController.followUserById);
router.delete('/unfollow-user/:userId', followController.unfollowUserById);

module.exports = router;