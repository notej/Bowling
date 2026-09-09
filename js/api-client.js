
/**
 * BowlTrack API Client
 * Handles all communication with the backend server
 */

class ApiClient {
    constructor() {
        // Auto-detect API URL - works for local dev and deployed
        this.baseUrl = this.detectApiUrl();
        this.token = localStorage.getItem('bowltrack_token');
        this.ws = null;
        this.wsReconnectInterval = null;
        this.onWsMessage = null;
    }

    detectApiUrl() {
        // If running on localhost, use localhost:3000
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000/api';
        }
        // Otherwise assume API is on same origin
        return '/api';
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: this.getHeaders()
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(data?.error || `HTTP ${response.status}`);
        }
        return data;
    }

    // Auth
    async register(name, email, password) {
        return this.request('POST', '/auth/register', { name, email, password });
    }

    async login(email, password) {
        return this.request('POST', '/auth/login', { email, password });
    }

    async getMe() {
        return this.request('GET', '/auth/me');
    }

    async deleteAccount() {
        return this.request('DELETE', '/auth/account');
    }

    // Games
    async saveGame(gameData) {
        return this.request('POST', '/games', gameData);
    }

    async getMyGames() {
        return this.request('GET', '/games/my');
    }

    async getAllGames(limit = 100) {
        return this.request('GET', `/games/all?limit=${limit}`);
    }

    async deleteGame(gameId) {
        return this.request('DELETE', `/games/${gameId}`);
    }

    // Leaderboard
    async getLeaderboard(filter = 'all') {
        return this.request('GET', `/leaderboard?filter=${filter}`);
    }

    async getUserStats(userId) {
        return this.request('GET', `/leaderboard/stats/${userId}`);
    }

    // Push notifications
    async getVapidKey() {
        return this.request('GET', '/push/vapid-key');
    }

    async subscribePush(subscription) {
        return this.request('POST', '/push/subscribe', { subscription });
    }

    async unsubscribePush() {
        return this.request('POST', '/push/unsubscribe');
    }

    // WebSocket
    connectWebSocket() {
        if (this.ws || !this.token) return;

        const wsUrl = this.baseUrl.replace('http', 'ws').replace('/api', '/ws');
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            // Send ping every 30s to keep alive
            this.wsPingInterval = setInterval(() => {
                if (this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'PING' }));
                }
            }, 30000);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (this.onWsMessage) {
                    this.onWsMessage(msg);
                }
            } catch (err) {
                console.error('WS message parse error:', err);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.ws = null;
            clearInterval(this.wsPingInterval);
            // Reconnect after 5s
            setTimeout(() => this.connectWebSocket(), 5000);
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    }

    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        clearInterval(this.wsPingInterval);
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('bowltrack_token', token);
        } else {
            localStorage.removeItem('bowltrack_token');
        }
    }

    isAuthenticated() {
        return !!this.token;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
}
