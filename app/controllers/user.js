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
        if (!token) {
            return sendErrorUnauthorized(res, "", "Please login first.");
        }

        const decodedToken = decodeToken(token);

        try {
            const { id } = req.params;
            const { user_fname, user_lname, email, password } = req.body;
            const user = await User.findByPk(id);

            if (!user) {
                return sendError(res, "", "User not found.");
            }

            if (decodedToken.user.id !== user.id) {
                return sendErrorUnauthorized(res, "", "You are not authorized to update this user.");
            }

            // ✅ Delete old profile picture if new one uploaded
            if (req.file && user.user_profile_picture) {
                await removeFileFromSpaces('images', user.user_profile_picture)
            }

            // ✅ Update fields
            if (user_fname) user.user_fname = user_fname;
            if (user_lname) user.user_lname = user_lname;
            if (email) user.email = email;
            if (password) user.password = password;

            if (req.file) {
                try {
                    // const convertedFilename = await processImageToSpace(req.file);
                    const processedImage = await uploadFileToSpaces(req.file);
                    // If image was converted to webp, use it; else fallback to original filename
                    user.user_profile_picture = processedImage;
                } catch (convErr) {
                    console.error("❌ Image processing failed:", convErr);
                    return sendError(res, convErr, "Image processing failed.");
                }
            }

            await user.save();
            return sendSuccess(res, user);
        } catch (error) {
            console.error("❌ Error updating user:", error);
            return sendError(res, error, "Failed to update user.");
        }
    });
};
