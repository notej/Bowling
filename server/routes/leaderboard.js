
const express = require('express');
const { dbAsync } = require('../database');

const router = express.Router();

// Get leaderboard
router.get('/', async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        let dateFilter = '';
        const params = [];

        if (filter === 'today') {
            dateFilter = "AND date(g.date) = date('now')";
        } else if (filter === 'week') {
            dateFilter = "AND date(g.date) >= date('now', '-7 days')";
        }

        // Get best score per user for the filtered period
        const query = `
            SELECT g.user_id, g.user_name, MAX(g.total_score) as best_score,
                   g.game_id as id, g.date, g.timestamp
            FROM games g
            WHERE 1=1 ${dateFilter}
            GROUP BY g.user_id
            ORDER BY best_score DESC
            LIMIT 50
        `;

        const leaders = await dbAsync.all(query, params);

        res.json(leaders.map((l, i) => ({
            rank: i + 1,
            userId: l.user_id,
            userName: l.user_name,
            totalScore: l.best_score,
            id: l.id,
            date: l.date,
            timestamp: l.timestamp
        })));
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

// Get user stats
router.get('/stats/:userId', async (req, res) => {
    try {
        const games = await dbAsync.all(
            'SELECT total_score, date FROM games WHERE user_id = ? ORDER BY timestamp DESC',
            [req.params.userId]
        );

        if (games.length === 0) {
            return res.json({ gamesPlayed: 0, bestScore: 0, averageScore: 0, bestOfDay: 0 });
        }

        const scores = games.map(g => g.total_score);
        const today = new Date().toISOString().split('T')[0];
        const todayScores = games.filter(g => g.date.startsWith(today)).map(g => g.total_score);

        res.json({
            gamesPlayed: games.length,
            bestScore: Math.max(...scores),
            averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            bestOfDay: todayScores.length > 0 ? Math.max(...todayScores) : 0
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

module.exports = router;
