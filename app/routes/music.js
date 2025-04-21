const express = require('express');
const musicController = require('../controllers/music');
const router = express.Router();

router.get('/', musicController.list); // List all music with pagination and caching
router.get('/:musicId', musicController.getMusicById); // Get a specific music by ID
router.post('/', musicController.create); // Create a new music entry
router.put ('/:musicId', musicController.update); // Update a specific music by ID
router.delete('/:musicId', musicController.delete); // Delete a specific music by ID

module.exports = router;