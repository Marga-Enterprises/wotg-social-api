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

exports.clearJournalCache = async (journalId) => {
    try {
      console.log("🧹 Clearing journal cache...");
  
      const pattern = "journals:page:*";
      const filteredPattern = "journals:page:*:user:*:viewer:*";
      const journalKeys = journalId ? await redisClient.keys(`journal_*_${journalId}`) : [];
  
      const allPaginatedKeys = await redisClient.keys(pattern);
      const allFilteredKeys = await redisClient.keys(filteredPattern);
  
      const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...journalKeys])];
  
      if (allKeys.length > 0) {
        await redisClient.del(allKeys);
        console.log(`🗑️ Cleared ${allKeys.length} journal cache entries.`);
      } else {
        console.log("ℹ️ No matching journal cache keys found.");
      }
  
      console.log("✅ Journal cache cleared.");
    } catch (error) {
      console.error("❌ Error clearing journal cache:", error);
    }
  };
  



