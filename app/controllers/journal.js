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

// 🔄 List all journals of the current user with pagination + Redis
exports.list = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const pageIndex = Math.max(parseInt(req.query.pageIndex) || 0, 0);
    const pageSize = Math.min(parseInt(req.query.pageSize) || 10, 100);
    const offset = pageIndex * pageSize;

    const cacheKey = `journals_${user.id}_page_${pageIndex}_${pageSize}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached), "From cache");
    }

    // 🔍 Dynamic where clause: Only show private journals of the current user, but all public ones
    const where = {
      [Op.or]: [
        { private: false },
        { userId: user.id }
      ]
    };

    const { count, rows } = await Journal.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: pageSize,
      raw: true
    });

    const result = {
      items: rows,
      total: count,
      pageIndex,
      pageSize
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600);
    return sendSuccess(res, result);
  } catch (error) {
    console.error("List error:", error.message);
    return sendError(res, "", "Failed to fetch journals.");
  }
};


// ✏️ Create a journal
exports.create = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const user = decodeToken(token);
    const { book, chapter, verse, content } = req.body;

    if (!book || !chapter || !verse || !content) {
      return sendError(res, "", "All fields are required.");
    }

    const journal = await Journal.create({
      userId: user.id,
      book,
      chapter,
      verse,
      content
    });

    await clearJournalCache(user.id);
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
    const { id } = req.params;

    const journal = await Journal.findOne({
      where: {
        id,
        userId: user.id
      },
      raw: true
    });

    if (!journal) {
      return sendError(res, "", "Journal not found.");
    }

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
    const { content } = req.body;

    const [updated] = await Journal.update(
      { content },
      {
        where: {
          id,
          userId: user.id
        }
      }
    );

    if (!updated) {
      return sendError(res, "", "Journal not found or not updated.");
    }

    await clearJournalCache(user.id);
    return sendSuccess(res, { id, content }, "Journal updated successfully.");
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

    const deleted = await Journal.destroy({
      where: {
        id,
        userId: user.id
      }
    });

    if (!deleted) {
      return sendError(res, "", "Journal not found or already deleted.");
    }

    await clearJournalCache(user.id);
    return sendSuccess(res, { id }, "Journal deleted successfully.");
  } catch (error) {
    console.error("Delete error:", error.message);
    return sendError(res, "", "Failed to delete journal.");
  }
};
