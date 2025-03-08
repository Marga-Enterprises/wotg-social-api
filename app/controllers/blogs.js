const Blogs = require('../models/Blogs'); 

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

exports.list = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    try {
        // Extract and validate pagination parameters
        let { pageIndex, pageSize } = req.query;

        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
            return sendSuccess(res, null); // Return null if pagination params are invalid
        }

        // Convert to integers
        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        // Calculate offset
        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        // Fetch paginated blogs
        const { rows: blogs, count: totalRecords } = await Blogs.findAndCountAll({
            limit,
            offset,
            order: [['created_at', 'DESC']], // Order by latest blogs
        });

        // Return paginated response
        sendSuccess(res, {
            totalRecords,
            pageIndex,
            pageSize,
            totalPages: Math.ceil(totalRecords / pageSize),
            blogs,
        });
    } catch (error) {
        sendError(res, error);
    }
};

exports.getById = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    try {
        const { id } = req.params;

        // Validate ID
        if (!id || isNaN(id)) {
            return sendError(res, "Invalid blog ID provided.");
        }

        // Fetch blog by ID
        const blog = await Blogs.findOne({
            where: { id },
        });

        if (!blog) {
            return sendError(res, "Blog not found.");
        }

        sendSuccess(res, blog);
    } catch (error) {
        sendError(res, error);
    }
};
