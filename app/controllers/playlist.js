const Playlist = require('../models/Playlist');
const PlaylistMusic = require('../models/PlaylistMusic');
const Music = require('../models/Music');

const { Op } = require('sequelize');
const { sendError, sendSuccess, getToken, sendErrorUnauthorized, decodeToken, processImage, removeFile } = require('../../utils/methods');
const upload = require('./upload');

const path = require('path');
const { clearPlaylistCache } = require('../../utils/clearBlogCache');
const redisClient = require('../../config/redis');

exports.list = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);
    const userId = decodedToken ? decodedToken.user.id : null;

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

    try {
        let { pageIndex, pageSize} = req.query;

        // ✅ Validate pagination parameters
        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize) || pageIndex <= 0 || pageSize <= 0) {
            return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
        }

        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);
        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        // ✅ Build dynamic Redis cache key
        const cacheKey = `playlists:page:${pageIndex}:${pageSize}:${userId ? `user:${userId}` : ''}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }

        const where = {
            [Op.or]: [      
                { created_by: userId }    
            ]
        };

        const { count, rows } = await Playlist.findAndCountAll({
            order: [['createdAt', 'DESC']],
            where,
            offset,
            limit,
            raw: true
        });

        const totalPages = Math.ceil(count / pageSize);
        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalCount: count,
            playlists: rows
        };

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60); // Cache for 1 hour
        return sendSuccess(res, response, 'Playlists retrieved successfully.');
    } catch (error) {
        console.error('Error in playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.getPlaylistById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    const userId = decodedToken ? decodedToken.user.id : null;

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

    try {
        const { playListId } = req.params;

        if (!playListId) {
            return sendError(res, '', 'Missing or invalid query parameter: playListId.');
        }

        const cacheKey = `playlist_${playListId}`;

        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }

        const playlist = await Playlist.findOne({
            where: { id: playListId },
            raw: true
        });

        if (!playlist) {
            return sendError(res, '', 'Playlist not found.');
        }

        const parsedCreatedBy = parseInt(playlist.created_by);
        const parsedUserId = parseInt(userId);

        if (parsedCreatedBy !== parsedUserId) {
            return sendErrorUnauthorized(res, '', 'You are not authorized to view this playlist.');
        }

        const music = await Music.findAll({
            include: {
                model: Playlist,
                where: { id: playListId },
                through: { attributes: [] } // Exclude the join table attributes
            }
        })

        const result = {
            ...playlist,
            musics: music.map(m => ({
                id: m.id,
                title: m.title,
                artist: m.artist,
                album: m.album,
                genre: m.genre,
                duration: m.duration,
                releaseDate: m.releaseDate
            }))
        };

        await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 60 * 60); // Cache for 1 hour

        return sendSuccess(res, result, 'Playlist retrieved successfully.');
    } catch (error) {
        console.error('Error in playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.create = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Invalid token.');

    if (decodedToken.user.user_role !== 'admin' && decodedToken.user.user_role !== 'owner') {
        return sendErrorUnauthorized(res, '', 'You are not authorized to perform this action.');
    }

    try {
        upload.single("file")(req, res, async (err) => {
            const { name, description } = req.body;
    
            // ✅ Validate required fields
            if (!name || !description) {
                return sendError(res, '', 'Missing required fields: name and description.');
            }
    
            // ✅ Validate image file
            const imageFile = req.file;
            if (!imageFile) {
                return sendError(res, '', 'Missing required field: image. Please upload an image file.');
            }
    
            // ✅ Process the image file
            const processedImage = await processImage(imageFile.path, 300, 300); // Resize to 300x300
    
            // ✅ Create the playlist
            const newPlaylist = await Playlist.create({
                name,
                description,
                cover_image: processedImage,
                created_by: decodedToken.user.id,
                visibility: 'public'
            });
    
            // ✅ Clear cache for the playlist list
            await clearPlaylistCache();
    
            return sendSuccess(res, newPlaylist, 'Playlist created successfully.');
        })
    } catch (error) {
        console.error('Error in create playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.update = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Invalid token.');

    const userId = decodedToken.user.id;

    try {
        upload.single("file")(req, res, async (err) => {
            const { playListId } = req.params;

            if (!playListId) {
                return sendError(res, '', 'Missing or invalid query parameter: playListId.');
            }

            const { name, description } = req.body;
            const imageFile = req.file;

            const playlist = await Playlist.findOne({ where: { id: playListId } });
            if (!playlist) return sendError(res, '', 'Playlist not found.');

            const parsedCreatedBy = parseInt(playlist.created_by);
            const parsedUserId = parseInt(userId);
    
            if (parsedCreatedBy !== parsedUserId) {
                return sendErrorUnauthorized(res, '', 'You are not authorized to update this playlist.');
            }

            if (imageFile) {
                // ✅ Process the new image file
                const processedImage = await processImage(imageFile.path, 300, 300); // Resize to 300x300

                // ✅ Remove the old image file if it exists
                if (playlist.cover_image) {
                    await removeFile(path.join(__dirname, '../../uploads', playlist.cover_image));
                }

                playlist.cover_image = processedImage;
            }

            await playlist.update({
                name: name || playlist.name,
                description: description || playlist.description,
                cover_image: playlist.cover_image
            });

            await clearPlaylistCache(playListId); // Clear cache for the updated playlist

            return sendSuccess(res, playlist, 'Playlist updated successfully.');
        });
    } catch (error) {
        console.error('Error in update playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.delete = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Invalid token.');

    const userId = decodedToken.user.id;

    try {
        const { playListId } = req.params;

        if (!playListId) {
            return sendError(res, '', 'Missing or invalid query parameter: playListId.');
        }

        const playlist = await Playlist.findOne({ where: { id: playListId } });
        if (!playlist) return sendError(res, '', 'Playlist not found.');

        const parsedCreatedBy = parseInt(playlist.created_by);
        const parsedUserId = parseInt(userId);

        if (parsedCreatedBy !== parsedUserId) {
            return sendErrorUnauthorized(res, '', 'You are not authorized to delete this playlist.');
        }

        if (playlist.cover_image) {
            // ✅ Remove the old image file if it exists
            await removeFile(path.join(__dirname, '../../uploads', playlist.cover_image));
        }

        await playlist.destroy({ where: { id: playListId } });

        await clearPlaylistCache(playListId); // Clear cache for the deleted playlist

        return sendSuccess(res, {}, 'Playlist deleted successfully.');
    } catch (error) {
        console.error('Error in delete playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.addMusicToPlaylist = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Invalid token.');

    const userId = decodedToken.user.id;

    try {
        const { playListId } = req.params;
        const { musicIds } = req.body; // Expecting an array of music IDs

        const playlist = await Playlist.findOne({ where: { id: playListId } });
        if (!playlist) return sendError(res, '', 'Playlist not found.');

        const parsedCreatedBy = parseInt(playlist.created_by);
        const parsedUserId = parseInt(userId);

        if (parsedCreatedBy !== parsedUserId) {
            return sendErrorUnauthorized(res, '', 'You are not authorized to add music to this playlist.');
        }

        if (!Array.isArray(musicIds) || musicIds.length === 0) {
            return sendError(res, '', 'Missing or invalid body parameter: musicIds must be a non-empty array.');
        }

        // ✅ Validate music IDs
        const musics = await Music.findAll({
            where: {
                id: {
                    [Op.in]: musicIds
                }
            }
        });

        if (musics.length === 0) {
            return sendError(res, '', 'No valid music IDs provided.');
        }

        // ✅ Add music to the playlist
        const playListMusicEntries = musics.map(music => ({
            playlist_id: playListId,
            music_id: music.id
        }));        

        await PlaylistMusic.bulkCreate(playListMusicEntries, {
            ignoreDuplicates: true,
            returning: false,
            validate: true
        });
          
        await clearPlaylistCache(playListId); // Clear cache for the updated playlist

        return sendSuccess(res, {}, 'Music added to playlist successfully.');
    } catch (error) {
        console.error('Error in add music to playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};

exports.removeMusicFromPlaylist = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Invalid token.');
    
    const userId = decodedToken.user.id;

    try {
        const { playListId } = req.params;
        const { musicIds } = req.body;

        const playlist = await Playlist.findOne({ where: { id: playListId } });
        if (!playlist) return sendError(res, '', 'Playlist not found.');

        const parsedCreatedBy = parseInt(playlist.created_by);
        const parsedUserId = parseInt(userId);

        if (parsedCreatedBy !== parsedUserId) {
            return sendErrorUnauthorized(res, '', 'You are not authorized to remove music from this playlist.');
        }

        const playListMusic = await PlaylistMusic.findAll({
            where: {
                playlist_id: playListId,
                music_id: {
                    [Op.in]: musicIds
                }
            }
        });

        if (playListMusic.length === 0) {
            return sendError(res, '', 'No music found in the playlist with the provided IDs.');
        };

        const musicIdsToRemove = playListMusic.map(m => m.music_id);
        await PlaylistMusic.destroy({
            where: {
                playlist_id: playListId,
                music_id: {
                    [Op.in]: musicIdsToRemove
                }
            }
        });

        await clearPlaylistCache(playListId); // Clear cache for the updated playlist
        return sendSuccess(res, {}, 'Music removed from playlist successfully.');
    } catch (error) {   
        console.error('Error in remove music from playlist controller:', error);
        return sendError(res, '', 'An error occurred while processing your request.');
    }
};