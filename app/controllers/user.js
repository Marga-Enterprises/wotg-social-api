const User = require('../models/User'); // Import User model
const { Op } = require('sequelize'); // Import Sequelize Operators

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
} = require("../../utils/methods");

exports.list = async (req, res) => {
    let token = getToken(req.headers);
    if (token) {
        try {
            // Extract the search query from request parameters (or query string)
            const { search } = req.query;

            let whereCondition = {};
            let results = [];

            if (search && search.trim() !== '') {
                // Split the search query into individual words
                const searchTerms = search.split(' ').filter(term => term.trim() !== '');

                // Build dynamic conditions for each word (partial matches)
                whereCondition = {
                    [Op.or]: searchTerms.map(term => ({
                        [Op.or]: [
                            { user_fname: { [Op.like]: `%${term}%` } }, // Partial match in user_fname
                            { user_lname: { [Op.like]: `%${term}%` } }, // Partial match in user_lname
                        ],
                    })),
                };
            }

            // Fetch users with or without the search condition
            results = await User.findAll({
                where: whereCondition, // Empty `whereCondition` fetches all users
                attributes: ['id', 'email', 'user_fname', 'user_lname'], // Only select these fields
                order: search && search.trim() !== '' ? [] : [['user_fname', 'ASC']], // Sort alphabetically by user_fname if no search query
            });

            // Sort results: exact matches (full name) on top if a search query is provided
            if (search && search.trim() !== '') {
                results = results.sort((a, b) => {
                    const fullNameA = `${a.user_fname} ${a.user_lname}`.toLowerCase();
                    const fullNameB = `${b.user_fname} ${b.user_lname}`.toLowerCase();
                    const searchLower = search.toLowerCase();

                    // Exact match gets the highest priority
                    if (fullNameA === searchLower) return -1;
                    if (fullNameB === searchLower) return 1;

                    // Otherwise, keep original order
                    return 0;
                });
            }

            return sendSuccess(res, results);
        } catch (error) {
            console.error('Error fetching users:', error);
            return sendError(res, error, 'Failed to fetch users.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};
