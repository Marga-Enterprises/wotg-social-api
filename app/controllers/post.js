const Post = require('../models/Post');
const Share = require('../models/Share');
const User = require('../models/User');
const Reaction = require('../models/Reaction');
const PostMedia = require('../models/PostMedia');
const Comment = require('../models/Comment');
const CommentMedia = require('../models/CommentMedia');
const Notification = require('../models/Notification');
const Tag = require('../models/Tag');
const Subscription = require('../models/Subscription');
const { sendNotification } = require('../../utils/sendNotification'); 

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
const { clearPostsCache, clearCommentsCache, clearRepliesCache, clearNotificationsCache } = require('../../utils/clearBlogCache');

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

        /*const cacheKey = `posts:page:${pageIndex}:${pageSize}:${userId ? `user:${userId}` : ''}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }*/

        const where = {};

        if (userId) {
          where[Op.or] = [{ user_id: userId }];
        }

        const { count, rows } = await Post.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
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
                'createdAt',
            ],
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
                {
                    model: PostMedia,
                    as: 'media',
                    attributes: ['id', 'url', 'type', 'thumbnail'],
                },
                {
                    model: Reaction,
                    as: 'reactions',
                    attributes: ['id', 'user_id', 'post_id', 'type'],
                    include: [
                        {
                            model: User,
                            as: 'reactor',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        }
                    ]
                },
                {
                    model: Post,
                    as: 'original_post',
                    attributes: ['id', 'user_id', 'content'],
                    include: [
                        {
                            model: User,
                            as: 'author',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        },
                        {
                            model: PostMedia,
                            as: 'media',
                            attributes: ['id', 'url', 'type', 'thumbnail'],
                        }
                    ]
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

        // await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);

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
                  attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
                {
                    model: Reaction,
                    as: 'reactions',
                    attributes: ['id', 'user_id', 'post_id', 'type'],
                    include: [
                        {
                            model: User,
                            as: 'reactor',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        }
                    ]
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

exports.create = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please log in first');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;
    const senderName = `${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;

    try {
        uploadMemory.array("file", 3)(req, res, async (err) => {
            const { content, visibility, taggedUserIds } = req.body;

            const files = req.files;
            const taggedUserIdsToArray = taggedUserIds ? taggedUserIds.split(',') : [];

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
            };
            
            if (taggedUserIdsToArray.length > 0) {
                for (const taggedUserId of taggedUserIdsToArray) {
                    await Tag.create({
                        user_id: taggedUserId,
                        post_id: newPost.id
                    });
    
                    await sendNotifiAndEmit ({
                        sender_id: userId,
                        recipient_id: taggedUserId,
                        target_type: 'Tag',
                        target_id: newPost.id,
                        type: 'tag',
                        message: `${senderName} tagged you in a post`,
                        io
                    })
                }
            }

            await clearPostsCache();

            return sendSuccess(res, newPost, 'New Post Created');
        });
    } catch (error) {
        console.log('Unable to create post: ', error);
        return sendError(res, '', 'Unable to create post');
    }
};

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
};

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

exports.getCommentsByPostId = async (req, res) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendError(res, '', 'Please login first.');
    if (!decodedToken) return sendError(res, '', 'Token not valid, unable to decode.');

    try {
        const { postId } = req.params;

        if (!postId) return sendError(res, '', 'Please add post ID first');

        const post = await Post.findOne({
            where: { id: postId }
        });

        if (!post) return sendError(res, '', 'Post not found.');

        let { pageIndex, pageSize } = req.query;

        if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize)) {
            return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
        }

        pageIndex = parseInt(pageIndex);
        pageSize = parseInt(pageSize);

        const offset = (pageIndex - 1) * pageSize;
        const limit = pageSize;

        const cacheKey = `comments:page:${pageIndex}:${pageSize}:${postId ? `post:${postId}` : ''}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return sendSuccess(res, JSON.parse(cached), 'From cache');
        }

        let where = {}

        where[Op.or] = [{ post_id: postId }];

        const { count, rows } = await Comment.findAndCountAll({
            where,
            order: [['createdAt', 'ASC']],
            limit,
            offset,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture']
                },
                {
                    model: Comment,
                    as: 'replies', // Just in case of deeper nesting (optional)
                    required: false
                },
                {
                    model: CommentMedia,
                    as: 'media', // Just in case of deeper nesting (optional)
                    required: false
                }
            ]
        });

        const totalPages = Math.ceil(count / pageSize);

        const response = {
            pageIndex,
            pageSize,
            totalPages,
            totalRecords: count,
            comments: rows
        }

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60);

        return sendSuccess(res, response, 'Comments retrieve successfully.')
    } catch (error) {
        console.log('Unable to get comments by post id: ', error);
        return sendError(res, '', 'Unable to get comments by post id.');
    }
};

