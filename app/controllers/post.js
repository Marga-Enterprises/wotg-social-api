const Post = require('../models/Post');
const User = require('../models/User');
const PostMedia = require('../models/PostMedia');

const { 
    sendError, 
    sendSuccess, 
    getToken, 
    sendErrorUnauthorized, 
    decodeToken, 
    processImageToSpace,
    processVideoToSpace,
    removeFileFromSpaces
} = require('../../utils/methods');

const uploadMemory = require('./uploadMemory');
const { uploadFileToSpaces } = require('./spaceUploader');

const redisClient = require('../../config/redis');
const { clearPostsCache } = require('../../utils/clearBlogCache');

const { Op, Sequelize } = require('sequelize');

exports.list = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) return sendError(res, '', 'Please log in first.');

    try {
        let { pageIndex, pageSize, userId } = req.query;

        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize)) {
            return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
        }

        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        const cacheKey = `posts:page:${pageIndex}:${pageSize}:${userId ? `user:${userId}` : ''}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }

        const where = {};

        if (userId) {
          where[Op.or] = [{ user_id: userId }];
        }

        const { count, rows } = await Post.findAndCountAll({
            where,
            order: Sequelize.literal('RAND()'),
            offset,
            limit,
            attributes: [
                'id',
                'user_id',
                'content',
                'visibility',
                'reaction_count',
                'comments_count',
                'shares_count',
            ],
            include: [
                {
                  model: User,
                  as: 'author',
                  attributes: ['user_fname', 'user_lname'],
                },
                {
                  model: PostMedia,
                  as: 'media',
                  attributes: ['id', 'url', 'type', 'thumbnail'],
                }
            ]
        });

        const totalPages = Math.ceil(count / pageSize);
        
        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalRecords: count,
            posts: rows
        }

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);

        return sendSuccess(res, response, 'Playlist retrieve successfully.')
    } catch (error) {
        console.log('Unable to retrieve posts: ', error);
        return sendError(res, '', 'Unable to retrieve posts');
    };
};

exports.getById = async (req, res) => {
    const token = getToken(req.headers);

    if (!token) sendErrorUnauthorized(res, '', 'Please log in first.');

    try {
        const { postId } = req.params;

        if (!postId) return sendError(res, '', 'No Post ID provided.');

        const cacheKey = `post_${postId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From Cached');
        }

        const post = await Post.findOne({
            where: { id: postId },
            attributes: [
                'id',
                'user_id',
                'content',
                'visibility',
                'reaction_count',
                'comments_count',
                'shares_count',
            ],
            include: [
                {
                  model: User,
                  as: 'author',
                  attributes: ['user_fname', 'user_lname'],
                },
                {
                  model: PostMedia,
                  as: 'media',
                  attributes: ['id', 'url', 'type', 'thumbnail'],
                }
            ],
        });

        if (!post) sendError(res, '', 'Post not found.');

        await redisClient.set(cacheKey, JSON.stringify(post), 'EX', 60 * 60);

        return sendSuccess(res, post, 'Post retrieve successfully');
    } catch (error) {
        console.error('Unable to get post.');
        return sendError(res, '', 'Unable to get post.');
    };
};

exports.create = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please log in first');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;

    try {
        uploadMemory.array("file", 3)(req, res, async (err) => {
            const { content, visibility } = req.body;

            const files = req.files;

            const newPost = await Post.create({
                content,
                visibility,
                user_id: userId,
            });

            if (files.length > 0) {
                let convertedFile = null;
                let processedFile = null;
                let filetype = null;
            
                for (const file of files) {
                    const mimetype = file.mimetype;
                    
                    try {
                        if (mimetype.startsWith('image/')) {
                            convertedFile = await processImageToSpace(file); // Ensure async processing
                            processedFile = await uploadFileToSpaces(convertedFile); // Ensure async upload
                            filetype = 'image';
                        } else if (mimetype.startsWith('video/')) {
                            convertedFile = await processVideoToSpace(file); // Ensure async processing
                            processedFile = await uploadFileToSpaces(convertedFile); // Ensure async upload
                            filetype = 'video';
                        } else if (mimetype.startsWith('audio/')) {
                            processedFile = await uploadFileToSpaces(file); // Only upload for audio
                            filetype = 'audio';
                        } else {
                            // Return error if the file type is not audio, video, or image
                            return sendError(res, '', 'Please upload only audio, video, or image files.');
                        }
            
                        // Create a new PostMedia entry for each processed file
                        await PostMedia.create({
                            post_id: newPost.id,
                            url: processedFile,
                            type: filetype,
                        });
            
                    } catch (error) {
                        console.error("Error processing file: ", error);
                        return sendError(res, '', 'There was an error processing the file.');
                    }
                }
            }            

            await clearPostsCache();

            return sendSuccess(res, newPost, 'New Post Created');
        });
    } catch (error) {
        console.log('Unable to create post: ', error);
        return sendError(res, '', 'Unable to create post');
    }
}

