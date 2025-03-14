const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Determine upload directory based on NODE_ENV
const uploadDir = "../../uploads";

// Ensure "uploads" directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Save files in the dynamic "uploads" folder
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        // ✅ Ensure a proper file extension
        let ext = path.extname(file.originalname);
        if (!ext) {
            if (file.mimetype.startsWith("video/")) {
                ext = ".webm"; // Default videos to .webm if no extension is present
            } else if (file.mimetype.startsWith("image/")) {
                ext = ".webp"; // Default images to .webp if no extension is present
            } else {
                ext = ".bin"; // Default unknown files to .bin
            }
        }

        cb(null, uniqueSuffix + ext);
    },
});

// ✅ Accept all file types
const fileFilter = (req, file, cb) => {
    cb(null, true); // Allow any file type
};

// ✅ Multer instance (limit file size)
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // Increased Max 100MB for all files
    },
});

module.exports = upload;
