const express = require('express');
const postController = require('../controllers/post');
const router = express.Router();

router.get('/', postController.list);
router.get('/:postId', postController.getById);
router.post('/', postController.create);
router.put('/:postId', postController.updateById);
// router.delete('/:postId', postController.deleteById);

module.exports = router;