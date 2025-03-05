const admin = require("firebase-admin");
const path = require("path");

// Load Firebase credentials from your JSON file
const serviceAccount = require(path.join(__dirname, "firebase-credentials.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
