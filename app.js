
/**
 * BowlTrack - Main Application (API Connected)
 * Connects to bowltrack-server for real database, auth, and real-time updates
 */

class BowlTrackApp {
    constructor() {
        this.api = new ApiClient();
        this.currentUser = null;
        this.currentGame = null;
        this.games = [];
        this.allGames = [];
        this.currentScreen = 'dashboard';
        this.chart = null;
        this.ocrGame = null;
        this.push = new PushNotificationManager();
        this.offline = new OfflineSyncManager();
    }

    async init() {
        // Init IndexedDB for offline support
        try {
            await this.offline.init();
            this.offline.setupListeners();
            this.offline.onStatusChange = (status) => this.handleConnectivityChange(status);
            this.offline.onSyncComplete = (result) => this.handleSyncComplete(result);
        } catch (err) {
            console.error('IndexedDB init failed:', err);
        }

        // Setup WebSocket handler
        this.api.onWsMessage = (msg) => this.handleWsMessage(msg);

        // Show splash then check auth
        setTimeout(() => {
            this.checkAuth();
        }, 1500);

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.tab}-form`).classList.add('active');
                document.getElementById('auth-error').textContent = '';
            });
        });

        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            this.login(email, password);
        });

        // Register form
        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            this.register(name, email, password);
        });

        // Bottom nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.navigate(screen);
            });
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.loadLeaderboard(e.target.dataset.filter);
            });
        });

        // File input for OCR
        document.getElementById('file-input').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });
    }

    // ===== CONNECTIVITY =====

    handleConnectivityChange(status) {
        const banner = document.getElementById('offline-banner');
        const body = document.body;

        if (status === 'offline') {
            banner.style.display = 'flex';
            body.classList.add('offline-active');
            this.showToast('You are offline. Games will sync when you reconnect.', 'warning');
        } else {
            banner.style.display = 'none';
            body.classList.remove('offline-active');
            this.showToast('Back online! Syncing...', 'success');
            this.syncPendingGames();
        }

        this.updateConnectionBadge();
    }

    handleSyncComplete(result) {
        document.getElementById('sync-indicator').style.display = 'none';
        if (result.synced > 0) {
            this.showToast(`${result.synced} game(s) synced`, 'success');
            this.loadUserData(true);
        }
    }

    handleWsMessage(msg) {
        if (msg.type === 'NEW_GAME') {
            // Refresh leaderboard if on that screen
            if (this.currentScreen === 'leaderboard') {
                this.loadLeaderboard(document.querySelector('.filter-tab.active')?.dataset.filter || 'all');
            }
            // Show notification if someone beat their score
            if (msg.data && msg.data.userId !== this.currentUser?.uid) {
                this.push.showInAppNotification(
                    '🏆 New Score!',
                    `${msg.data.userName} scored ${msg.data.totalScore}`,
                    'info'
                );
            }
        }
        if (msg.type === 'SCORE_BEATEN') {
            this.push.showInAppNotification(
                '🏆 Score Alert!',
                `${msg.data.userName} beat their personal best with ${msg.data.score}!`,
                'warning'
            );
        }
    }

    async syncPendingGames() {
        const pending = await this.offline.getSyncQueue();
        if (pending.length === 0) return;

        document.getElementById('sync-indicator').style.display = 'flex';
        let synced = 0;

        for (const op of pending) {
            try {
                if (op.type === 'SAVE_GAME') {
                    await this.api.saveGame(op.data);
                    synced++;
                }
                await this.offline.removeFromSyncQueue(op.id);
            } catch (err) {
                console.error('Sync failed:', err);
            }
        }

        document.getElementById('sync-indicator').style.display = 'none';
        if (synced > 0) {
            this.showToast(`${synced} game(s) synced`, 'success');
            this.loadUserData(true);
        }
    }

    async updatePendingCount() {
        try {
            const count = await this.offline.getPendingCount();
            const badge = document.getElementById('pending-sync-count');
            const info = document.getElementById('pending-games-info');
            const countSpan = document.getElementById('pending-count');

            if (count > 0) {
                badge.style.display = 'inline-block';
                badge.textContent = count;
                info.style.display = 'flex';
                countSpan.textContent = `${count} game${count > 1 ? 's' : ''}`;
            } else {
                badge.style.display = 'none';
                info.style.display = 'none';
            }
        } catch (err) {
            console.error('Pending count error:', err);
        }
    }

    updateConnectionBadge() {
        const badge = document.getElementById('connection-badge');
        const desc = document.getElementById('sync-desc');

        if (navigator.onLine) {
            badge.textContent = 'Online';
            badge.className = 'connection-badge online';
            desc.textContent = 'Connected to server';
        } else {
            badge.textContent = 'Offline';
            badge.className = 'connection-badge offline';
            desc.textContent = 'Local mode - will sync later';
        }
    }

    async forceSync() {
        if (!navigator.onLine) {
            this.showToast('You are offline. Connect to sync.', 'warning');
            return;
        }
        await this.syncPendingGames();
    }

    // ===== AUTHENTICATION =====

    async checkAuth() {
        if (this.api.isAuthenticated()) {
            try {
                const user = await this.api.getMe();
                this.currentUser = user;
                this.enterApp();
            } catch (err) {
                // Token invalid
                this.api.setToken(null);
                this.showAuth();
            }
        } else {
            this.showAuth();
        }
    }

    showAuth() {
        document.getElementById('splash-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
    }

    async login(email, password) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = '';

        if (!email || !password) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }

        try {
            const result = await this.api.login(email, password);
            this.api.setToken(result.token);
            this.currentUser = result.user;
            this.enterApp();
        } catch (err) {
            errorEl.textContent = err.message || 'Login failed';
        }
    }

    async register(name, email, password) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = '';

        if (!name || !email || !password) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }

        try {
            const result = await this.api.register(name, email, password);
            this.api.setToken(result.token);
            this.currentUser = result.user;
            this.enterApp();
        } catch (err) {
            errorEl.textContent = err.message || 'Registration failed';
        }
    }

    async logout() {
        this.push.stopPolling();
        this.api.disconnectWebSocket();
        this.api.setToken(null);
        this.currentUser = null;
        localStorage.removeItem('bowltrack_notif_enabled');
        location.reload();
    }

    async deleteAccount() {
        if (!confirm('Are you sure? This will permanently delete your account and all game data.')) return;

        try {
            await this.api.deleteAccount();
            await this.offline.deleteUserGames(this.currentUser.uid);
            this.api.setToken(null);
            location.reload();
        } catch (err) {
            this.showToast('Error deleting account: ' + err.message, 'error');
        }
    }

    confirmDeleteAccount() {
        this.showModal(
            'Delete Account',
            'This will permanently delete your account and all associated game data. This action cannot be undone.',
            () => this.deleteAccount()
        );
    }

    // ===== NOTIFICATIONS =====

    async toggleNotifications() {
        const btn = document.getElementById('notif-toggle');
        const status = document.getElementById('notif-status');

        if (this.push.permission === 'granted') {
            this.push.stopPolling();
            btn.classList.remove('active');
            status.textContent = 'Notifications disabled';
            localStorage.setItem('bowltrack_notif_enabled', 'false');
            try { await this.api.unsubscribePush(); } catch (e) {}
        } else {
            const result = await this.push.requestPermission();

            if (result.granted) {
                btn.classList.add('active');
                status.textContent = 'Notifications enabled!';
                localStorage.setItem('bowltrack_notif_enabled', 'true');

                // Subscribe to push via API
                if ('serviceWorker' in navigator && 'PushManager' in window) {
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: await this.getVapidKey()
                    });
                    await this.api.subscribePush(subscription);
                }

                this.showToast('You\'ll be notified when someone beats their best score!', 'success');
            } else {
                status.textContent = result.error || 'Permission denied';
                this.showToast('Please enable notifications in your browser settings', 'warning');
            }
        }
    }

    async getVapidKey() {
        try {
            const data = await this.api.getVapidKey();
            return data.publicKey;
        } catch (err) {
            return null;
        }
    }

    // ===== APP NAVIGATION =====

    enterApp() {
        document.getElementById('splash-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-container').classList.add('active');
        document.getElementById('bottom-nav').style.display = 'flex';

        const initial = (this.currentUser.displayName || this.currentUser.email).charAt(0).toUpperCase();
        document.getElementById('user-initial').textContent = initial;
        document.getElementById('profile-avatar').textContent = initial;
        document.getElementById('profile-name').textContent = this.currentUser.displayName || 'User';
        document.getElementById('profile-email').textContent = this.currentUser.email;

        // Connect WebSocket for real-time updates
        this.api.connectWebSocket();

        // Load notification preference
        const notifEnabled = localStorage.getItem('bowltrack_notif_enabled') === 'true';
        if (notifEnabled) {
            document.getElementById('notif-toggle').classList.add('active');
            document.getElementById('notif-status').textContent = 'Notifications enabled';
        }

        this.updateConnectionBadge();
        this.loadUserData();
        this.navigate('dashboard');
    }

    navigate(screen) {
        document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        document.getElementById(`${screen}-screen`).classList.add('active');
        document.querySelector(`.nav-item[data-screen="${screen}"]`)?.classList.add('active');

        this.currentScreen = screen;

        switch(screen) {
            case 'dashboard': this.loadDashboard(); break;
            case 'history': this.loadHistory(); break;
            case 'leaderboard': this.loadLeaderboard('all'); break;
            case 'profile': this.loadProfile(); break;
            case 'new-game': this.startNewGame(); break;
        }
    }

    // ===== GAME MANAGEMENT =====

    startNewGame() {
        this.currentGame = new BowlingGame();
        this.renderFrames();
        this.renderPinButtons();
        document.getElementById('save-game-btn').disabled = true;
        document.getElementById('offline-save-hint').style.display = navigator.onLine ? 'none' : 'inline';
    }

    resetGame() {
        if (this.currentGame && this.currentGame.frames.some(f => f.rolls.length > 0)) {
            if (!confirm('Reset current game?')) return;
        }
        this.startNewGame();
    }

    addRoll(pins) {
        if (!this.currentGame) return;
        const success = this.currentGame.addRoll(pins);
        if (success) {
            this.renderFrames();
            this.renderPinButtons();
            if (this.currentGame.gameComplete) {
                document.getElementById('save-game-btn').disabled = false;
                this.showToast(`Game complete! Score: ${this.currentGame.getTotalScore()}`, 'success');
            }
        }
    }

    undoLastRoll() {
        if (!this.currentGame || this.currentGame.frames.every(f => f.rolls.length === 0)) {
            this.showToast('Nothing to undo', 'warning');
            return;
        }
        const allRolls = [];
        this.currentGame.frames.forEach(f => f.rolls.forEach(r => allRolls.push(r)));
        allRolls.pop();
        this.currentGame = new BowlingGame();
        allRolls.forEach(r => this.currentGame.addRoll(r));
        this.renderFrames();
        this.renderPinButtons();
        document.getElementById('save-game-btn').disabled = !this.currentGame.gameComplete;
    }

    async saveGame() {
        if (!this.currentGame || !this.currentGame.gameComplete) return;

        const gameData = {
            userId: this.currentUser.uid,
            userName: this.currentUser.displayName || this.currentUser.email.split('@')[0],
            frames: this.currentGame.frames.map(f => ({
                rolls: [...f.rolls],
                score: f.score,
                display: [...f.display]
            })),
            totalScore: this.currentGame.getTotalScore(),
            date: new Date().toISOString(),
            timestamp: Date.now()
        };

        try {
            if (navigator.onLine) {
                // Online: Save to API
                const result = await this.api.saveGame(gameData);
                gameData.id = result.id;
                gameData.synced = true;

                // Also cache locally
                await this.offline.saveGame(gameData, this.currentUser.uid);

                if (result.newBest) {
                    this.push.showInAppNotification(
                        '🎉 New Personal Best!',
                        `You scored ${gameData.totalScore}!`,
                        'success'
                    );
                }
            } else {
                // Offline: Queue for later
                await this.offline.saveGame(gameData, this.currentUser.uid);
            }

            this.showToast(`Game saved! Score: ${gameData.totalScore}`, 'success');
            this.updatePendingCount();
            this.loadUserData();
            this.navigate('dashboard');
        } catch (err) {
            // If API fails, save locally as fallback
            await this.offline.saveGame(gameData, this.currentUser.uid);
            this.showToast('Saved locally - will sync when online', 'warning');
            this.updatePendingCount();
        }
    }

    renderFrames() {
        const container = document.getElementById('frames-container');
        const state = this.currentGame.getFrameState();
        container.innerHTML = '';
        state.frames.forEach((frame, i) => {
            const div = document.createElement('div');
            div.className = 'frame-box';
            if (i === state.currentFrame && !state.gameComplete) div.classList.add('active');
            if (frame.score !== null) div.classList.add('completed');
            const rollsHtml = frame.display.map(r => `<span class="frame-roll">${r}</span>`).join('');
            div.innerHTML = `
                <div class="frame-number">${i + 1}</div>
                <div class="frame-rolls">${rollsHtml}</div>
                <div class="frame-score">${frame.score !== null ? frame.score : ''}</div>
            `;
            container.appendChild(div);
        });
        document.getElementById('current-total').textContent = state.totalScore || 0;
    }

    renderPinButtons() {
        const container = document.getElementById('pin-buttons');
        const state = this.currentGame.getFrameState();
        if (state.gameComplete) {
            container.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">Game Complete!</div>';
            return;
        }
        const frame = state.frames[state.currentFrame];
        const maxPins = this.getMaxPins(frame, state.currentFrame, state.currentRoll);
        container.innerHTML = '';
        for (let i = 0; i <= 10; i++) {
            const btn = document.createElement('button');
            btn.className = 'pin-btn';
            btn.textContent = i === 10 ? 'X' : i;
            btn.disabled = i > maxPins;
            if (i === 10 && !btn.disabled) btn.classList.add('strike');
            btn.addEventListener('click', () => this.addRoll(i));
            container.appendChild(btn);
        }
        const frameNum = state.currentFrame + 1;
        const rollNum = state.currentRoll + 1;
        document.getElementById('roll-indicator').textContent = `Frame ${frameNum}, Roll ${rollNum}`;
    }

    getMaxPins(frame, frameIndex, rollIndex) {
        if (frameIndex < 9) {
            if (rollIndex === 0) return 10;
            return 10 - frame.rolls[0];
        } else {
            if (rollIndex === 0) return 10;
            if (rollIndex === 1) {
                if (frame.rolls[0] === 10) return 10;
                return 10 - frame.rolls[0];
            }
            if (rollIndex === 2) {
                if (frame.rolls[0] === 10 && frame.rolls[1] === 10) return 10;
                if (frame.rolls[0] === 10) return 10 - frame.rolls[1];
                return 10 - frame.rolls[1];
            }
        }
        return 0;
    }

    // ===== OCR SCANNING =====

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('scan-image');
            img.src = e.target.result;
            img.style.display = 'block';
            document.querySelector('.scan-placeholder').style.display = 'none';
            this.processOCR(img);
        };
        reader.readAsDataURL(file);
    }

    async processOCR(imgElement) {
        const statusEl = document.getElementById('ocr-status');
        const resultsEl = document.getElementById('ocr-results');
        statusEl.style.display = 'block';
        resultsEl.style.display = 'none';
        try {
            const result = await Tesseract.recognize(imgElement, 'eng', { logger: m => console.log(m) });
            const text = result.data.text;
            console.log('OCR Text:', text);
            const digits = this.extractDigitsFromOCR(text);
            this.ocrGame = this.buildGameFromDigits(digits);
            this.renderOCRResults();
            statusEl.style.display = 'none';
            resultsEl.style.display = 'block';
        } catch (err) {
            console.error('OCR Error:', err);
            statusEl.style.display = 'none';
            this.showToast('OCR failed. Please enter scores manually.', 'error');
        }
    }

    extractDigitsFromOCR(text) {
        const lines = text.split('\n');
        const allDigits = [];
        lines.forEach(line => {
            const matches = line.match(/\d+/g);
            if (matches) {
                matches.forEach(m => {
                    const num = parseInt(m);
                    if (num >= 0 && num <= 10) allDigits.push(num);
                });
            }
        });
        return allDigits;
    }

    buildGameFromDigits(digits) {
        const game = new BowlingGame();
        for (let i = 0; i < digits.length && !game.gameComplete; i++) {
            const maxPins = this.getMaxPins(game.frames[game.currentFrame], game.currentFrame, game.currentRoll);
            if (digits[i] <= maxPins) game.addRoll(digits[i]);
        }
        return game;
    }

    renderOCRResults() {
        const container = document.getElementById('ocr-frames');
        container.innerHTML = '';
        if (!this.ocrGame) return;
        this.ocrGame.frames.forEach((frame, i) => {
            const div = document.createElement('div');
            div.className = 'ocr-frame';
            const rollsStr = frame.rolls.join(',');
            div.innerHTML = `
                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">F${i+1}</div>
                <input type="text" value="${rollsStr}" data-frame="${i}" placeholder="0,0">
            `;
            container.appendChild(div);
        });
    }

    async saveOCRGame() {
        if (!this.ocrGame) return;
        const inputs = document.querySelectorAll('.ocr-frame input');
        const newGame = new BowlingGame();
        inputs.forEach(input => {
            const values = input.value.split(/[,\s]+/).filter(v => v !== '').map(v => parseInt(v));
            values.forEach(v => {
                if (!isNaN(v) && v >= 0 && v <= 10) {
                    const maxPins = this.getMaxPins(newGame.frames[newGame.currentFrame], newGame.currentFrame, newGame.currentRoll);
                    if (v <= maxPins && !newGame.gameComplete) newGame.addRoll(v);
                }
            });
        });
        if (!newGame.gameComplete) {
            this.showToast('Please complete all 10 frames', 'warning');
            return;
        }
        this.currentGame = newGame;
        await this.saveGame();
    }

    // ===== DATA LOADING =====

    async loadUserData(forceRefresh = false) {
        try {
            // Load from API
            if (navigator.onLine || forceRefresh) {
                const [myGames, allGames] = await Promise.all([
                    this.api.getMyGames().catch(() => []),
                    this.api.getAllGames().catch(() => [])
                ]);
                this.games = myGames;
                this.allGames = allGames;

                // Cache locally
                for (const game of myGames) {
                    await this.offline.putInStore('games', { ...game, synced: true });
                }
                await this.offline.cacheLeaderboard(allGames);
            } else {
                // Offline: use cache
                this.games = await this.offline.getUserGames(this.currentUser.uid);
                this.allGames = await this.offline.getCachedLeaderboard();
            }
        } catch (err) {
            console.error('Load data error:', err);
            this.games = await this.offline.getUserGames(this.currentUser.uid);
            this.allGames = await this.offline.getCachedLeaderboard();
        }
    }

    loadDashboard() {
        const stats = calculateStats(this.games);
        document.getElementById('stat-best').textContent = stats.bestScore || '-';
        document.getElementById('stat-average').textContent = stats.averageScore || '-';
        document.getElementById('stat-games').textContent = stats.gamesPlayed;
        document.getElementById('stat-today').textContent = stats.bestOfDay || '-';

        const recentList = document.getElementById('recent-games-list');
        if (this.games.length === 0) {
            recentList.innerHTML = `<div class="empty-state"><p>No games yet. Start bowling!</p></div>`;
        } else {
            recentList.innerHTML = this.games.slice(0, 5).map(game => this.renderGameCard(game)).join('');
        }
        this.updatePendingCount();
    }

    loadHistory() {
        const list = document.getElementById('all-games-list');
        if (this.games.length === 0) {
            list.innerHTML = `<div class="empty-state"><p>No games recorded yet</p></div>`;
            if (this.chart) { this.chart.destroy(); this.chart = null; }
            return;
        }
        list.innerHTML = this.games.map(game => this.renderGameCard(game)).join('');
        this.renderScoreChart();
        const allSynced = this.games.every(g => g.synced !== false);
        document.getElementById('history-sync-status').style.display = allSynced ? 'inline-block' : 'none';
    }

    renderScoreChart() {
        const ctx = document.getElementById('score-chart').getContext('2d');
        if (this.chart) this.chart.destroy();
        const sortedGames = [...this.games].sort((a, b) => a.timestamp - b.timestamp);
        const labels = sortedGames.map((g, i) => `Game ${i + 1}`);
        const scores = sortedGames.map(g => g.totalScore);
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Score',
                    data: scores,
                    borderColor: '#e94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#e94560',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 300, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0a0', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#a0a0a0', font: { size: 10 } } }
                }
            }
        });
    }

    async loadLeaderboard(filter) {
        const list = document.getElementById('leaderboard-list');
        try {
            const leaders = await this.api.getLeaderboard(filter);
            if (leaders.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>No scores yet. Be the first!</p></div>`;
                return;
            }
            list.innerHTML = leaders.map((entry, i) => {
                const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                const date = new Date(entry.date).toLocaleDateString();
                return `
                    <div class="leaderboard-item">
                        <div class="leaderboard-rank ${rankClass}">${entry.rank}</div>
                        <div class="leaderboard-info">
                            <h4>${entry.userName || 'Anonymous'}</h4>
                            <p>${date}</p>
                        </div>
                        <div class="leaderboard-score">${entry.totalScore}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            list.innerHTML = `<div class="empty-state"><p>Failed to load leaderboard</p></div>`;
        }
    }

    async loadProfile() {
        try {
            const stats = await this.api.getUserStats(this.currentUser.uid);
            document.getElementById('profile-games').textContent = stats.gamesPlayed;
            document.getElementById('profile-best').textContent = stats.bestScore;
            document.getElementById('profile-avg').textContent = stats.averageScore;
        } catch (err) {
            const stats = calculateStats(this.games);
            document.getElementById('profile-games').textContent = stats.gamesPlayed;
            document.getElementById('profile-best').textContent = stats.bestScore;
            document.getElementById('profile-avg').textContent = stats.averageScore;
        }
        this.updatePendingCount();
        this.updateConnectionBadge();
    }

    renderGameCard(game) {
        const date = new Date(game.date);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isPending = game.synced === false;
        const syncIcon = isPending ? '⏳' : '✓';
        return `
            <div class="game-card ${isPending ? 'pending' : 'synced'}" onclick="app.showGameDetail('${game.id || ''}')">
                <div class="game-info">
                    <h4>${dateStr} <span class="sync-status-icon">${syncIcon}</span></h4>
                    <p>${timeStr}</p>
                </div>
                <div class="game-score">${game.totalScore}</div>
            </div>
        `;
    }

    showGameDetail(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (!game) return;
        let framesHtml = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">';
        game.frames.forEach((frame, i) => {
            const rolls = frame.display.map(r => r || '-').join(' ');
            framesHtml += `
                <div style="background:var(--bg-light);padding:8px;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;color:var(--text-muted);">F${i+1}</div>
                    <div style="font-weight:700;">${rolls}</div>
                    <div style="color:var(--primary);font-weight:700;">${frame.score !== null ? frame.score : ''}</div>
                </div>
            `;
        });
        framesHtml += '</div>';
        const syncStatus = game.synced === false ? '<p style="color:var(--warning);text-align:center;">⏳ Pending sync</p>' : '';
        this.showModal(`Game - ${game.totalScore} points`, framesHtml + `<p style="text-align:center;color:var(--text-muted);">${new Date(game.date).toLocaleString()}</p>` + syncStatus, null, false);
    }

    showAbout() {
        this.showModal('About BowlTrack', `<p style="margin-bottom:12px;">BowlTrack is a bowling score tracker with OCR scanning, group leaderboards, offline support, and push notifications.</p><p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:8px;">Version 2.0 - API Connected</p><p style="color:var(--text-muted);font-size:0.85rem;">Backend: Node.js + SQLite | Real-time: WebSockets</p>`, null, false);
    }

    // ===== UI UTILITIES =====

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showModal(title, content, onConfirm, showFooter = true) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        const footer = document.getElementById('modal-footer');
        const confirmBtn = document.getElementById('modal-confirm');
        if (showFooter && onConfirm) {
            footer.style.display = 'flex';
            confirmBtn.onclick = () => { onConfirm(); this.closeModal(); };
        } else {
            footer.style.display = showFooter ? 'flex' : 'none';
        }
        document.getElementById('modal-overlay').style.display = 'flex';
    }

    closeModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }
}

// Initialize app
const app = new BowlTrackApp();
document.addEventListener('DOMContentLoaded', () => app.init());
