const User = require('../models/User'); // Your existing User model
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for JWT generation
const { sendSuccess, sendError, sendErrorUnauthorized, getToken, decodeToken } = require('../../utils/methods');

exports.validateAndRedirect = async (req, res) => {
    const { email, roomname } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendError(res, null, 'A valid email is required.');
    }

    if (!roomname || typeof roomname !== 'string') {
        return sendError(res, null, 'A valid room name is required.');
    }

    try {
        // Check if the user exists in the database
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return sendErrorUnauthorized(res, null, 'Access denied: User not found.');
        }

        // Generate the JWT with the roomname
        const payload = {
            context: {
                user: {
                    email,
                },
            },
            room: roomname, // Add the roomname to the payload for additional security
            aud: process.env.APP_ID, 
            iss: process.env.APP_ID, 
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1y' });

        // Return the Jitsi meeting URL with the roomname and JWT
        const jitsiUrl = `https://meet.wotgonline.com/${roomname}?jwt=${token}`;

        return sendSuccess(res, { message: 'Access granted', jitsiUrl });
    } catch (error) {
        console.error('Error validating user:', error); // Log error
        return sendError(res, error, 'Failed to validate user.');
    }
};

