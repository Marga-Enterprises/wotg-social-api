const express = require('express');
const albumController = require('../controllers/album');
const router = express.Router();

// ✅ List all albums with pagination and caching
router.get('/', albumController.list);
router.get('/:albumId', albumController.getAlbumById);
router.post('/', albumController.create); 
router.delete('/:albumId', albumController.deleteAlbumById);
router.put('/:albumId', albumController.updateAlbumById); // Update album by ID

module.exports = router;