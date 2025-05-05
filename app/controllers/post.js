const Post = require('../models/Post');
const User = require('../models/User');
const PostMedia = require('../models/PostMedia');

const { 
    sendError, 
    sendSuccess, 
    getToken, 
    sendErrorUnauthorized, 
    decodeToken, 
    processImageToSpace,
    removeFileFromSpaces
} = require('../../utils/methods');

const redisClient = require('../../config/redis');
const { clearPostsCache } = require('../../utils/clearBlogCache');

const { Op, Sequelize } = require('sequelize');

exports.list = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendError(res, '', 'Please log in first.');

    try {
        let { pageIndex, pageSize, userId } = req.query;

        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize)) {
            return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
        }

        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        const cacheKey = `posts:page:${pageIndex}:${pageSize}:${userId ? `user:${userId}` : ''}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }

        const where = {};

        if (userId) {
          where[Op.or] = [{ user_id: userId }];
        }

        const { count, rows } = await Post.findAndCountAll({
            where,
            order: Sequelize.literal('RAND()'),
            offset,
            limit,
            raw: true, // required for Sequelize.col to work
            attributes: [
                'id',
                'user_id',
                'content',
                'visibility',
                'reaction_count',
                'comments_count',
                'shares_count',
                [Sequelize.col('author.user_fname'), 'author_fname'],
                [Sequelize.col('author.user_lname'), 'author_lname'],
            ],
            include: [
                {
                model: User,
                as: 'author',
                attributes: [], // must be empty when using Sequelize.col
                }
            ],
        });

        const totalPages = Math.ceil(count / pageSize);
        
        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalRecords: count,
            posts: rows
        }

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);

        return sendSuccess(res, response, 'Playlist retrieve successfully.')
    } catch (error) {
        console.log('Unable to retrieve posts: ', error);
        return sendError(res, '', 'Unable to retrieve posts');
    };
};

exports.getById = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) sendErrorUnauthorized(res, '', 'Please log in first.');

    try {
        const { postId } = req.params;

        if (!postId) return sendError(res, '', 'No Post ID provided.');

        const cacheKey = `post_${postId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From Cached');
        }

        const post = await Post.findOne({
            where: { id: postId },
            include: {

            }
        });

        if (!post) sendError(res, '', 'Post not found.');

        await redisClient.set(cacheKey, JSON.stringify(post), 'EX', 60 * 60);

        return sendSuccess(res, post, 'Post retrieve successfully');
    } catch (error) {
        console.error('Unable to get post.');
        return sendError(res, '', 'Unable to get post.');
    };
};