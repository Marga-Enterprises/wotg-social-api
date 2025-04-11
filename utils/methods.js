const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const moment = require ('moment')
const authors = ['@baje'];
const jwt = require('jsonwebtoken');
const fs = require("fs");
const { exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

const { clearBlogCache } = require('./clearBlogCache');

const randomAuthor = () => {
  const l = authors[Math.floor(Math.random() * authors.length)];
  return l;
};

/**
 * convert moment
 * @param {*} params
 */
 exports.convertMomentWithFormat = (v) => {
   // Convert the given date to a Moment object
   const inputDate = moment(v);

   // Define the timezone offset of Manila (+08:00)
   const manilaOffset = 8 * 60; // 8 hours * 60 minutes

   // Apply the offset to the input date to get the Manila time
   const manilaTime = inputDate.utcOffset(manilaOffset);

   // Format the date
   return manilaTime.format('MM/DD/YYYY');
 };

 /**
 * Generate Access Token (Short-lived)
 * @param {Object} user
 * @returns {String} JWT Access Token
 */
exports.generateAccessToken = (user) => {
  return jwt.sign(
    {
      user: {
        id: user.id,
        user_role: user.user_role,
        user_fname: user.user_fname,
        user_lname: user.user_lname,
        user_profile_picture: user.user_profile_picture,
        email: user.email,
      },
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '7d' } // Default: 7 days
  );
};

/**
 * Generate Refresh Token (Long-lived)
 * @param {Object} user
 * @returns {String} JWT Refresh Token
 */
exports.generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '365d' } // Default: 1 year
  );
};

exports.sendError = (v, data, msg = '', errNo = 400, code = 101, collection = '') => {
  // console.log('COLLECTION', collection);

  /*
  console.log("[(x_-) SEND ERROR collection] ", collection);
  console.log("[(x_-) SEND ERROR code] ", code);
  console.log("[(x_-) SEND ERROR data] ", data);
  console.log("[(x_-) SEND ERROR msg] ", msg);

  

  // Check if MongoDB unique constraint violation (code 11000) occurred
  if (data && data.code === 11000) {
    const duplicateFieldMatch = data.errmsg.match(/index: (.+?)_1 dup key/);

    if (duplicateFieldMatch && duplicateFieldMatch[1]) {
      errorMessage = `${collection} with this ${duplicateFieldMatch[1]} already exists`;
      collection = duplicateFieldMatch[1]; // Set the collection name dynamically
    } else {
      errorMessage = "Existing field already exists";
    }
  }
  */

  return v.status(errNo).json({
    author: randomAuthor(),
    msg,
    data,
    success: false,
    version: "0.0.1",
    code,
    // collection, // Include the collection name in the response
  });
};


exports.formatPriceX = (price, key = '') => {
  const formattedPrice = parseFloat(price)
    .toFixed(2)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return key === '' ? `₱${formattedPrice}` : `${key}₱ ${formattedPrice}`;
};




exports.sendErrorUnauthorized = (v, data, msg = '', errNo = 401, code = 101) => {
  return v.status(errNo).json({
    author: randomAuthor(),
    msg,
    data,
    success: false,
    version: '0.0.1',
    code
  });
};

exports.sendSuccess = (v, data, msg = '', sNum = 200, code = 0) => {
  return v.json({
    author: randomAuthor(),
    msg,
    data,
    success: true,
    version: '0.0.1',
    code
  });
};


exports.getToken = (headers) => {
  if (headers && headers.authorization) {
    const parted = headers.authorization.split(' ');
    if (parted.length === 2) {
      return parted[1];
    }
  }

  return null;
};

exports.decodeToken = (token) => {
  if (!token) return null;

  try {
      return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
      if (err.name === "TokenExpiredError") {
          console.error("Access token expired:", err);
          return null; // ✅ Instead of crashing, return null
      }
      throw err; // ✅ If another error occurs, throw it
  }
};

exports.processVideo = async (inputFilePath, blog, userId, blogId) => {
  const webmFileName = `converted-${Date.now()}.webm`;
  const webmFilePath = path.join(__dirname, "../uploads", webmFileName);

  ffmpeg(inputFilePath)
      .videoCodec("libvpx")
      .audioCodec("libvorbis")
      .size('?x360') // ✅ Resize to 360p
      .outputOptions([
          "-b:v 500k",        // ✅ Lower bitrate for faster encoding
          "-deadline realtime",
          "-cpu-used 5"
      ])
      .output(webmFilePath)
      .on("end", async () => {
          try {
              // ✅ Delete original file
              fs.unlinkSync(inputFilePath);

              // ✅ Delete old converted file if exists
              if (blog.blog_video) {
                  const oldPath = path.join(__dirname, "../uploads", blog.blog_video);
                  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
              }

              // ✅ Update blog
              blog.blog_video = webmFileName;
              blog.blog_uploaded_by = userId;
              await blog.save();

              await clearBlogCache(blogId);

              console.log("✅ Video conversion and save complete:", webmFileName);
          } catch (error) {
              console.error("❌ Post-conversion error:", error);
          }
      })
      .on("error", (error) => {
          console.error("❌ FFmpeg conversion failed:", error);
          if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
      })
      .run();
};

exports.processImage = (inputFilePath) => {
  return new Promise((resolve, reject) => {
    const ext = path.extname(inputFilePath).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".jfif", ".gif"].includes(ext); // ✅ Fixed .jfif

    if (!isImage) {
      console.log("ℹ️ Not a supported image file, skipping conversion.");
      return resolve(null); // No conversion, keep original
    }

    const outputFilename = `profile-${Date.now()}.webp`;
    const outputPath = path.join(path.dirname(inputFilePath), outputFilename);
    const ffmpegCmd = `ffmpeg -i "${inputFilePath}" -vf "scale=iw*0.4:ih*0.4" -c:v libwebp -qscale:v 75 -compression_level 6 -preset photo -loop 0 -an -vsync 0 "${outputPath}"`;

    exec(ffmpegCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("❌ FFmpeg image conversion failed:", err);
        return reject(err);
      }

      // ✅ Delete original image file
      if (fs.existsSync(inputFilePath)) {
        fs.unlink(inputFilePath, (err) => {
          if (err) console.warn("⚠️ Failed to delete original image:", err);
        });
      }

      console.log("✅ Image converted to webp:", outputFilename);
      resolve(outputFilename);
    });
  });
};

