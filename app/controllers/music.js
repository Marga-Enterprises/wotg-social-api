const Music = require("../models/Music");
const Album = require("../models/Album");
const PlaylistMusic = require("../models/PlaylistMusic");

const {
  sendError,
  sendSuccess,
  getToken,
  sendErrorUnauthorized,
  removeFileFromSpaces
} = require("../../utils/methods");

const uploadMemory = require('./uploadMemory');

const { uploadFileToSpaces } = require('./spaceUploader');

const { clearMusicCache } = require("../../utils/clearBlogCache");
const { Sequelize, Op } = require("sequelize");

const redisClient = require("../../config/redis");

exports.list = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        let { pageIndex, pageSize, albumId, search } = req.query;

        // ✅ Validate pagination parameters
        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
            return sendError(res, "", "Missing or invalid query parameters: pageIndex and pageSize must be > 0.");
        }

        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        // ✅ Build dynamic Redis cache key
        const cacheKey = `music:page:${pageIndex}:${pageSize}${albumId ? `:album:${albumId}` : ""}${search ? `:search:${search}` : ""}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), "From cache");
        }

        // Filtering based on albumId and search
        const where = {
            [Op.and]: [
                albumId ? { album_id: parseInt(albumId) } : {}, // Filter by albumId if provided
                search ? {
                    [Op.or]: [
                        { title: { [Op.like]: `%${search}%` } },
                        { artist_name: { [Op.like]: `%${search}%` } }
                    ]
                } : {}
            ]
        };   
        
        const { count, rows } = await Music.findAndCountAll({
            where,
            order: [["createdAt", "DESC"]],
            offset,
            attributes: [
                'id',
                'audio_url',
                'title',
                'artist_name',
                'duration',
                'album_id',
                [Sequelize.col('Album.cover_image'), 'cover_image']
            ],
            include: [ 
                { 
                    model: Album,
                    attributes: []
                }
            ],
            limit,
            raw: true
        });

        const totalPages = Math.ceil(count / pageSize);
        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalItems: count,
            musics: rows
        };

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 3600); // Cache for 1 hourq

        return sendSuccess(res, response);
    } catch (error) {
        console.error("Error in list function:", error);
        return sendError(res, "", "An error occurred while fetching the musics.");
    }
}

exports.getMusicById = async (req, res) => {
    let token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        const { musicId } = req.params;

        if (!musicId) return sendError(res, "", "Missing musicId parameter.");

        const cacheKey =  `music_${musicId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), "From cache");
        }

        const music = await Music.findOne({
            where: { id: musicId },
            attributes: [
                'id',
                'audio_url',
                'title',
                'artist_name',
                'album_id',
                [Sequelize.col('Album.cover_image'), 'cover_image']
            ],
            include: [
                {
                    model: Album,
                    attributes: []
                }
            ],
            raw: true
        });

        if (!music) {
            return sendError(res, "", "Music not found.");
        }

        await redisClient.set(cacheKey, JSON.stringify(music), 'EX', 3600); // Cache for 1 hour

        return sendSuccess(res, music, "Music retrieved successfully.");
    } catch (error) {
        console.error("Error in getMusicById function:", error);
        return sendError(res, "", "An error occurred while fetching the music.");
    };
}

exports.create = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        uploadMemory.single("file")(req, res, async (err) => {
            const { title, album_id, duration, track_number, is_explicit, genre } = req.body;

            if (!req.file) {
                return sendError(res, "", "Missing required field: file is required.");
            }

            // check if the album_id exists in the database
            const album = await Album.findOne({
                where: { id: album_id },
                raw: true
            });

            if (!album) {
                return sendError(res, "", "Album not found.");
            };

            // const processedFile  = await processAudio(req.file); 
            const uploadedUrl = await uploadFileToSpaces(req.file);

            const music = await Music.create({
                title,
                album_id,
                artist_name: "WOTG Praise", 
                audio_url: uploadedUrl,
                duration,
                track_number,
                is_explicit,
                genre
            });
    
            // Clear cache for the newly created music
            await clearMusicCache();
    
            return sendSuccess(res, music, "Music created successfully.");
        });
    } catch (error) {
        console.error("Error in create function:", error);
        return sendError(res, "", "An error occurred while creating the music.");
    };
};

exports.update = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");
    
    try {

        uploadMemory.single("file")(req, res, async (err) => {
            const { musicId } = req.params;
            const { title, album_id, duration, track_number, is_explicit, genre } = req.body;

            const music = await Music.findOne({
                where: { id: musicId },
                raw: true
            });

            if (!music) {
                return sendError(res, "", "Music not found.");
            };

            let audio_url = null;

            if (req.file) {
                // const oldFilePath = path.join(__dirname, "../../uploads", music.audio_url);
                removeFileFromSpaces('audios', music.audio_url); // Remove the old file
                audio_url = await uploadFileToSpaces(req.file); // Process the new file
            };

            await Music.update({
                title,
                album_id,
                artist_name: "WOTG Praise",
                audio_url,
                duration,
                track_number,
                is_explicit,
                genre
            }, {
                where: { id: musicId }
            });

            await clearMusicCache(musicId); // Clear cache for the updated music

            return sendSuccess(res, "", "Music updated successfully.");
        });

    } catch (error) {
        console.error("Error in update function:", error);
        return sendError(res, "", "An error occurred while updating the music.");
    }
};

exports.delete = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        const { musicId } = req.params;

        if (!musicId) return sendError(res, "", "Missing musicId parameter.")
        
        const music = await Music.findOne({
            where: { id: musicId },
            raw: true
        });

        if (!music) {
            return sendError(res, "", "Music not found.");
        }

        if (music.audio_url) {
            // const oldFilePath = path.join(__dirname, "../../uploads", music.audio_url);
            removeFileFromSpaces('audios', music.audio_url); // Remove the old file
        }

        await PlaylistMusic.destroy({
            where: { music_id: musicId }
        }); 

        await Music.destroy({
            where: { id: musicId }
        });

        await clearMusicCache(musicId); // Clear cache for the deleted music

        return sendSuccess(res, "", "Music deleted successfully.");
    } catch (error) {
        console.error("Error in delete function:", error);
        return sendError(res, "", "An error occurred while deleting the music.");
    }
};