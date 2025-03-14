const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ Ensure "uploads" directory exists in the root directory
const uploadDir = path.join(__dirname, "../../uploads"); // ✅ Root directory
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // ✅ Save files in the "uploads" folder (Root directory)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, uniqueSuffix + path.extname(file.originalname)); // ✅ Unique filename
    },
});

// ✅ File filter to allow only images & videos
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only images and videos are allowed."), false);
    }
};

// ✅ Multer instance with 50MB file size limit
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // ✅ Max 50MB
    },
});

module.exports = { upload };
