
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const { db } = require('./database');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const leaderboardRoutes = require('./routes/leaderboard');
const { router: pushRouter, sendScoreBeatenNotification } = require('./routes/push');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
// Serve frontend files
const publicPath = path.join(__dirname, 'public');
if (require('fs').existsSync(publicPath)) {
    app.use(express.static(publicPath));
} else {
    app.use(express.static(path.join(__dirname, '../')));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/push', pushRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Attach notification function to app
app.locals.notifyScoreBeaten = (data) => {
    sendScoreBeatenNotification(data, app);
};

// WebSocket for real-time updates
const wss = new WebSocket.Server({ server, path: '/ws' });
app.locals.wss = wss;

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
            }
        } catch (err) {
            // Ignore invalid messages
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Broadcast new game to all connected clients
function broadcastNewGame(game) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'NEW_GAME',
                data: game
            }));
        }
    });
}

// Attach broadcast function
app.locals.broadcastNewGame = broadcastNewGame;

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎳 BowlTrack server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    db.close(() => {
        console.log('Database closed');
        process.exit(0);
    });
});
