const Notification = require('../models/Notification');
const User = require('../models/User');
const Post = require('../models/Post');
const PostMedia = require('../models/PostMedia');
const Reaction = require('../models/Reaction');
const Comment = require('../models/Comment');

const { 
  sendError, 
  sendSuccess, 
  getToken, 
  sendErrorUnauthorized, 
  decodeToken 
} = require('../../utils/methods');

const redisClient = require('../../config/redis');

exports.list = async (req, res) => {
  const token = getToken(req.headers);
  const decodedToken = decodeToken(token);

  if (!token) {
    return sendErrorUnauthorized(res, '', 'Please login first.');
  }

  if (!decodedToken) {
    return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode token.');
  }

  const userId = decodedToken.user.id;

  try {
    let { pageIndex, pageSize } = req.query;

    if (
      !pageIndex ||
      !pageSize ||
      isNaN(pageIndex) ||
      isNaN(pageSize) ||
      pageIndex <= 0 ||
      pageSize <= 0
    ) {
      return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
    }

    pageIndex = parseInt(pageIndex);
    pageSize = parseInt(pageSize);

    const offset = (pageIndex - 1) * pageSize;
    const limit = pageSize;

    const cacheKey = `notifications_user:${userId}_page:${pageIndex}_${pageSize}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return sendSuccess(res, JSON.parse(cached), 'From cache.');
    }

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

    const totalPages = Math.ceil(count / pageSize);

    const response = {
      pageIndex,
      pageSize,
      totalPages,
      totalRecords: count,
      notifications: rows,
    };

    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);

    return sendSuccess(res, response, 'Notifications retrieved successfully.');
  } catch (error) {
    return sendError(res, '', 'Failed to retrieve notifications.');
  }
};
