const Notification = require('../models/Notification');
const User = require('../models/User');

const { Op, Sequelize } = require('sequelize');
const { 
    sendError, 
    sendSuccess, 
    getToken, 
    sendErrorUnauthorized, 
    decodeToken, 
} = require('../../utils/methods');

const redisClient = require('../../config/redis');

exports.list = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token nat valid, unable to decode token.');

    const userId = decodedToken.user.id;

    try {
        let { pageIndex, pageSize } = req.query;

        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
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

        const { count, rows} = await Notification.findAndCountAll({
            where: {
                recipient_id: userId,
            },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
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
            notifications: rows
        }

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60); // Cache for 1 hour
        return sendSuccess(res, response, 'Notifications retrieved successfully.');
    } catch (error) {
        console.error('Failed to retrieve notifications:', error);
        return sendError(res, '', 'Failed to retrieve notifications.');
    }
}