
/**
 * Push Notification Manager
 * Handles FCM tokens, permission requests, and score-beaten notifications
 */

class PushNotificationManager {
    constructor() {
        this.messaging = null;
        this.token = null;
        this.permission = 'default';
        this.onNotification = null;
        this.bestScores = {}; // userId -> bestScore
        this.pollingInterval = null;
        this.isDemoMode = false;
    }

    async init(firebaseApp, isDemoMode = false) {
        this.isDemoMode = isDemoMode;

        if (!isDemoMode && firebaseApp && typeof firebase !== 'undefined' && firebase.messaging) {
            try {
                this.messaging = firebase.messaging();

                // Handle foreground messages
                this.messaging.onMessage((payload) => {
                    console.log('Foreground message:', payload);
                    this.showLocalNotification(payload.notification);
                    if (this.onNotification) {
                        this.onNotification(payload);
                    }
                });

                // Check existing permission
                this.permission = Notification.permission;
            } catch (err) {
                console.log('FCM not available:', err);
            }
        }

        // Load cached best scores
        const cached = localStorage.getItem('bowltrack_best_scores');
        if (cached) {
            this.bestScores = JSON.parse(cached);
        }
    }

    // ===== PERMISSION =====

    async requestPermission() {
        if (!('Notification' in window)) {
            return { granted: false, error: 'Notifications not supported' };
        }

        try {
            const result = await Notification.requestPermission();
            this.permission = result;

            if (result === 'granted') {
                if (this.messaging) {
                    await this.getFCMToken();
                }
                return { granted: true };
            }

            return { granted: false, error: 'Permission denied' };
        } catch (err) {
            return { granted: false, error: err.message };
        }
    }

    async getFCMToken() {
        if (!this.messaging) return null;

        try {
            this.token = await this.messaging.getToken({
                vapidKey: 'YOUR_VAPID_KEY' // Replace with your FCM VAPID key
            });
            return this.token;
        } catch (err) {
            console.error('FCM token error:', err);
            return null;
        }
    }

    async saveTokenToFirestore(db, userId) {
        if (!this.token || !db) return;

        try {
            await db.collection('users').doc(userId).update({
                fcmToken: this.token,
                tokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Save token error:', err);
        }
    }

    // ===== NOTIFICATION DISPLAY =====

    showLocalNotification(notification) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const options = {
            body: notification.body || 'New notification',
            icon: '/assets/icon-192.png',
            badge: '/assets/icon-192.png',
            tag: notification.tag || 'bowltrack',
            requireInteraction: true,
            data: notification.data || {}
        };

        new Notification(notification.title || 'BowlTrack', options);
    }

    showInAppNotification(title, body, type = 'info') {
        // This will be called by the app to show toast-style notifications
        if (window.app && window.app.showToast) {
            window.app.showToast(`${title}: ${body}`, type);
        }
    }

    // ===== SCORE TRACKING & BEATEN DETECTION =====

    updateBestScore(userId, score) {
        const currentBest = this.bestScores[userId] || 0;
        if (score > currentBest) {
            this.bestScores[userId] = score;
            localStorage.setItem('bowltrack_best_scores', JSON.stringify(this.bestScores));
            return true; // New best
        }
        return false;
    }

    getBestScore(userId) {
        return this.bestScores[userId] || 0;
    }

    // Check if any user beat their previous best and notify
    async checkScoreBeaten(games, currentUserId) {
        const notifications = [];

        // Group games by user and find their best
        const userBests = {};
        games.forEach(game => {
            if (!userBests[game.userId] || game.totalScore > userBests[game.userId].totalScore) {
                userBests[game.userId] = game;
            }
        });

        // Check each user's best against their previous
        for (const [userId, game] of Object.entries(userBests)) {
            const previousBest = this.getBestScore(userId);
            if (game.totalScore > previousBest && previousBest > 0) {
                // This user beat their previous best
                if (userId === currentUserId) {
                    notifications.push({
                        type: 'personal_best',
                        title: '🎉 New Personal Best!',
                        body: `You scored ${game.totalScore}, beating your previous best of ${previousBest}!`,
                        data: { gameId: game.id || game.localId, score: game.totalScore }
                    });
                } else {
                    notifications.push({
                        type: 'score_beaten',
                        title: '🏆 Score Alert!',
                        body: `${game.userName || 'Someone'} just scored ${game.totalScore}, beating their personal best!`,
                        data: { userId, score: game.totalScore, userName: game.userName }
                    });
                }
                this.updateBestScore(userId, game.totalScore);
            }
        }

        return notifications;
    }

    // Demo mode: Poll for new scores and show notifications
    startPolling(gamesProvider, currentUserId, intervalMs = 10000) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        let lastCheck = Date.now();

        this.pollingInterval = setInterval(async () => {
            const games = await gamesProvider();
            const newGames = games.filter(g => (g.timestamp || Date.parse(g.date)) > lastCheck);

            if (newGames.length > 0) {
                const notifications = await this.checkScoreBeaten(games, currentUserId);
                notifications.forEach(n => {
                    this.showInAppNotification(n.title, n.body, n.type === 'personal_best' ? 'success' : 'warning');
                });
            }

            lastCheck = Date.now();
        }, intervalMs);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // ===== CLOUD FUNCTION TRIGGER (Documented) =====
    /*
    // Firebase Cloud Function to send push when score is beaten
    // Add this to your Firebase project:

    const functions = require('firebase-functions');
    const admin = require('firebase-admin');
    admin.initializeApp();

    exports.onGameCreated = functions.firestore
        .document('games/{gameId}')
        .onCreate(async (snap, context) => {
            const game = snap.data();
            const userId = game.userId;

            // Get user's previous best
            const userRef = admin.firestore().collection('users').doc(userId);
            const userDoc = await userRef.get();
            const userData = userDoc.data() || {};
            const previousBest = userData.bestScore || 0;

            if (game.totalScore > previousBest) {
                // Update user's best score
                await userRef.update({ bestScore: game.totalScore });

                // Get all users in the group
                const usersSnapshot = await admin.firestore().collection('users').get();

                const tokens = [];
                usersSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.fcmToken && doc.id !== userId) {
                        tokens.push(data.fcmToken);
                    }
                });

                if (tokens.length > 0) {
                    const message = {
                        notification: {
                            title: '🏆 Score Alert!',
                            body: `${game.userName} just scored ${game.totalScore}, beating their personal best!`
                        },
                        data: {
                            userId: userId,
                            score: String(game.totalScore),
                            type: 'score_beaten'
                        }
                    };

                    // Send to all tokens
                    const sendPromises = tokens.map(token => 
                        admin.messaging().send({ ...message, token }).catch(err => {
                            console.log('Failed to send to token:', token, err);
                        })
                    );

                    await Promise.all(sendPromises);
                }
            }
        });
    */
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PushNotificationManager;
}
