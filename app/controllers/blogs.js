const Blogs = require('../models/Blogs'); 
const { Op } = require("sequelize");
const { upload } = require('./upload'); // ✅ Import the corrected upload handler
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

const moment = require("moment-timezone");


exports.list = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    const decodedToken = decodeToken(token);
    const userRole = decodedToken.user.user_role;

    try {
        // Get current date and format it correctly for database comparison
        const today = moment().tz("Asia/Manila").endOf('day').format("YYYY-MM-DD HH:mm:ss");

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

        // Base filter
        let whereCondition = { blog_approved: true };

        // If user is 'user', add blog_release_date_and_time filter
        if (userRole === 'user') {
            whereCondition.blog_release_date_and_time = { [Op.lte]: today };
        }

        // Fetch paginated blogs, sorted by `blog_release_date_and_time` (most recent first)
        const { rows: blogs, count: totalRecords } = await Blogs.findAndCountAll({
            limit,
            offset,
            where: whereCondition, // Dynamic filtering based on userRole
            order: [['blog_release_date_and_time', 'DESC']], // Sort by most recent release date
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

        // Decode token to check user role
        const decodedToken = decodeToken(token);
        const userRole = decodedToken.user.user_role;

        // Get the current date-time in Asia/Manila (full timestamp)
        const now = moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");

        // Base filter: Only allow approved blogs
        let whereCondition = { id, blog_approved: true };

        // If user is 'user', restrict to released blogs
        if (userRole === 'user') {
            whereCondition.blog_release_date_and_time = { [Op.lte]: now };
        }

        // Fetch blog by ID
        const blog = await Blogs.findOne({ where: whereCondition });

        // Check if blog exists
        if (!blog) {
            return sendError(res, "Blog not found or not yet available.");
        }

        sendSuccess(res, blog);
    } catch (error) {
        sendError(res, error);
    }
};


exports.uploadVideo = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    const { id } = req.params;

    try {
        const blog = await Blogs.findByPk(id);
        if (!blog) {
            return sendError(res, "Blog not found.");
        }

        upload.single("file")(req, res, async (err) => {
            if (err) {
                console.log("UPLOAD ERROR:", err.message); // ✅ Debugging Log
                return sendError(res, "Video upload failed: " + err.message);
            }

            if (!req.file) {
                console.log("UPLOAD ERROR: No file received."); // ✅ Debugging Log
                return sendError(res, "No video file uploaded.");
            }

            const newFileName = req.file.filename; // ✅ Correct filename reference
            const uploadPath = path.join(__dirname, "../../uploads", newFileName); // ✅ Ensure root uploads/

            console.log("New Uploaded File:", newFileName); // ✅ Debugging Log

            // ✅ Validate WebM File Before Processing
            if (path.extname(newFileName).toLowerCase() !== ".webm") {
                fs.unlinkSync(uploadPath); // Delete invalid file
                console.log("UPLOAD ERROR: Invalid file format.");
                return sendError(res, "Invalid file format. Please upload a WebM video.");
            }

            // ✅ Delete the old WebM video if it exists
            if (blog.blog_video) {
                const oldFilePath = path.join(__dirname, "../../uploads", blog.blog_video);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath); // ✅ Remove old WebM file
                    console.log("Old File Deleted:", blog.blog_video);
                }
            }

            // ✅ Update database with new WebM filename
            blog.blog_video = newFileName;
            await blog.save();

            console.log("Video uploaded successfully:", newFileName); // ✅ Debugging Log

            sendSuccess(res, {
                message: "WebM video uploaded successfully.",
                blog_id: blog.id,
                video_url: newFileName, // ✅ Send filename for frontend
            });
        });

    } catch (error) {
        console.log("UPLOAD ERROR:", error.message); // ✅ Debugging Log
        sendError(res, error);
    }
};

