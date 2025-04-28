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

  const newFileName = `${timestamp}-${branch}-${originalName}`;
  const fullPath = `${folder}/${timestamp}-${branch}-${originalName}`;

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
