const redis = require("redis");
require("dotenv").config(); // ✅ Load environment variables

// ✅ Create Redis client with .env variable
const redisClient = redis.createClient({
    url: process.env.REDIS_URL // Load Redis URL from .env
});

// ✅ Connect to Redis
redisClient.connect()
    .then(() => console.log("🚀 Redis Connected Successfully"))
    .catch(err => console.error("❌ Redis Connection Error:", err));

module.exports = redisClient;
