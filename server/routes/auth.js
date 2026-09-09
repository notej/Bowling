
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { dbAsync } = require('../database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email exists
        const existing = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const uid = uuidv4();
        const passwordHash = await bcrypt.hash(password, 10);

        await dbAsync.run(
            'INSERT INTO users (uid, display_name, email, password_hash) VALUES (?, ?, ?, ?)',
            [uid, name, email, passwordHash]
        );

        const token = generateToken({ uid, email, display_name: name });

        res.status(201).json({
            token,
            user: { uid, email, displayName: name }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = generateToken(user);

        res.json({
            token,
            user: {
                uid: user.uid,
                email: user.email,
                displayName: user.display_name
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await dbAsync.get('SELECT uid, display_name, email, best_score FROM users WHERE uid = ?', [decoded.uid]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            uid: user.uid,
            displayName: user.display_name,
            email: user.email,
            bestScore: user.best_score
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Delete account
router.delete('/account', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);

        // Delete user's games
        await dbAsync.run('DELETE FROM games WHERE user_id = ?', [decoded.uid]);
        // Delete push subscriptions
        await dbAsync.run('DELETE FROM push_subscriptions WHERE user_id = ?', [decoded.uid]);
        // Delete user
        await dbAsync.run('DELETE FROM users WHERE uid = ?', [decoded.uid]);

        res.json({ message: 'Account deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;
