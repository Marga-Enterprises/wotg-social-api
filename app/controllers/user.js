const User = require('../models/User'); // Import User model

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
            // Fetch only the desired fields from the User model
            const users = await User.findAll({
                attributes: ['id', 'email', 'user_fname', 'user_lname'] // Only select these fields
            });
            return sendSuccess(res, users);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};
