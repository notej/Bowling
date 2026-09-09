
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { dbAsync } = require('../database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Save a game
router.post('/', verifyToken, async (req, res) => {
    try {
        const { frames, totalScore, date, timestamp } = req.body;
        const userId = req.user.uid;
        const userName = req.user.displayName || req.user.email.split('@')[0];

        const gameId = uuidv4();
        const framesJson = JSON.stringify(frames);

        await dbAsync.run(
            `INSERT INTO games (game_id, user_id, user_name, total_score, frames_json, date, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [gameId, userId, userName, totalScore, framesJson, date, timestamp]
        );

        // Update user's best score if applicable
        const user = await dbAsync.get('SELECT best_score FROM users WHERE uid = ?', [userId]);
        const previousBest = user ? user.best_score : 0;

        if (totalScore > previousBest) {
            await dbAsync.run('UPDATE users SET best_score = ? WHERE uid = ?', [totalScore, userId]);

            // Notify other users about new personal best
            if (req.app.locals.notifyScoreBeaten) {
                req.app.locals.notifyScoreBeaten({
                    userId,
                    userName,
                    score: totalScore,
                    previousBest
                });
            }
        }

        res.status(201).json({
            id: gameId,
            message: 'Game saved',
            newBest: totalScore > previousBest
        });
    } catch (err) {
        console.error('Save game error:', err);
        res.status(500).json({ error: 'Failed to save game' });
    }
});

// Get user's games
router.get('/my', verifyToken, async (req, res) => {
    try {
        const games = await dbAsync.all(
            `SELECT game_id as id, user_id, user_name, total_score, frames_json, date, timestamp
             FROM games WHERE user_id = ? ORDER BY timestamp DESC`,
            [req.user.uid]
        );

        const parsed = games.map(g => ({
            id: g.id,
            userId: g.user_id,
            userName: g.user_name,
            totalScore: g.total_score,
            frames: JSON.parse(g.frames_json),
            date: g.date,
            timestamp: g.timestamp
        }));

        res.json(parsed);
    } catch (err) {
        console.error('Get games error:', err);
        res.status(500).json({ error: 'Failed to load games' });
    }
});

// Get all games (for leaderboard)
router.get('/all', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const games = await dbAsync.all(
            `SELECT game_id as id, user_id, user_name, total_score, frames_json, date, timestamp
             FROM games ORDER BY timestamp DESC LIMIT ?`,
            [limit]
        );

        const parsed = games.map(g => ({
            id: g.id,
            userId: g.user_id,
            userName: g.user_name,
            totalScore: g.total_score,
            frames: JSON.parse(g.frames_json),
            date: g.date,
            timestamp: g.timestamp
        }));

        res.json(parsed);
    } catch (err) {
        console.error('Get all games error:', err);
        res.status(500).json({ error: 'Failed to load games' });
    }
});

// Delete a game
router.delete('/:gameId', verifyToken, async (req, res) => {
    try {
        const result = await dbAsync.run(
            'DELETE FROM games WHERE game_id = ? AND user_id = ?',
            [req.params.gameId, req.user.uid]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        res.json({ message: 'Game deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;