exports.updateById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please log in first');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;

    try {
        const { postId } = req.params;
        uploadMemory.array("file", 3)(req, res, async (err) => {
            const { content, visibility, filesToDelete } = req.body;

            const files = req.files;
            const filesToDeleteArray = filesToDelete ? filesToDelete.split(',') : [];

            const post = await Post.findOne({
                where: { id: postId }
            });

            if (post.user_id !== userId) return sendErrorUnauthorized(res, '', 'You are not authorized to update this post.');



            if (filesToDeleteArray.length > 0) {
                for (const fileToDelete of filesToDeleteArray) {
                    if (fileToDelete.includes('.webp')) {
                        await removeFileFromSpaces('images', fileToDelete);
                    } else if (fileToDelete.includes('.webm')) {
                        await removeFileFromSpaces('videos', fileToDelete);
                    } else {
                        await removeFileFromSpaces('audios', fileToDelete);
                    }

                    await PostMedia.destroy({
                        where: { url: fileToDelete }
                    });
                }
            }

            if (files.length > 0) {
                let convertedFile = null;
                let processedFile = null;
                let filetype = null;
            
                // Use a for...of loop to handle async operations correctly
                for (const file of files) {
                    const mimetype = file.mimetype;
                    
                    try {
                        if (mimetype.startsWith('image/')) {
                            convertedFile = await processImageToSpace(file); // Ensure async processing
                            processedFile = await uploadFileToSpaces(convertedFile); // Ensure async upload
                            filetype = 'image';
                        } else if (mimetype.startsWith('video/')) {
                            convertedFile = await processVideoToSpace(file); // Ensure async processing
                            processedFile = await uploadFileToSpaces(convertedFile); // Ensure async upload
                            filetype = 'video';
                        } else if (mimetype.startsWith('audio/')) {
                            processedFile = await uploadFileToSpaces(file); // Only upload for audio
                            filetype = 'audio';
                        } else {
                            // Return error if the file type is not audio, video, or image
                            return sendError(res, '', 'Please upload only audio, video, or image files.');
                        }
            
                        // Create a new PostMedia entry for each processed file
                        await PostMedia.create({
                            post_id: post.id,
                            url: processedFile,
                            type: filetype,
                        });
            
                    } catch (error) {
                        console.error("Error processing file: ", error);
                        return sendError(res, '', 'There was an error processing the file.');
                    }
                }
            }
            
            await post.update({
                content,
                visibility
            });

            await clearPostsCache(postId);

            return sendSuccess(res, post, 'Post Updated');
        });
    } catch (error) {
        console.log('Unable to create post: ', error);
        return sendError(res, '', 'Unable to create post');
    }
}

exports.deleteById = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please log in first');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;

    try {
        const { postId } = req.params;

        const post = await Post.findOne({
            where: { id: postId },
            include: [
                {
                    model: PostMedia,
                    as: 'media',
                    attributes: ['url']
                }
            ]
        });

        if (!post) return sendError(res, '', 'Post not found.');
        if (post.user_id !== userId) return sendErrorUnauthorized(res, '', 'You are not authorized to delete this post.');

        // Delete media files from storage
        for (const media of post.media) {
            if (media.url.includes('.webp')) {
                await removeFileFromSpaces('images', media.url);
            } else if (media.url.includes('.webm')) {
                await removeFileFromSpaces('videos', media.url);
            } else {
                await removeFileFromSpaces('audios', media.url);
            }
        }

        // Delete media records from DB
        await PostMedia.destroy({ where: { post_id: postId } });

        // Delete the post
        await Post.destroy({ where: { id: postId } });

        // Clear related cache
        await clearPostsCache(postId);

        return sendSuccess(res, {}, 'Post deleted successfully.');
    } catch (error) {
        console.error('Unable to delete post: ', error);
        return sendError(res, '', 'Unable to delete post.');
    }
};

