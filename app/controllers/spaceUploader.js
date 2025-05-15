const AWS = require('aws-sdk');

const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT);

const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
});

const uploadFileToSpaces = async (file) => {
  const timestamp = Date.now();
  const originalName = file.originalname;

  const sanitizedOriginalName = originalName
        .replace(/[, ]+/g, '_')       // Replace spaces and commas with underscores
        .replace(/[^a-zA-Z0-9._-]/g, '') // Optionally remove weird special characters
        .replace(/__+/g, '_'); // Replace multiple underscores with a single one

  const mimeType = file.mimetype;
  const branch = process.env.NODE_ENV === 'development' ? 'development' : 'production';

  let folder = '';

  // 🔥 Detect folder based on MIME type
  if (mimeType.startsWith('image/')) {
    folder = 'images';
  } else if (mimeType.startsWith('video/')) {
    folder = 'videos';
  } else if (mimeType.startsWith('audio/')) {
    folder = 'audios';
  } else {
    folder = 'others';
  }

  const newFileName = `${timestamp}-${branch}-${sanitizedOriginalName}`;
  const fullPath = `${folder}/${timestamp}-${branch}-${sanitizedOriginalName}`;

  const params = {
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: fullPath,
    Body: file.buffer,
    ACL: 'public-read',
    ContentType: mimeType,
  };

  await s3.upload(params).promise();
  
  return newFileName;
};

module.exports = { uploadFileToSpaces };
