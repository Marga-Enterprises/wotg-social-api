const Journal = require("../models/Journal");
const {
  sendError,
  sendSuccess,
  getToken,
  sendErrorUnauthorized,
  decodeToken
} = require("../../utils/methods");

const redisClient = require("../../config/redis");

const { clearJournalCache } = require("../../utils/clearBlogCache");
const { Op } = require("sequelize");

exports.list = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const decoded = decodeToken(token);
    const viewerId = parseInt(decoded.user.id);

    let { pageIndex, pageSize, userId } = req.query;

    // ✅ Validate pagination parameters
    if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
      return sendError(res, "", "Missing or invalid query parameters: pageIndex and pageSize must be > 0.");
    }

    pageIndex = parseInt(pageIndex);
    pageSize = parseInt(pageSize);
    const offset = (pageIndex - 1) * pageSize;
    const limit = pageSize;

    // ✅ Build dynamic Redis cache key
    const cacheKey = `journals:page:${pageIndex}:${pageSize}${userId ? `:user:${userId}` : ""}:viewer:${viewerId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached), "From cache");
    }

    // ✅ Universal filter respecting privacy
    const where = {
      [Op.or]: [
        { private: false },          // Public journals are visible to everyone
        { userId: viewerId }         // Private journals visible only to the owner
      ]
    };

    // ✅ Optional filter: only show journals from a specific user
    if (userId) {
      where.userId = parseInt(userId);
    }

    const { count, rows } = await Journal.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit,
      raw: true
    });

    const totalPages = Math.ceil(count / pageSize);

    const result = {
      totalRecords: count,
      pageIndex,
      pageSize,
      totalPages,
      journals: rows
    };

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result)); // Cache for 1 hour

    return sendSuccess(res, result);
  } catch (error) {
    console.error("📛 Journal list error:", error.message);
    return sendError(res, "", "Failed to fetch journals.");
  }
};

// ✏️ Create a journal
exports.create = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const { book, chapter, verse, language, question1, question2, question3 } = req.body;

    if (!book || !chapter || !verse || !language || !question1 || !question2 || !question3) {
      return sendError(res, "", "All fields are required.");
    }

    const journal = await Journal.create({
      userId: user.user.id,
      book,
      chapter,
      verse,
      language,
      question1,
      question2,
      question3
    });

    await clearJournalCache();
    return sendSuccess(res, journal, "Journal created successfully.");
  } catch (error) {
    console.error("Create error:", error.message);
    return sendError(res, "", "Failed to create journal.");
  }
};

// 🔍 Get a journal by ID
exports.getById = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const viewerId = user.user.id;
    const { id } = req.params;
    const cacheKey = `journal_${viewerId}_${id}`;

    // 🔍 Check cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);

      // 🔐 If cached journal is private and not owned by viewer, deny access
      if (parsed.private && parsed.userId !== viewerId) {
        return sendErrorUnauthorized(res, "", "You are not authorized to view this journal.");
      }

      return sendSuccess(res, parsed, "From cache");
    }

    // 🔍 Fetch from DB
    const journal = await Journal.findOne({
      where: { id },
      raw: true
    });

    if (!journal) {
      return sendError(res, "", "Journal not found.");
    }

    // 🔐 Check if viewer is allowed to access this journal
    if (journal.private && journal.userId !== viewerId) {
      return sendErrorUnauthorized(res, "", "You are not authorized to view this journal.");
    }

    // ✅ Cache for 1 hour
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(journal));

    return sendSuccess(res, journal);
  } catch (error) {
    console.error("GetById error:", error.message);
    return sendError(res, "", "Failed to fetch journal.");
  }
};

// 📝 Update a journal
exports.update = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const { id } = req.params;
    const { question1, question2, question3, private: isPrivate } = req.body;

    // 🔍 Find the journal by ID
    const journal = await Journal.findOne({ where: { id }, raw: true });

    if (!journal) {
      return sendError(res, "", "Journal not found.");
    }

    // 🔐 Check ownership
    if (journal.userId !== user.user.id) {
      return sendErrorUnauthorized(res, "", "You are not authorized to update this journal.");
    }

    // 📝 Prepare fields to update
    const updateData = {};
    if (typeof question1 === "string") updateData.question1 = question1;
    if (typeof question2 === "string") updateData.question2 = question2;
    if (typeof question3 === "string") updateData.question3 = question3;
    if (isPrivate !== undefined) updateData.private = !!parseInt(isPrivate);

    // 🚀 Perform update
    await Journal.update(updateData, { where: { id } });

    // 🧹 Clear journal-specific cache (for all viewers)
    await clearJournalCache(id);

    return sendSuccess(res, { id, ...updateData }, "Journal updated successfully.");
  } catch (error) {
    console.error("Update error:", error.message);
    return sendError(res, "", "Failed to update journal.");
  }
};


// ❌ Delete a journal
exports.delete = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const { id } = req.params;

    // 🔍 Check if the journal exists and is owned by the user
    const journal = await Journal.findOne({
      where: {
        id,
        userId: user.user.id
      },
      raw: true
    });

    if (!journal) {
      return sendErrorUnauthorized(res, "", "You are not authorized to delete this journal or it doesn't exist.");
    }

    // ❌ Delete the journal
    await Journal.destroy({ where: { id } });

    // 🧹 Clear related cache
    await clearJournalCache(id); // Pass journal ID to clear specific journal cache too

    return sendSuccess(res, { id }, "Journal deleted successfully.");
  } catch (error) {
    console.error("Delete error:", error.message);
    return sendError(res, "", "Failed to delete journal.");
  }
};

