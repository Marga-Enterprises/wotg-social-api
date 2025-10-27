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
  
exports.clearMusicCache = async (musicId) => {
  try {
    console.log("🧹 Clearing music cache...");

    const pattern = "music:page:*";
    const filteredPattern = "music:page*:album*:search*:order*";
    const musicKeys = musicId ? await redisClient.keys(`music*_${musicId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...musicKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} music cache entries.`);
    } else {
      console.log("ℹ️ No matching music cache keys found.");
    }

    console.log("✅ Music cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing music cache:", error);
  }
}

exports.clearRecommendedCache = async (musicId) => {
  try {
    console.log("🧹 Clearing recommended cache...");

    const pattern = "recommended:page:*";

    const allPaginatedKeys = await redisClient.keys(pattern);

    const allKeys = [...new Set([...allPaginatedKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} recommended cache entries.`);
    } else {
      console.log("ℹ️ No matching music cache keys found.");
    }

    console.log("✅ Recommended cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing recommended cache:", error);
  }
}

exports.clearAlbumCache = async (albumId) => {
  try {
    console.log("🧹 Clearing album cache...");

    const pattern = "albums:page:*";
    // const filteredPattern = "albums:page:*:user:*:viewer:*";
    const albumKeys = albumId ? await redisClient.keys(`album*_${albumId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    // const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, /*...allFilteredKeys,*/ ...albumKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} album cache entries.`);
    } else {
      console.log("ℹ️ No matching album cache keys found.");
    }

    console.log("✅ Album cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing album cache:", error);
  }
};

exports.clearPlaylistCache = async (playlistId) => {
  try {
    console.log("🧹 Clearing playlist cache...");

    const pattern = "playlists:page:*";
    const filteredPattern = "playlists:page*:user*:viewer*";
    const playlistKeys = playlistId ? await redisClient.keys(`playlist*_${playlistId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...playlistKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} playlist cache entries.`);
    } else {
      console.log("ℹ️ No matching playlist cache keys found.");
    }

    console.log("✅ Playlist cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing playlist cache:", error);
  }
};

exports.clearFollowersCache = async (userId) => {
  try {
    console.log("🧹 Clearing followers cache...");
    
    const pattern = `followers:page*:user${userId}`;

    const allPaginatedKeys = await redisClient.keys(pattern);

    if (allPaginatedKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} playlist cache entries.`);
    } else {
      console.log("ℹ️ No matching playlist cache keys found.");
    }

    console.log("✅ Playlist cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing followers cache:", error);
  };
};

exports.clearFollowingCache = async (userId) => {
  try {
    console.log("🧹 Clearing following cache...");
    
    const pattern = `following:page*:user${userId}`;

    const allPaginatedKeys = await redisClient.keys(pattern);

    if (allPaginatedKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} playlist cache entries.`);
    } else {
      console.log("ℹ️ No matching playlist cache keys found.");
    }

    console.log("✅ Playlist cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing following cache:", error);
  };
};

exports.clearPostsCache = async (postId) => {
  try {
    console.log("🧹 Clearing posts cache...");

    const pattern = "posts:page:*"
    const filteredPattern = "posts:page*:user*";
    const postKeys = postId ? await redisClient.keys(`post_${postId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...postKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} posts cache entries.`);
    } else {
      console.log("ℹ️ No matching post cache keys found.");
    }

  } catch (error) {
    console.error("❌ Error clearing posts cache:", error);
  };
};

exports.clearCommentsCache = async (commentId) => {
  try {
    console.log("🧹 Clearing comments cache...");

    const pattern = "comments:page:*"
    const filteredPattern = "comments:page*:post*";
    const commentKeys = commentId ? await redisClient.keys(`comment_${commentId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...commentKeys])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} comments cache entries.`);
    } else {
      console.log("ℹ️ No matching post cache keys found.");
    }

  } catch (error) {
    console.error("❌ Error clearing comments cache:", error);
  };
};

exports.clearRepliesCache = async (commentId) => {
  try {
    console.log("🧹 Clearing replies cache...");

    const pattern = "replies:page:*";
    const filteredPattern = "replies:page*:parent*";
    const specificCommentKey = commentId ? await redisClient.keys(`reply_${commentId}`) : [];

    const allPaginatedKeys = await redisClient.keys(pattern);
    const allFilteredKeys = await redisClient.keys(filteredPattern);

    const allKeys = [...new Set([...allPaginatedKeys, ...allFilteredKeys, ...specificCommentKey])];

    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      console.log(`🗑️ Cleared ${allKeys.length} replies cache entries.`);
    } else {
      console.log("ℹ️ No matching reply cache keys found.");
    }
  } catch (error) {
    console.error("❌ Error clearing replies cache:", error);
  }
};

exports.clearNotificationsCache = async (userId) => {
  try {
    console.log("🧹 Clearing notifications cache...");

    const pattern = `notifications_user:${userId ? userId : '*'}_page:*`;

    const allPaginatedKeys = await redisClient.keys(pattern);

    if (allPaginatedKeys.length > 0) {
      await redisClient.del(allPaginatedKeys);
      console.log(`🗑️ Cleared ${allPaginatedKeys.length} notifications cache entries.`);
    } else {
      console.log("ℹ️ No matching notifications cache keys found.");
    }

    console.log("✅ Notifications cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing notifications cache:", error);
  };
};

exports.clearChatroomsCache = async (userId) => {
  try {
    console.log("🧹 Clearing chatrooms cache...");

    // Match all keys for that user (any page or search term)
    const pattern = `chatrooms_user_${userId ? userId : '*'}_search_*`;
    const keys = await redisClient.keys(pattern);

    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`🗑️ Cleared ${keys.length} chatrooms cache entries.`);
    } else {
      console.log("ℹ️ No matching chatrooms cache keys found.");
    }

    console.log("✅ Chatrooms cache cleared.");
  } catch (error) {
    console.error("❌ Error clearing chatrooms cache:", error);
  }
};

exports.clearUsersCache = async (userId) => {
  try {
    console.log("🧹 Clearing users cache...");

    // Use a single pattern that matches ALL paginated user cache keys
    const listPattern = "users:page:*:size:*:search:*:guest:*:from:*:to:*";
    const userPattern = userId ? `user_${userId}*` : null;

    // ✅ SCAN instead of KEYS (non-blocking)
    const scanAndDelete = async (pattern) => {
      let totalDeleted = 0;
      let batch = [];

      // node-redis v4 supports async iterator
      for await (const key of redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 500, // batch size
      })) {
        batch.push(key);
        if (batch.length >= 500) {
          await redisClient.del(...batch);
          totalDeleted += batch.length;
          batch = [];
        }
      }

      // Delete remaining batch
      if (batch.length > 0) {
        await redisClient.del(...batch);
        totalDeleted += batch.length;
      }

      return totalDeleted;
    };

    // 🧹 Start cleaning
    let totalDeleted = 0;

    const listDeleted = await scanAndDelete(listPattern);
    totalDeleted += listDeleted;
    console.log(`🗑️ Deleted ${listDeleted} user listing cache entries.`);

    if (userPattern) {
      const userDeleted = await scanAndDelete(userPattern);
      totalDeleted += userDeleted;
      console.log(`🗑️ Deleted ${userDeleted} user-specific cache entries (${userPattern}).`);
    }

    if (totalDeleted === 0) {
      console.log("ℹ️ No matching user cache keys found.");
    } else {
      console.log(`✅ Users cache cleared. Total deleted: ${totalDeleted}`);
    }
  } catch (error) {
    console.error("❌ Error clearing users cache:", error);
  }
};