exports.addComment = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;
    const followerName =`${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;

    try {
        uploadMemory.single("file")(req, res, async (err) => {
            const { postId } = req.params;
            const { content, taggedUserIds } = req.body;

            const file = req.file;
            const taggedUserIdsToArray = taggedUserIds ? taggedUserIds.split(',') : [];

            if (!postId || !content) {
                return sendError(res, '', 'Please provide the required fields (Post ID, Content)');
            }

            const post = await Post.findOne({
                where: { id: postId },
                include: [
                    {
                        model: Comment,
                        as: 'comments',
                        attributes: ['id', 'content', 'createdAt'],
                        include: [
                            {
                                model: User,
                                as: 'author',
                                attributes: ['id']
                            },
                        ]
                    }
                ]
            });

            if (!post) return sendError(res, '', 'Post not found.');

            const newComment = await Comment.create({
                content,
                post_id: postId,
                user_id: userId, 
            });

            if (file) {
                let convertedFile = null;
                let processedFile = null;
                let filetype = null;

                const mimetype = file.mimetype;
                
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
                    return sendError(res, '', 'Please upload only audio, video, or image files.');
                }
    
                // Create a new PostMedia entry for each processed file
                await CommentMedia.create({
                    comment_id: newComment.id,
                    url: processedFile,
                    type: filetype,
                });
            };

            if (taggedUserIdsToArray.length > 0) {
                for (const taggedUserId of taggedUserIdsToArray) {
                    await Tag.create({
                        user_id: taggedUserId,
                        post_id: newPost.id
                    });
    
                    await sendNotifiAndEmit ({
                        sender_id: userId,
                        recipient_id: taggedUserId,
                        target_type: 'Tag',
                        sub_target_id: newComment.id,
                        target_id: postId,
                        type: 'tag',
                        message: `${senderName} tagged you in a post`,
                        io
                    })
                }
            };

            const populatedComment = await Comment.findOne({
                where: { id: newComment.id },
                include: [
                    {
                        model: User,
                        as: 'author',
                        attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture']
                    },
                    {
                        model: CommentMedia,
                        as: 'media',
                        attributes: ['url', 'type']
                    }
                ]
            })

            if (post.user_id === userId) {
                io.to(post.user_id).emit('new_comment', populatedComment);
            } else {
                io.to(post.user_id).to(userId).emit('new_comment', populatedComment);
            }

            // get all the user ids who commented on that post
            const commenters = [...new Set(post.comments.map(comment => comment.author.id))];

            // filter out the post owner from the commenters
            const filteredCommenters = commenters.filter(commenterId => commenterId !== post.user_id);

            if (filteredCommenters.length > 0) {
                for (const commenterId of filteredCommenters) {
                    await sendNotifiAndEmit({
                        sender_id: userId,
                        recipient_id: commenterId,
                        target_type: 'Comment',
                        sub_target_id: newComment.id,
                        type: 'comment',
                        target_id: postId,
                        message: `${followerName} commented on a post you commented on`,
                        io
                    });
                }
            };
            
            await sendNotifiAndEmit({
                sender_id: userId,
                recipient_id: post.user_id,
                target_type: 'Comment',
                type: 'comment',
                sub_target_id: newComment.id,
                target_id: postId,
                message: `${followerName} commented on your post`,
                io
            });

            await clearCommentsCache();

            await Post.update(
                { comments_count: Sequelize.literal('comments_count + 1') },
                { where: { id: postId } }
            );

            return sendSuccess(res, populatedComment, 'Successfully commented in post.');
        });
    } catch (error) {
        console.error('Unable to add comment for this post.');
        return sendError(res, '', 'Unable to add comment for this post.')      
    }
};

exports.getRepliesByCommentId = async (req, res) => {
  const token = getToken(req.headers);
  const decodedToken = decodeToken(token);

  if (!token) return sendError(res, '', 'Please login first.');
  if (!decodedToken) return sendError(res, '', 'Token not valid, unable to decode.');

  try {
    const { commentId } = req.params;

    if (!commentId) return sendError(res, '', 'Parent Comment ID is required.');

    let { pageIndex, pageSize } = req.query;

    if (!pageIndex || !pageSize || isNaN(pageIndex) || isNaN(pageSize)) {
      return sendError(res, '', 'Missing or invalid query parameters: pageIndex and pageSize must be > 0.');
    }

    pageIndex = parseInt(pageIndex);
    pageSize = parseInt(pageSize);
    const offset = (pageIndex - 1) * pageSize;
    const limit = pageSize;

    const cacheKey = `replies:page:${pageIndex}:${pageSize}:parent:${commentId}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return sendSuccess(res, JSON.parse(cached), 'From cache');
    }

    const where = { parent_comment_id: commentId };

    const { count, rows } = await Comment.findAndCountAll({
      where,
      order: [['createdAt', 'ASC']],
      limit,
      offset,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture']
        },
        {
          model: Comment,
          as: 'replies', // Just in case of deeper nesting (optional)
          required: false
        },
        {
            model: CommentMedia,
            as: 'media', // Just in case of deeper nesting (optional)
            required: false
        }
      ]
    });

    const totalPages = Math.ceil(count / pageSize);

    const response = {
      pageIndex,
      pageSize,
      totalPages,
      totalRecords: count,
      replies: rows
    };

    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 60 * 60); // Cache for 1 hour

    return sendSuccess(res, response, 'Replies retrieved successfully.');
  } catch (error) {
    console.error('❌ Unable to get replies: ', error);
    return sendError(res, '', 'Unable to get replies for this comment.');
  }
};

