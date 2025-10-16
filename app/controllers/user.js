const User = require('../models/User'); // Import User model
const { Op } = require('sequelize'); // Import Sequelize Operators

const { uploadFileToSpaces } = require('./spaceUploader');
const uploadMemory = require('./uploadMemory');

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    processImageToSpace,
    removeFileFromSpaces
} = require("../../utils/methods");

const { clearPostsCache, clearCommentsCache, clearRepliesCache, clearNotificationsCache, clearUsersCache } = require('../../utils/clearBlogCache');

exports.list = async (req, res) => {
  let token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    const { search, guestFilter, dateFrom, dateTo } = req.query;

    // Build dynamic where condition
    const whereClause = {};

    // 🔍 Search by first name, last name, or email
    if (search && search.trim() !== "") {
      const searchTerms = search
        .split(" ")
        .filter((term) => term.trim() !== "");

      whereClause[Op.or] = searchTerms.flatMap((term) => [
        { user_fname: { [Op.like]: `%${term}%` } },
        { user_lname: { [Op.like]: `%${term}%` } },
        { email: { [Op.like]: `%${term}%` } },
      ]);
    }

    // 🧑‍💻 Guest filter
    if (guestFilter === "guest") {
      whereClause.guest_account = true;
    } else if (guestFilter === "nonguest") {
      whereClause.guest_account = false;
    }
    // default = both → no guest filter applied

    // 📅 Date filter
    if (dateFrom && dateTo) {
      whereClause.registered_at = {
        [Op.between]: [new Date(dateFrom), new Date(dateTo)],
      };
    } else if (dateFrom) {
      whereClause.registered_at = { [Op.gte]: new Date(dateFrom) };
    } else if (dateTo) {
      whereClause.registered_at = { [Op.lte]: new Date(dateTo) };
    }

    // 🧭 Fetch filtered users
    const users = await User.findAll({
      where: whereClause,
      attributes: [
        "id",
        "email",
        "user_fname",
        "user_lname",
        "guest_account",
        "registered_at",
      ],
      order: [["registered_at", "DESC"]],
    });

    return sendSuccess(res, users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return sendError(res, error, "Failed to fetch users.");
  }
};


exports.get = async (req, res) => {
    let token = getToken(req.headers);
    const decodedToken = decodeToken(token);
    if (token) {
        try {
            const { id } = req.params;

            const user = await User.findByPk(id);

            if (decodedToken.user.id !== user.id) {
                return sendErrorUnauthorized(res, "", "You are not authorized to view this user.");
            }

            if (!user) {
                return sendError(res, "", "User not found.");
            }

            return sendSuccess(res, user);
        } catch (error) {
            console.error('Error fetching user:', error);
            return sendError(res, error, 'Failed to fetch user.');
        }
    } else {
        return sendErrorUnauthorized(res, "", "Please login first.");
    }
};

exports.update = async (req, res) => {
  uploadMemory.single("file")(req, res, async (err) => {
    if (err) {
      console.error("❌ Error uploading file:", err);
      return sendError(res, err, "Failed to upload file.");
    }

    let token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    const decodedToken = decodeToken(token);

    try {
      const { id } = req.params;
      const { user_fname, user_lname, email, password } = req.body;
      const user = await User.findByPk(id);

      if (!user) return sendError(res, "", "User not found.");

      if (decodedToken.user.id !== user.id) {
        return sendErrorUnauthorized(res, "", "You are not authorized to update this user.");
      }

      // ✅ Delete old profile picture if new one uploaded
      if (req.file && user.user_profile_picture) {
        await removeFileFromSpaces("images", user.user_profile_picture);
      }

      // ✅ Update fields
      if (user_fname) user.user_fname = user_fname;
      if (user_lname) user.user_lname = user_lname;
      if (email) user.email = email;
      if (password) user.password = password;

      // ✅ Upload new file to DigitalOcean Spaces
      if (req.file) {
        try {
          const convertedFilename = await processImageToSpace(req.file);
          const processedImage = await uploadFileToSpaces(convertedFilename);
          user.user_profile_picture = processedImage;
        } catch (convErr) {
          console.error("❌ Image processing failed:", convErr);
          return sendError(res, convErr, "Image processing failed.");
        }
      }

      // ✅ Save changes
      await user.save();

      // ✅ Clear all relevant caches
      await Promise.all([
        clearPostsCache(),
        clearCommentsCache(),
        clearRepliesCache(),
        clearNotificationsCache(),
        clearUsersCache(user.id), // ✅ new addition
      ]);

      return sendSuccess(res, user);
    } catch (error) {
      console.error("❌ Error updating user:", error);
      return sendError(res, error, "Failed to update user.");
    }
  });
};

