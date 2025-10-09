/**
 * 🔥 Firebase Admin Initialization
 * Backend SDK for sending notifications, managing users, etc.
 * Compatible with Node.js 16+ and serverless platforms.
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// 🔍 Resolve credentials file (use env var or fallback to local file)
const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH ||
  path.join(__dirname, "firebase-credentials.json");

// 🧩 Validate credentials existence
if (!fs.existsSync(credentialsPath)) {
  console.error("❌ Firebase credentials file not found at:", credentialsPath);
  throw new Error("Missing firebase-credentials.json or FIREBASE_CREDENTIALS_PATH");
}

// ✅ Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(require(credentialsPath)),
  // Optional: specify project ID (if running outside GCP)
  projectId: process.env.FIREBASE_PROJECT_ID || "wotg-community-app",
});

// 🚀 Export admin instance for use in other modules
module.exports = admin;

// 💡 Usage Example:
// const admin = require("./firebase");
// await admin.messaging().send({ token, notification: { title, body } });
