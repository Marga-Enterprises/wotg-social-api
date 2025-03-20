const express = require("express");
const blogsController = require("../controllers/blogs");

const router = express.Router();

// ✅ Blog Routes
router.get("/", blogsController.list);
router.get("/:id", blogsController.getById);
router.put("/:id/upload-video", blogsController.uploadVideo); // Upload video for a specific blog
router.delete("/:id/delete-video", blogsController.deleteVideo); // Delete video for a specific blog

// ✅ Route for Admin to Clear Blog Cache
router.post("/clear-blog-cache", blogsController.clearForBlogCacheForAdmin);

module.exports = router;
