const Blogs = require('../models/Blogs'); 
const { Op } = require("sequelize");
const { uploadFileToSpaces } = require('./spaceUploader');
const uploadMemory = require('./uploadMemory');
const redisClient = require("../../config/redis");

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    processVideoToSpace,
    removeFileFromSpaces
} = require("../../utils/methods");

const { clearBlogCache } = require("../../utils/clearBlogCache");

const moment = require("moment-timezone");


exports.list = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    const decodedToken = decodeToken(token);

    // console.log("[[[[[[[[[Decoded Token:]]]]]]]]]", decodedToken);

    const userRole = decodedToken.user_role;

    try {
        // Get current date in Manila timezone
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

        // If user is 'member', add blog_release_date_and_time filter
        if (userRole === 'member') {
            whereCondition.blog_release_date_and_time = { [Op.lte]: today };
        }

        // ✅ Generate Cache Key (Unique per pagination & user role)
        const cacheKey = `blogs_page_${pageIndex}_size_${pageSize}_role_${userRole}`;

        // ✅ Check Redis Cache First
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log(`⚡ Blogs served from Redis Cache: ${cacheKey}`);
            return sendSuccess(res, JSON.parse(cachedData));
        }

        // ✅ Fetch paginated blogs from database
        const { rows: blogs, count: totalRecords } = await Blogs.findAndCountAll({
            limit,
            offset,
            where: whereCondition, // Dynamic filtering based on userRole
            order: [['blog_release_date_and_time', 'DESC']], // Sort by most recent release date
        });

        // Prepare paginated response
        const responseData = {
            totalRecords,
            pageIndex,
            pageSize,
            totalPages: Math.ceil(totalRecords / pageSize),
            blogs,
        };

        // ✅ Store the result in Redis (cache for 1 hour)
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(responseData));

        console.log(`✅ Cached Blogs in Redis: ${cacheKey}`);

        // Return response
        sendSuccess(res, responseData);
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

        // ✅ Validate ID
        if (!id || isNaN(id)) {
            return sendError(res, "Invalid blog ID provided.");
        }

        // ✅ Generate Cache Key (Unique per blog ID)
        const cacheKey = `blog_${id}`;

        // ✅ Check Redis Cache First
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log(`⚡ Blog ${id} served from Redis Cache`);
            return sendSuccess(res, JSON.parse(cachedData));
        }

        // ✅ Decode Token to Check User Role
        const decodedToken = decodeToken(token);
        const userRole = decodedToken.user_role;

        // ✅ Get the Current Date-Time in Asia/Manila (full timestamp)
        const now = moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");

        // ✅ Base Filter: Only Allow Approved Blogs
        let whereCondition = { id, blog_approved: true };

        // ✅ If user is 'member', restrict to released blogs
        if (userRole === "member") {
            whereCondition.blog_release_date_and_time = { [Op.lte]: now };
        }

        // ✅ Fetch Blog by ID from Database
        const blog = await Blogs.findOne({ where: whereCondition });

        // ✅ Check if Blog Exists
        if (!blog) {
            return sendError(res, "Blog not found or not yet available.");
        }

        // ✅ Store the Blog in Redis (cache for 1 hour)
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(blog));

        console.log(`✅ Cached Blog ${id} in Redis`);

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

    const decodedToken = decodeToken(token);
    const userId = decodedToken.user.id;
    const { id } = req.params;

    try {
        const blog = await Blogs.findByPk(id);
        if (!blog) return sendError(res, {}, "Blog not found.");

        uploadMemory.single("file")(req, res, async (err) => {
            if (err || !req.file) {
                return sendError(res, {}, "Video upload failed or no file.");
            }

            const file = req.file;

            let convertedVideo = null;
            let processedVideo = null;

            if (file) {
                convertedVideo = await processVideoToSpace(file);
                processedVideo = await uploadFileToSpaces(convertedVideo);
            }

            await Blogs.update({
                blog_video: processedVideo,
                blog_uploaded_by: userId
            }, { where: { id } });

            await clearBlogCache(id);

            return sendSuccess(res, {
                message: "Video received. Processing...",
                blog_id: blog.id,
                uploaded_by: userId,
            });
        });
    } catch (error) {
        sendError(res, error, "Internal Server Error");
    }
};



exports.deleteVideo = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }

    const decodedToken = decodeToken(token);
    const userId = decodedToken.user.id; // ✅ Extract logged-in user ID
    const userRole = decodedToken.user_role; // ✅ Extract user role

    const { id } = req.params; // Blog ID from request params

    try {
        // ✅ Find the blog entry
        const blog = await Blogs.findByPk(id);
        if (!blog) {
            return sendError(res, "Blog not found.");
        }

        // ✅ Check if the user is authorized to delete the video
        if (userRole !== "admin" && userRole !== "owner" && blog.blog_uploaded_by !== userId) {
            return sendErrorUnauthorized(res, "", "You are not authorized to delete this video.");
        }

        // ✅ Check if a video exists
        if (!blog.blog_video) {
            return sendError(res, "No video associated with this blog.");
        }

        removeFileFromSpaces('videos', blog.blog_video);

        // ✅ Update the database to remove the video reference
        blog.blog_video = null;
        await blog.save();

        // ✅ Clear Redis Cache for this blog & paginated blogs
        await clearBlogCache(id);

        sendSuccess(res, { message: "Video deleted successfully." });
    } catch (error) {
        console.error("Error in deleteVideo:", error);
        sendError(res, error);
    }
};

exports.clearForBlogCacheForAdmin = async (req, res) => {
    try {
        console.log("🗑️ Clearing all blog-related cache...");

        // ✅ Delete all paginated blogs cache
        const keys = await redisClient.keys("blogs_page_*");
        if (keys.length > 0) {
            await redisClient.del(keys);
            console.log("🗑️ Paginated blog cache cleared.");
        }

        // ✅ Delete individual blog caches
        const blogKeys = await redisClient.keys("blog_*");
        if (blogKeys.length > 0) {
            await redisClient.del(blogKeys);
            console.log("🗑️ Individual blog caches cleared.");
        }

        return res.json({ success: true, message: "Cache cleared successfully." });
    } catch (error) {
        console.error("❌ Error clearing blog cache:", error);
        return res.status(500).json({ success: false, message: "Error clearing cache." });
    }
};





