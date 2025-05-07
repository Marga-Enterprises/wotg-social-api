const express = require('express');
const postController = require('../controllers/post');
const router = express.Router();

module.exports = (io) => {
    router.get('/', postController.list);
    router.get('/:postId', postController.getById);
    router.post('/', (req, res) => postController.create(req, res, io));
    router.put('/:postId', postController.updateById);
    router.delete('/:postId', postController.deleteById);
    router.post('/add-comment/:postId', (req, res) => postController.addComment(req, res, io));
    router.post('/add-reply/:postId/:commentId', (req, res) => postController.addReplyToComment(req, res, io));
    router.get('/get-comments/:postId', postController.getCommentsByPostId);
    router.get('/get-replies/:commentId', postController.getRepliesByCommentId);
    router.put('/update-comment/:postId/:commentId', (req, res) => postController.updateComment(req, res, io));
    router.delete('/delete-comment/:commentId', (req, res) => postController.deleteCommentById(req, res, io));
    return router;
};