exports.addReplyToComment = async (req, res, io) => {
  const token = getToken(req.headers);
  const decodedToken = decodeToken(token);

  if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
  if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

  const userId = decodedToken.user.id;
  const replierName = `${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;

  try {
    uploadMemory.single("file")(req, res, async (err) => {
      const { postId, commentId } = req.params;
      const { content } = req.body;
      const file = req.file;

      if (!postId || !commentId || !content) {
        return sendError(res, '', 'Missing required fields (Post ID, Parent Comment ID, Content)');
      }

      const parentComment = await Comment.findOne({ where: { id: commentId } });
      if (!parentComment) return sendError(res, '', 'Parent comment not found.');

      const newReply = await Comment.create({
        content,
        post_id: postId,
        user_id: userId,
        parent_comment_id: commentId,
        level: 1,
      });

      if (file) {
        let convertedFile = null;
        let processedFile = null;
        let filetype = null;

        const mimetype = file.mimetype;

        if (mimetype.startsWith('image/')) {
          convertedFile = await processImageToSpace(file);
          processedFile = await uploadFileToSpaces(convertedFile);
          filetype = 'image';
        } else if (mimetype.startsWith('video/')) {
          convertedFile = await processVideoToSpace(file);
          processedFile = await uploadFileToSpaces(convertedFile);
          filetype = 'video';
        } else if (mimetype.startsWith('audio/')) {
          processedFile = await uploadFileToSpaces(file);
          filetype = 'audio';
        } else {
          return sendError(res, '', 'Only image, video, or audio files are allowed.');
        }

        await CommentMedia.create({
          comment_id: newReply.id,
          url: processedFile,
          type: filetype,
        });
      }

      io.to(parentComment.user_id).emit('new_reply', newReply);

      await sendNotifiAndEmit({
        sender_id: userId,
        recipient_id: parentComment.user_id,
        target_type: 'Comment',
        target_id: postId,
        type: 'comment',
        message: `${replierName} replied to your comment`,
        io
      });

      await clearRepliesCache(commentId);

      return sendSuccess(res, newReply, 'Reply added successfully.');
    });
  } catch (error) {
    console.error('Unable to add reply to comment.', error);
    return sendError(res, '', 'Unable to add reply.');
  }
};

exports.updateComment = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    try {
        uploadMemory.single("file")(req, res, async (err) => {
            const { postId, commentId } = req.params;
            const { content, fileToDelete } = req.body;
            const file = req.file;

            if (!postId || !commentId) {
                return sendError(res, '', 'Please provide the required fields (Post ID, Comment ID)');
            }

            const post = await Post.findOne({
                where: { id: postId }
            });

            const comment = await Comment.findOne({
                where: { id: commentId }
            });

            if (!post || !comment) return sendError(res, '', 'Post not found.');

            console.log('FILEEE TO DELETEEE', fileToDelete);

            if (fileToDelete) {
                if (fileToDelete.endsWith('.webp')) {
                    await removeFileFromSpaces('images', fileToDelete);
                } else if (fileToDelete.endsWith('.webm')) {
                    await removeFileFromSpaces('videos', fileToDelete);
                } else {
                    await removeFileFromSpaces('audios', fileToDelete);
                }

                await CommentMedia.destroy({
                    where: { url: fileToDelete }
                });
            }

            if (file) {
                let convertedFile = null;
                let processedFile = null;
                let filetype = null;

                const mimetype = file.mimetype;
                
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
                    return sendError(res, '', 'Please upload only audio, video, or image files.');
                }
    
                // Create a new PostMedia entry for each processed file
                await CommentMedia.create({
                    comment_id: comment.id,
                    url: processedFile,
                    type: filetype,
                });
            }

            await comment.update({ 
              content
            });

            io.to(post.user_id).emit('comment_updated ', comment);

            await clearCommentsCache(commentId);

            return sendSuccess(res, comment, 'Comment updated successfully');
        });
    } catch (error) {
        console.error('Unable to add comment for this post.');
        return sendError(res, '', 'Unable to add comment for this post.')      
    }
};

exports.deleteCommentById = async (req, res, io) => {
    const token = getToken(req.headers);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');

    try {
        const { commentId } = req.params;

        if (!commentId) return sendError(res, '', 'Please provide the Comment ID');
        
        const comment = await Comment.findOne({
            where: { id: commentId },
            include: [
                {
                    model: CommentMedia,
                    as: 'media',
                    attributes: ['url']
                }
            ],
        });

        if (!comment) return sendError(res, '', 'Comment not found.');

        for (const media of comment.media) {
            if (media.url.includes('.webp')) {
                await removeFileFromSpaces('images', media.url);
            } else if (media.url.includes('.webm')) {
                await removeFileFromSpaces('videos', media.url);
            } else {
                await removeFileFromSpaces('audios', media.url);
            }
        }

        await CommentMedia.destroy({
            where: { comment_id: commentId }
        });

        await Comment.destroy({
            where: { id: commentId }
        });

        await clearCommentsCache(commentId);

        io.emit('comment_deleted', commentId);

        return sendSuccess(res, '', 'Comment deleted successfully.');
    } catch (error) {
        console.error('Failed to delete comment: ', error);
        return sendError(res, '', 'Failed to delete comment.');
    }
};

exports.shareByPostId = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendError(res, '', 'Please login first.');
    if (!decodedToken) return sendError(res, '', 'Token not valid unable to decode.');

    const userId = decodedToken.user.id;
    const sharerName = `${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;
    
    try {
        const { postId } = req.params;
        const { content, visibility, taggedUserIds } = req.body;

        if (!postId) return sendError(res, '', 'Please provide a post ID.');

        const post = await Post.findOne({
            where: { id: postId },
            include: [
              {
                model: User,
                as: 'author',
                attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture']
              }
            ],
        });
          
        if (!post) return sendError(res, '', 'Post not found.');

        await Post.create({
            content,
            visibility,
            original_post_id: post.dataValues.id,
            user_id: userId,
        });

        const share = await Share.create({
            user_id: userId,
            original_post_id: post.dataValues.id
        });

        if (taggedUserIds?.length > 0) {
            for (const taggedUserId of taggedUserIds) {
                await sendNotifiAndEmit ({
                    sender_id: userId,
                    recipient_id: taggedUserId,
                    target_type: 'Tag',
                    target_id: postId,
                    type: 'tag',
                    message: `${sharerName} tagged you in a post.`,
                    io
                })
            }
        }

        await clearPostsCache();

        await sendNotifiAndEmit ({
            sender_id: userId,
            recipient_id: post.dataValues.user_id,
            target_type: 'Share',
            target_id: postId,
            type: 'Share',
            message: `${sharerName} shared your post.`,
            io
        });

        await Post.update(
            { shares_count: Sequelize.literal('shares_count + 1') },
            { where: { id: postId } }
        );
        
        return sendSuccess(res, share, 'Post successfully shared.');
    } catch (error) {
        console.error('Failed to share post: ', error);
        return sendError(res, '', 'Failed to share post.');
    }
};

exports.reactToPostById = async (req, res, io) => {
    const token = getToken(req.headers);
    const decodedToken = decodeToken(token);

    if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
    if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to decode.');

    const userId = decodedToken.user.id;
    const reactorName = `${decodedToken.user.user_fname} ${decodedToken.user.user_lname}`;

    try {
        const { postId } = req.params;
        const { type } = req.body;

        if (!postId || !type) return sendError(res, '', 'Please provide the required parameters and fields.');

        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['id', 'user_id', 'reaction_count'],
            raw: true
        });

        if (!post) return sendError(res, '', 'Post not found.');

        const existingReaction = await Reaction.findOne({
            where: {
                user_id: userId,
                post_id: postId
            }
        });

        if (existingReaction) {
            if (existingReaction.type === type) {
                await Reaction.destroy({
                    where: {
                        user_id: userId,
                        post_id: postId
                    }
                });

                if (post.user_id === userId) {
                    io.to(post.user_id).emit('delete_post_react', existingReaction);
                } else {
                    io.to(post.user_id).to(userId).emit('delete_post_react', existingReaction);
                }

                await Post.update(
                    { reaction_count: Sequelize.literal('reaction_count - 1') },
                    { where: { id: postId } }
                );

                return sendSuccess(res, {}, 'Post reaction removed.');
            } else if (existingReaction.type !== type) {
                const reaction = await Reaction.findOne({
                    where: {
                        user_id: userId,
                        post_id: postId
                    },
                    include: [
                        {
                            model: User,
                            as: 'reactor',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        }
                    ]
                });

                await reaction.update(
                    { type },
                    { where: { id: reaction.id } }
                );

                if (post.user_id === userId) {
                    io.to(post.user_id).emit('update_post_react', reaction);
                } else {
                    io.to(post.user_id).to(userId).emit('update_post_react', reaction);
                }

                return sendSuccess(res, reaction, 'Post reaction updated.');
            }
        } else {
            const newReaction = await Reaction.create({
                user_id: userId,
                post_id: postId,
                type,
            });
            
            // Fetch with associated user
            const populatedReaction = await Reaction.findByPk(newReaction.id, {
                include: [
                    {
                    model: User,
                    as: 'reactor',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                    },
                ],
            });
              
            if (post.user_id === userId) {
                io.to(post.user_id).emit('new_post_react', populatedReaction);
            } else {
                io.to(post.user_id).to(userId).emit('new_post_react', populatedReaction);
            }
    
            const reactionEmojis = {
                "heart": "❤️",
                "haha": "😂",
                "pray": "🙏",
                "praise": "🙌",
                "clap": "👏"
            };
    
            const reactionEmoji = reactionEmojis[type] || "";
    
            await sendNotifiAndEmit({
                sender_id: userId,
                recipient_id: post.user_id,
                target_type: 'Post',
                target_id: postId,
                type: 'react',
                message: `${reactorName} reacted ${reactionEmoji} to your post`,
                io
            });
    
            await Post.update(
                { reaction_count: Sequelize.literal('reaction_count + 1') },
                { where: { id: postId } }
            );
    
            return sendSuccess(res, populatedReaction, 'React to post success');
        }
    } catch (error) {
        console.log('Failed to react to post: ', error);
        return sendError(res, '', 'Failed to react to post.')
    }
}

