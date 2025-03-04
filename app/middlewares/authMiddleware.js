const { decodeToken } = require("../../utils/methods");

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Unauthorized: No token provided." });
    }

    const decoded = decodeToken(token);

    if (!decoded) {
        return res.status(401).json({ error: "Unauthorized: Token expired, please refresh your token." });
    }

    req.user = decoded.user; // ✅ Attach user data to `req.user` for controllers to use
    next(); // ✅ Proceed to the next function (controller)
};

module.exports = authMiddleware;
