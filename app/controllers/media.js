const AWS = require('aws-sdk');

const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT);

const { 
    sendError, 
    sendSuccess, 
    getToken, 
    sendErrorUnauthorized, 
    decodeToken
} = require('../../utils/methods');

const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
});

exports.getPresignedUrl = async (req, res) => {
  const token = getToken(req.headers);
  const decodedToken = decodeToken(token);

  if (!token) return sendErrorUnauthorized(res, '', 'Please login first.');
  if (!decodedToken) return sendErrorUnauthorized(res, '', 'Token not valid, unable to detect');

  try {
    const { fileName, fileType } = req.body;
    

    if (!fileName || !fileType) {
      return sendError(res, '', 'File name and type are required');
    }


    const branch = process.env.NODE_ENV === 'development' ? 'development' : 'production';
    const timestamp = Date.now();
    const sanitizedFileName = fileName
      .replace(/[, ]+/g, '_')       // Replace spaces and commas with underscores
      .replace(/[^a-zA-Z0-9._-]/g, '') // Optionally remove weird special characters
      .replace(/__+/g, '_'); // Replace multiple underscores with a single one


    let folder = '';

    if (fileType.startsWith('image/')) {
      folder = 'images';
    } else if (fileType.startsWith('video/')) {
      folder = 'videos';
    }
    else if (fileType.startsWith('audio/')) {
      folder = 'audios';
    } else {
      return sendError(res, '', 'Unsupported file type');
    }

    const newFileName = `${timestamp}-${branch}-${sanitizedFileName}`;

    const params = {
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: `${folder}/${newFileName}`,
      ContentType: fileType,
      ACL: 'public-read',      // ✅ Make the file publicly accessible
      Expires: 300             // ✅ Pre-signed URL valid for 5 minutes (required)
    };

    const url = await s3.getSignedUrlPromise('putObject', params);

    const result = {
      url,
      fileName: newFileName,
      fileType,
      folder,
    }

    return sendSuccess(res, result, 'Presigned URL generated successfully');
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return sendError(res, 'Error generating presigned URL', 500);
  }
};