const sendNotifiAndEmit = async ({ sender_id, recipient_id, target_type, target_id, sub_target_id, type, message, io }) => {
  if (sender_id === recipient_id) return;

  const newNotif = await Notification.create({
    sender_id,
    recipient_id,
    sub_target_id,
    target_type,
    target_id,
    type,
    message
  });

  await clearNotificationsCache(recipient_id);

  const notification = await Notification.findOne({
    where: { id: newNotif.dataValues.id },
    include: [
        {
            model: User,
            as: 'sender',
            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
        },
        {
            model: Post,
            as: 'targetPost',
            attributes: [
                'id',
                'user_id',
                'content',
                'visibility',
                'reaction_count',
                'comments_count',
                'shares_count',
                'createdAt',
            ],
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                },
                {
                    model: PostMedia,
                    as: 'media',
                    attributes: ['id', 'url', 'type', 'thumbnail'],
                },
                {
                    model: Reaction,
                    as: 'reactions',
                    attributes: ['id', 'user_id', 'post_id', 'type'],
                    include: [
                        {
                            model: User,
                            as: 'reactor',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        }
                    ]
                },
                {
                    model: Post,
                    as: 'original_post',
                    attributes: ['id', 'user_id', 'content'],
                    include: [
                        {
                            model: User,
                            as: 'author',
                            attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                        },
                        {
                            model: PostMedia,
                            as: 'media',
                            attributes: ['id', 'url', 'type', 'thumbnail'],
                        }
                    ]
                }
            ]
        },
        {
            model: Comment,
            as: 'targetComment',
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'user_fname', 'user_lname', 'user_profile_picture'],
                }
            ]
        }
    ],
  });

  io.to(recipient_id).emit('new_notification', notification);

  const subscription = await Subscription.findOne({
      where: { user_id: recipient_id },
      raw: true,
  });

  const subscriptionSub = typeof subscription?.subscription === 'string'
                ? JSON.parse(subscription?.subscription)
                : subscription?.subscription;

  try {
      const fcmToken = subscriptionSub?.fcmToken; // Access safely
      
      if (fcmToken) {
          await sendNotification(
              fcmToken,
              'WOTG Community',
              message
          );
      }
  } catch (error) {
      console.error('Error sending push notification:', error);
  }
};