const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bowltrack-secret-change-me';
const DB_PATH = path.join(__dirname, 'bowltrack.db');

// ==================== DATABASE ====================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB Error:', err);
    else console.log('SQLite connected');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        best_score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        total_score INTEGER NOT NULL,
        frames_json TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_games_timestamp ON games(timestamp)`);
});

// Promisified DB helpers
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// ==================== AUTH MIDDLEWARE ====================
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token' });
    }
    try {
        req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function generateToken(user) {
    return jwt.sign({ uid: user.uid, email: user.email, displayName: user.display_name }, JWT_SECRET, { expiresIn: '7d' });
}

// ==================== EXPRESS APP ====================
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

        const existing = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email exists' });

        const uid = uuidv4();
        const hash = await bcrypt.hash(password, 10);
        await dbRun('INSERT INTO users (uid, display_name, email, password_hash) VALUES (?, ?, ?, ?)', [uid, name, email, hash]);

        const token = generateToken({ uid, email, display_name: name });
        res.status(201).json({ token, user: { uid, email, displayName: name } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = generateToken(user);
        res.json({ token, user: { uid: user.uid, email: user.email, displayName: user.display_name } });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const user = await dbGet('SELECT uid, display_name, email, best_score FROM users WHERE uid = ?', [decoded.uid]);
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json({ uid: user.uid, displayName: user.display_name, email: user.email, bestScore: user.best_score });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

app.delete('/api/auth/account', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        await dbRun('DELETE FROM games WHERE user_id = ?', [decoded.uid]);
        await dbRun('DELETE FROM users WHERE uid = ?', [decoded.uid]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ==================== GAME ROUTES ====================
app.post('/api/games', verifyToken, async (req, res) => {
    try {
        const { frames, totalScore, date, timestamp } = req.body;
        const gameId = uuidv4();
        const userName = req.user.displayName || req.user.email.split('@')[0];
        await dbRun(
            'INSERT INTO games (game_id, user_id, user_name, total_score, frames_json, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [gameId, req.user.uid, userName, totalScore, JSON.stringify(frames), date, timestamp]
        );
        res.status(201).json({ id: gameId, message: 'Game saved' });
    } catch (err) {
        console.error('Save game error:', err);
        res.status(500).json({ error: 'Failed to save game' });
    }
});

app.get('/api/games/my', verifyToken, async (req, res) => {
    try {
        const games = await dbAll(
            'SELECT game_id as id, user_id, user_name, total_score, frames_json, date, timestamp FROM games WHERE user_id = ? ORDER BY timestamp DESC',
            [req.user.uid]
        );
        res.json(games.map(g => ({ ...g, frames: JSON.parse(g.frames_json) })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load games' });
    }
});

app.get('/api/games/all', async (req, res) => {
    try {
        const games = await dbAll(
            'SELECT game_id as id, user_id, user_name, total_score, frames_json, date, timestamp FROM games ORDER BY timestamp DESC LIMIT 100'
        );
        res.json(games.map(g => ({ ...g, frames: JSON.parse(g.frames_json) })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load games' });
    }
});

// ==================== LEADERBOARD ROUTES ====================
app.get('/api/leaderboard', async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        let dateFilter = '';
        if (filter === 'today') dateFilter = "AND date(g.date) = date('now')";
        else if (filter === 'week') dateFilter = "AND date(g.date) >= date('now', '-7 days')";

        const leaders = await dbAll(
            `SELECT g.user_id, g.user_name, MAX(g.total_score) as best_score, g.game_id as id, g.date, g.timestamp
             FROM games g WHERE 1=1 ${dateFilter} GROUP BY g.user_id ORDER BY best_score DESC LIMIT 50`
        );
        res.json(leaders.map((l, i) => ({ rank: i + 1, userId: l.user_id, userName: l.user_name, totalScore: l.best_score, id: l.id, date: l.date, timestamp: l.timestamp })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

app.get('/api/leaderboard/stats/:userId', async (req, res) => {
    try {
        const games = await dbAll('SELECT total_score, date FROM games WHERE user_id = ?', [req.params.userId]);
        if (games.length === 0) return res.json({ gamesPlayed: 0, bestScore: 0, averageScore: 0, bestOfDay: 0 });
        const scores = games.map(g => g.total_score);
        const today = new Date().toISOString().split('T')[0];
        const todayScores = games.filter(g => g.date.startsWith(today)).map(g => g.total_score);
        res.json({ gamesPlayed: games.length, bestScore: Math.max(...scores), averageScore: Math.round(scores.reduce((a,b) => a+b,0)/scores.length), bestOfDay: todayScores.length > 0 ? Math.max(...todayScores) : 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== STATIC FILES ====================
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ==================== WEBSOCKET ====================
const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        try { if (JSON.parse(msg).type === 'PING') ws.send(JSON.stringify({ type: 'PONG' })); } catch (e) {}
    });
});

// ==================== START ====================
server.listen(PORT, () => {
    console.log('🎳 BowlTrack server running on port ' + PORT);
});

process.on('SIGINT', () => {
    db.close(() => process.exit(0));
});
