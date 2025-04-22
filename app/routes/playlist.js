const express = require('express');
const playListController = require('../controllers/playlist');
const router = express.Router();

router.get('/', playListController.list);
router.get('/:playListId', playListController.getPlaylistById);
router.post('/', playListController.create);
router.put('/:playListId', playListController.update);
router.delete('/:playListId', playListController.delete);

module.exports = router;