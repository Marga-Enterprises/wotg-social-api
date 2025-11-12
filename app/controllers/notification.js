const Notification = require('../models/Notification');
const User = require('../models/User');
const Post = require('../models/Post');
const PostMedia = require('../models/PostMedia');
const Reaction = require('../models/Reaction');
const Comment = require('../models/Comment');

const { Op, Sequelize } = require('sequelize');
const { 
  sendError, 
  sendSuccess, 
  getToken, 
  sendErrorUnauthorized, 
  decodeToken, 
} = require('../../utils/methods');

const redisClient = require('../../config/redis');

// 🕒 Utility for timestamped and colored console logs
const log = (msg, color = '36') => {
  const time = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  console.log(`\x1b[${color}m[${time}] ${msg}\x1b[0m`);
};

exports.list = async (req, res) => {
  log('📬 [NotificationController] list() triggered', '36');

  const token = getToken(req.headers);
  const decodedToken = decodeToken(token);

  if (!token) {
    log('❌ Missing token. User not authenticated.', '31');
    return sendErrorUnauthorized(res, '', 'Please login first.');
  }

  if (!decodedToken) {
    log('❌ Token invalid or failed to decode.', '31');
    return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode token.');
  }

  const userId = decodedToken.user.id;
  log(`👤 Authenticated user ID: ${userId}`, '33');

  try {
    let { pageIndex, pageSize } = req.query;
    log(`📄 Received query params → pageIndex: ${pageIndex}, pageSize: ${pageSize}`, '36');

    // Validate query parameters
    if (
      !pageIndex ||
      !pageSize ||
      isNaN(pageIndex) ||
      isNaN(pageSize) ||
      pageIndex <= 0 ||
      pageSize <= 0
    ) {
      log('⚠️ Invalid or missing pagination parameters.', '33');
      return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
    }

    pageIndex = parseInt(pageIndex);
    pageSize = parseInt(pageSize);
    const offset = (pageIndex - 1) * pageSize;
    const limit = pageSize;

    log(`🔢 Pagination set → offset: ${offset}, limit: ${limit}`, '36');

    // Redis cache check
    const cacheKey = `notifications_user:${userId}_page:${pageIndex}_${pageSize}`;
    log(`🧠 Checking Redis cache for key: ${cacheKey}`, '36');

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      log('⚡ Cache hit! Returning cached notifications.', '32');
      return sendSuccess(res, JSON.parse(cached), 'From cache.');
    }

    log('🧠 Cache miss → Fetching notifications from database...', '33');
    const startTime = Date.now();

    const { count, rows } = await Notification.findAndCountAll({
      where: { recipient_id: userId },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
        },
        {
          model: Post,
          as: 'targetPost',
          attributes: [
            'id',
            'user_id',
            'content',
            'visibility',
            'reaction_count',
            'comments_count',
            'shares_count',
            'createdAt',
          ],
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
            },
            {
              model: PostMedia,
              as: 'media',
              attributes: ['id', 'url', 'type', 'thumbnail'],
            },
            {
              model: Reaction,
              as: 'reactions',
              attributes: ['id', 'user_id', 'post_id', 'type'],
              include: [
                {
                  model: User,
                  as: 'reactor',
                  attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
              ],
            },
            {
              model: Post,
              as: 'original_post',
              attributes: ['id', 'user_id', 'content'],
              include: [
                {
                  model: User,
                  as: 'author',
                  attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
                {
                  model: PostMedia,
                  as: 'media',
                  attributes: ['id', 'url', 'type', 'thumbnail'],
                },
              ],
            },
          ],
        },
        {
          model: Comment,
          as: 'targetComment',
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const endTime = Date.now();
    log(`⏱️ Database query completed in ${endTime - startTime}ms`, '36');

    const totalPages = Math.ceil(count / pageSize);
    log(`📊 Total records: ${count} | Total pages: ${totalPages}`, '36');

    const response = {
      pageIndex,
      pageSize,
      totalPages,
      totalRecords: count,
      notifications: rows,
    };

    // Cache result in Redis for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);
    log(`💾 Cached notifications in Redis for 1 hour. Key: ${cacheKey}`, '32');

    log('✅ Notifications retrieved successfully from database.', '32');
    return sendSuccess(res, response, 'Notifications retrieved successfully.');
  } catch (error) {
    log(`❌ Failed to retrieve notifications: ${error.message}`, '31');
    console.error(error);
    return sendError(res, '', 'Failed to retrieve notifications.');
  }
};
