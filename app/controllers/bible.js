const axios = require("axios");
require("dotenv").config();
const redisClient = require("../../config/redis");
const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

const BIBLE_API_KEY = process.env.BIBLE_API_KEY;
const API_URL = "https://api.scripture.api.bible/v1";

// ✅ Fetch Bible versions with the correct response structure
exports.list = async (req, res) => {
    let token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, "", "Please login first."); // ✅ Check authentication

    try {
        // ✅ Get Pagination Parameters from Query
        let { pageIndex, pageSize } = req.query;
        pageIndex = parseInt(pageIndex) || 1; // Default to page 1 if not provided
        pageSize = parseInt(pageSize) || 10; // Default to 10 Bibles per page

        // ✅ Generate Cache Key (Unique per pagination)
        const cacheKey = `bible_versions_page_${pageIndex}_size_${pageSize}`;

        // ✅ Check Redis Cache First
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log(`⚡ Bible versions served from Redis Cache: ${cacheKey}`);
            return sendSuccess(res, JSON.parse(cachedData));
        }

        // ✅ Fetch from Bible API
        const response = await axios.get(`${API_URL}/bibles`, {
            headers: { "api-key": BIBLE_API_KEY },
        });

        // ✅ Filter only English Bibles
        const allBibles = response.data.data.filter(bible => bible.language.id === "eng");

        // ✅ Implement Pagination Logic
        const totalRecords = allBibles.length;
        const totalPages = Math.ceil(totalRecords / pageSize);
        const paginatedBibles = allBibles.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);

        // ✅ Transform Response Structure (Matches Blogs API)
        const transformedResponse = {
            totalRecords,
            pageIndex,
            pageSize,
            totalPages,
            bibles: paginatedBibles, 
        };

        // ✅ Store in Redis (Cache for 1 Hour)
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(transformedResponse));

        console.log(`✅ Bible versions fetched from API and cached: ${cacheKey}`);
        return sendSuccess(res, transformedResponse);
    } catch (error) {
        console.error("❌ Error fetching Bible versions:", error.message);
        return sendError(res, "Failed to fetch Bible versions.");
    }
};

// ✅ Fetch a single Bible by ID
exports.getById = async (req, res) => {
    let token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, "", "Please login first."); // ✅ Check authentication

    try {
        const { bibleId } = req.params;
        if (!bibleId) return sendError(res, "Bible ID is required.");

        // ✅ Generate Cache Key (Unique per Bible ID)
        const cacheKey = `bible_${bibleId}`;

        // ✅ Check Redis Cache First
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log(`⚡ Bible ${bibleId} served from Redis Cache`);
            return sendSuccess(res, JSON.parse(cachedData));
        }

        // ✅ Fetch Bible from API
        const response = await axios.get(`${API_URL}/bibles/${bibleId}`, {
            headers: { "api-key": BIBLE_API_KEY },
        });

        if (!response.data || !response.data.data) {
            return sendError(res, "Bible not found.");
        }

        const bible = response.data.data;

        // ✅ Store in Redis (Cache for 1 Hour)
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(bible));

        console.log(`✅ Cached Bible ${bibleId} in Redis`);

        // ✅ Return structured response
        return sendSuccess(res, bible);

    } catch (error) {
        console.error("❌ Error fetching Bible:", error.message);
        return sendError(res, "Failed to fetch Bible.");
    }
};
