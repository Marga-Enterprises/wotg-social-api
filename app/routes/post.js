const express = require('express');
const postController = require('../controllers/post');
const router = express.Router();

module.exports = (io) => {
    router.get('/', postController.list);
    router.get('/:postId', postController.getById);
    router.post('/', (req, res) => postController.create(req, res, io));
    router.put('/:postId', postController.updateById);
    router.delete('/:postId', postController.deleteById);

    return router;
};
