const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure "uploads" directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // Save files in the "uploads" folder
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        // ✅ If file is a WebM video and no extension is present, force .webm extension
        let ext = path.extname(file.originalname);
        if (!ext && file.mimetype.startsWith("video/")) {
            ext = ".webm"; // Ensure WebM extension
        }

        cb(null, uniqueSuffix + ext);
    },
});

// ✅ Allow both images (JPG, PNG, WEBP) and WebM videos
const fileFilter = (req, file, cb) => {
    if (
        file.mimetype.startsWith("image/") || // ✅ Allow images
        (file.mimetype.startsWith("video/") && file.mimetype === "video/webm") // ✅ Allow only WebM videos
    ) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only images (JPG, PNG, WEBP) and WebM videos are allowed."), false);
    }
};

// ✅ Multer instance (limit file size)
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // Max 50MB
    },
});

module.exports = upload;
