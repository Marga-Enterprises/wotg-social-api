const Album = require("../models/Album");
const Music = require("../models/Music");
const PlaylistMusic = require("../models/PlaylistMusic");

const { 
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken,
    processImageToSpace,
    removeFileFromSpaces
} = require("../../utils/methods");

const { uploadFileToSpaces } = require('./spaceUploader');

const uploadMemory = require('./uploadMemory');

const { clearAlbumCache } = require("../../utils/clearBlogCache");

const redisClient = require("../../config/redis");

exports.list = async (req, res) => {
    const token = getToken(req.headers);
    
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        let { pageIndex, pageSize } = req.query;

        // ✅ Validate pagination parameters
        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
            return sendError(res, "", "Missing or invalid query parameters: pageIndex and pageSize must be > 0.");
        }
    
        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;
    
        // ✅ Build dynamic Redis cache key
        const cacheKey = `albums:page:${pageIndex}:${pageSize}`;
    
        const cached = await redisClient.get(cacheKey);
    
        if (cached) {
            return sendSuccess(res, JSON.parse(cached), "From cache");
        }
    
        const { count, rows } = await Album.findAndCountAll({
            order: [["createdAt", "DESC"]],
            offset,
            limit,
            raw: true
        });

        const totalPages = Math.ceil(count / pageSize);

        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalRecords: count,
            albums: rows
        };

        // ✅ Cache the response for future requests
        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 3600); // Cache for 1 hour

        return sendSuccess(res, response, "Albums retrieved successfully.");
    } catch (error) {
        console.error("Error in album controller:", error);
        return sendError(res, "", "An error occurred while processing your request.");
    }
};

exports.getAlbumById = async (req, res) => {
    const token = getToken(req.headers);
    
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        const { albumId } = req.params;

        // ✅ Validate albumId
        if (!albumId || isNaN(albumId)) {
            return sendError(res, "", "Missing or invalid parameter: albumId must be a number.");
        }

        const cacheKey = `album_${albumId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), "From cache");
        }

        const album = await Album.findOne({
            where: { id: albumId },
            raw: true
        });

        if (!album) {
            return sendError(res, "", "Album not found.");
        }

        // ✅ Cache the album data for future requests
        await redisClient.set(cacheKey, JSON.stringify(album), 'EX', 3600); // Cache for 1 hour

        return sendSuccess(res, album, "Album retrieved successfully.");
    } catch (error) {
        console.error("Error in getAlbumById function:", error);
        return sendError(res, "", "An error occurred while fetching the album.");
    }
};

exports.create = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");
    if (!decodedToken) return sendErrorUnauthorized(res, "", "Invalid token.");

    if (decodedToken.user.user_role !== "admin" && decodedToken.user.user_role !== "owner") {
        return sendErrorUnauthorized(res, "", "You are not authorized to perform this action.");
    };

    try {
        uploadMemory.single("file")(req, res, async () => {
            const { title, release_date, type } = req.body;

            let cover_image = null;
            let processed_image = null;

            // ✅ Validate required fields
            if (!title || !type) {
                return sendError(res, "", "Missing required fields: title, and type are required.");
            }
    
            // ✅ Validate type
            const validTypes = ["album", "single", "compilation"];

            if (!validTypes.includes(type)) {
                return sendError(res, "", `Invalid type. Valid types are: ${validTypes.join(", ")}`);
            }

            if (req.file) {
                cover_image = await processImageToSpace(req.file);
                processed_image = await uploadFileToSpaces(cover_image);
            }
    
            const result = await Album.create({
                title,
                artist_name: 'WOTG Praise',
                cover_image: processed_image,
                release_date,
                type,
                label: 'WOTG Praise',
            });
    
            // ✅ Clear cache for albums list after creating a new album
            await clearAlbumCache();
    
            return sendSuccess(res, result);
        });
    } catch (error) {
        console.error("Error in album controller:", error);
        return sendError(res, "", "An error occurred while processing your request.");
    }
};

exports.deleteAlbumById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");
    if (!decodedToken) return sendErrorUnauthorized(res, "", "Invalid token.");

    if (decodedToken.user.user_role !== "admin" && decodedToken.user.user_role !== "owner") {
        return sendErrorUnauthorized(res, "", "You are not authorized to perform this action.");
    };

    try {
        const { albumId } = req.params;

        if (!albumId || isNaN(albumId)) {
            return sendError(res, "", "Missing or invalid parameter: albumId must be a number.");
        };

        const album = await Album.findOne({ where: { id: albumId } });

        if (!album) {
            return sendError(res, "", "Album not found.");
        };

        // DELETE THE IMAGE FILE
        if (album.cover_image) {
            removeFileFromSpaces('images', album.cover_image)
        }

        await Music.findAll({ where: { album_id: albumId } })
        .then(musics => {
            musics.forEach(music => {
                PlaylistMusic.destroy({
                    where: { music_id: music.id }
                });
            });
        });
        
        await Music.destroy({ where: { album_id: albumId } });

        // DELETE THE ALBUM
        await Album.destroy({ where: { id: albumId } });

        // ✅ Clear cache for albums list after deleting an album
        await clearAlbumCache(albumId);

        return sendSuccess(res, {}, "Album deleted successfully.");
    } catch (error) {
        console.error("Error in deleteById function:", error);
        return sendError(res, "", "An error occurred while deleting the album.");
    }
};

exports.updateAlbumById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);
    
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");
    if (!decodedToken) return sendErrorUnauthorized(res, "", "Invalid token.");
    
    if (decodedToken.user.user_role !== "admin" && decodedToken.user.user_role !== "owner") {
        return sendErrorUnauthorized(res, "", "You are not authorized to perform this action.");
    };

    try {
        uploadMemory.single("file")(req, res, async () => {
            const { albumId } = req.params;
            const { title, release_date, type } = req.body;
    
            if (!albumId || isNaN(albumId)) return sendError(res, "", "Missing or invalid parameter: albumId must be a number.");
    
            if (!title || !type) {
                return sendError(res, "", "Missing required fields: title, and type are required.");
            }
    
            const album = await Album.findOne({ where: { id: albumId } });

            let cover_image = album.cover_image;
            let processed_image = null;

            if (!album) {
                return sendError(res, "", "Album not found.");
            }


            if (req.file) {
                removeFileFromSpaces('images', album.cover_image)
                cover_image = await processImageToSpace(req.file);
                processed_image = await uploadFileToSpaces(cover_image);
            }

            // ✅ Validate type
            const validTypes = ["album", "single", "compilation"];
            if (!validTypes.includes(type)) {
                return sendError(res, "", `Invalid type. Valid types are: ${validTypes.join(", ")}`);
            }

            // UPDATE THE ALBUM
            await Album.update({
                title,
                cover_image: processed_image,
                release_date,
                type,
            }, { where: { id: albumId } });

            await clearAlbumCache(albumId);

            // response to the user
            return sendSuccess(res, {}, "Album updated successfully.");
        });
    } catch (error) {
        console.error("Error in updateAlbumById function:", error);
        return sendError(res, "", "An error occurred while updating the album.");
    }
};