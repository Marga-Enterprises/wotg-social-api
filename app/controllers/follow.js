const Follow = require('../models/Follow');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription'); // Import Message model
const { sendNotification } = require('../../utils/sendNotification'); 

const { 
    sendError, 
    sendSuccess, 
    getToken, 
    sendErrorUnauthorized, 
    decodeToken, 
} = require('../../utils/methods');

const { Sequelize } = require("sequelize");

const redisClient = require('../../config/redis');
const { clearFollowingCache, clearFollowersCache } = require('../../utils/clearBlogCache');

exports.getFollowersByUserId = async (req, res) => {
  const token = getToken(req.headers);

  if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

  try {
    let { pageIndex, pageSize }= req.query;
    const { userId } = req.params;

    if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || !userId) {
        return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0: User ID is missing.');
    }

    pageIndex = parseInt(pageIndex);
    pageSize = parseInt(pageSize);

    const offset = (pageIndex - 1) * pageSize;
    const limit = pageSize;

    const cacheKey = `followers:page:${pageIndex}:user:${userId}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
        return sendSuccess(res, JSON.parse(cached), 'From cache');
    } 

    const { count, rows } = await Follow.findAndCountAll({
      where: { following_id: userId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'follower_id',
        [Sequelize.col('Follower.user_fname'), 'follower_fname'],
        [Sequelize.col('Follower.user_lname'), 'follower_lname'],
        [Sequelize.col('Follower.user_profile_picture'), 'follower_profile_picture']
      ],
      include: [{
        model: User,
        as: 'Follower',
        attributes: [],
      }],
      offset,
      limit,
      raw: true
    });

    const totalPages = Math.ceil(count / pageSize);
    const result = {
        pageIndex,
        pageSize,
        totalPages,
        totalRecords: count,
        followers: rows
    }

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 60 * 60);
    return sendSuccess(res, result);
  } catch (error) {
    console.error('Unable to retrieve followers: ', error);
    return sendError(res, '', 'Unable to retrieve followers.');
  }
}

exports.getFollowingByUserId = async (req, res) => {
    const token = getToken(req.headers);
  
    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
  
    try {
      let { pageIndex, pageSize }= req.query;
      const { userId } = req.params;
  
      if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || !userId) {
          return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0: User ID is missing.');
      }
  
      pageIndex = parseInt(pageIndex);
      pageSize = parseInt(pageSize);
  
      const offset = (pageIndex - 1) * pageSize;
      const limit = pageSize;
  
      const cacheKey = `following:page:${pageIndex}:user:${userId}`;
      const cached = await redisClient.get(cacheKey);
  
      if (cached) {
          return sendSuccess(res, JSON.parse(cached), 'From cache');
      } 
  
      const { count, rows } = await Follow.findAndCountAll({
        where: { follower_id: userId },
        order: [['createdAt', 'DESC']],
        attributes: [
            'id',
            'following_id',
            [Sequelize.col('Following.user_fname'), 'following_fname'],
            [Sequelize.col('Following.user_lname'), 'following_lname'],
            [Sequelize.col('Following.user_profile_picture'), 'following_profile_picture']
        ],
        include: [{
          model: User,
          as: 'Following',
          attributes: [],
        }],
        offset,
        limit,
        raw: true
      });
  
      const totalPages = Math.ceil(count / pageSize);
      const result = {
          pageIndex,
          pageSize,
          totalPages,
          totalRecords: count,
          following: rows
      }
  
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 60 * 60);
      return sendSuccess(res, result);
    } catch (error) {
      console.error('Unable to retrieve following: ', error);
      return sendError(res, '', 'Unable to retrieve following.');
    }
}

exports.followUserById = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);
    
    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    try {
        const { userId } = req.params;
        const followerId = decodedToken.user.id;

        const followerName =`${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;

        if (!userId) return sendError(res, '', 'No User Id detected');
        if (userId === followerId) return sendError(res, '', 'Unable to follow yourself.');

        const user = await User.findOne({
            where: { id: userId },
            raw: true,
        });

        if (!user) return sendError(res, '', 'User not found.');

        const [result, created] = await Follow.findOrCreate({
            where: {
                follower_id: followerId,
                following_id: parseInt(userId),
            },
            defaults: {
                follower_id: followerId,
                following_id: parseInt(userId),
            }
        })

        if (!created) return sendError(res, '', 'You are already following this user.');

        await clearFollowersCache(userId);
        await clearFollowingCache(followerId);

        await sendNotifiAndEmit({
          sender_id: followerId,
          recipient_id: userId,
          target_type: 'Follow',
          type: 'follow',
          message: `${followerName} started following you.`,
          io
        });    

        return sendSuccess(res, result, 'User followed successfully');
    } catch (err) {
        console.error('Unable to follow this user: ', err);
        sendError(res, '', 'Unable to follow this user.');
    }
};

exports.unfollowUserById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode');

    try {
         const { userId } = req.params;
         const unfollowerId = decodedToken.user.id;

         if (!userId) return sendError(res, '', 'No User Id detected');
         if (userId === unfollowerId) return sendError(res, '', 'Unable to unfollow yourself.');

         const follow = await Follow.findOne({
            where: {
              following_id: userId,
              follower_id: unfollowerId
            },
            raw: true
         });

         if (!follow) return sendError(res, '', 'You are not following this user, unable to unfollow.');

         await Follow.destroy({
            where: {
                following_id: userId,
                follower_id: unfollowerId
            }
         })

         await clearFollowersCache(userId);
         await clearFollowingCache(unfollowerId);

         return sendSuccess(res, null, 'User unfollowed successfully.');
    } catch (error) {
        console.error('Unable to Unfollow this user: ', error);
        return sendError(res, '', 'Unable to Unfollow this user.');
    }
}

const sendNotifiAndEmit = async ({sender_id, recipient_id, target_type, type, message, io}) => {
  const newNotif = await Notification.create({
    sender_id,
    recipient_id,
    target_type,
    type,
    message
  });

  const notification = await Notification.findOne({
    where: { id: newNotif.dataValues.id },
    raw: true
  });

  io.to(sender_id).emit('new_notification', notification);

  const subscription = await Subscription.findOne({
      where: { user_id: recipient_id },
      raw: true,
  });

  const subscriptionSub = typeof subscription.subscription === 'string'
                ? JSON.parse(subscription.subscription)
                : subscription.subscription;

  try {
      const fcmToken = subscriptionSub?.fcmToken; // Access safely
      
      if (fcmToken) {
          await sendNotification(
              fcmToken,
              'WOTG Community',
              message
          );
      }
  } catch (error) {
      console.error('Error sending push notification:', error);
  }
}