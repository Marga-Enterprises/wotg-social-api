const redisClient = require("../config/redis");

exports.clearBlogCache = async (blogId) => {
  try {
      console.log(`🗑️ Clearing cache for blog ${blogId} and paginated blogs...`);

      // ✅ Delete the specific blog cache
      await redisClient.del(`blog_${blogId}`);

      // ✅ Delete all paginated blogs cache
      const keys = await redisClient.keys("blogs_page_*");
      if (keys.length > 0) {
          await redisClient.del(keys);
          console.log("🗑️ Paginated blog cache cleared.");
      }

      console.log(`✅ Cache cleared for blog ${blogId}`);
  } catch (error) {
      console.error("❌ Error clearing blog cache:", error);
  }
};