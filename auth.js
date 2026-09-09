
const jwt = require('jsonwebtoken');
const { dbAsync } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'bowltrack-secret-key-change-in-production';

function generateToken(user) {
    return jwt.sign(
        { uid: user.uid, email: user.email, displayName: user.display_name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = { generateToken, verifyToken, JWT_SECRET };
