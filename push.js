
const express = require('express');
const webpush = require('web-push');
const { dbAsync } = require('../database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// VAPID keys - generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@bowltrack.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Get VAPID public key
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
router.post('/subscribe', verifyToken, async (req, res) => {
    try {
        const { subscription } = req.body;
        const userId = req.user.uid;

        // Remove existing subscription for this user
        await dbAsync.run('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);

        // Save new subscription
        await dbAsync.run(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
            [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
        );

        res.json({ message: 'Subscribed to notifications' });
    } catch (err) {
        console.error('Subscribe error:', err);
        res.status(500).json({ error: 'Subscription failed' });
    }
});

// Unsubscribe
router.post('/unsubscribe', verifyToken, async (req, res) => {
    try {
        await dbAsync.run('DELETE FROM push_subscriptions WHERE user_id = ?', [req.user.uid]);
        res.json({ message: 'Unsubscribed' });
    } catch (err) {
        res.status(500).json({ error: 'Unsubscribe failed' });
    }
});

// Send notification to all subscribers except sender
async function sendScoreBeatenNotification(data, app) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
        const subs = await dbAsync.all(
            'SELECT * FROM push_subscriptions WHERE user_id != ?',
            [data.userId]
        );

        const payload = JSON.stringify({
            title: '🏆 Score Alert!',
            body: `${data.userName} just scored ${data.score}, beating their personal best!`,
            tag: 'score-beaten',
            payload: {
                userId: data.userId,
                userName: data.userName,
                score: data.score,
                type: 'score_beaten'
            }
        });

        const sendPromises = subs.map(sub => {
            const subscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            return webpush.sendNotification(subscription, payload).catch(err => {
                console.log('Push failed for endpoint:', sub.endpoint.substring(0, 30), err.message);
            });
        });

        await Promise.all(sendPromises);

        // Also broadcast via WebSocket
        if (app.locals.wss) {
            app.locals.wss.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'SCORE_BEATEN',
                        data
                    }));
                }
            });
        }
    } catch (err) {
        console.error('Send notification error:', err);
    }
}

module.exports = { router, sendScoreBeatenNotification };
