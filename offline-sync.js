
/**
 * Offline Sync Manager
 * Handles IndexedDB storage, sync queue, and online/offline detection
 */

class OfflineSyncManager {
    constructor() {
        this.dbName = 'BowlTrackDB';
        this.dbVersion = 1;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.onStatusChange = null;
        this.onSyncComplete = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Games store - local copies of all games
                if (!db.objectStoreNames.contains('games')) {
                    const gameStore = db.createObjectStore('games', { keyPath: 'localId', autoIncrement: true });
                    gameStore.createIndex('userId', 'userId', { unique: false });
                    gameStore.createIndex('synced', 'synced', { unique: false });
                    gameStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Sync queue - pending operations
                if (!db.objectStoreNames.contains('syncQueue')) {
                    db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                }

                // User data - cached user info
                if (!db.objectStoreNames.contains('userData')) {
                    db.createObjectStore('userData', { keyPath: 'key' });
                }

                // Leaderboard cache
                if (!db.objectStoreNames.contains('leaderboard')) {
                    const lbStore = db.createObjectStore('leaderboard', { keyPath: 'id' });
                    lbStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    setupListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.notifyStatus('online');
            this.attemptSync();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.notifyStatus('offline');
        });

        // Listen for messages from service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_GAMES') {
                    this.attemptSync();
                }
            });
        }
    }

    notifyStatus(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    // ===== GAME STORAGE =====

    async saveGame(gameData, userId) {
        const game = {
            ...gameData,
            userId: userId,
            localId: gameData.localId || 'local_' + Date.now(),
            synced: false,
            timestamp: Date.now()
        };

        // Save to IndexedDB
        await this.putInStore('games', game);

        // Add to sync queue
        await this.addToSyncQueue({
            type: 'SAVE_GAME',
            data: game,
            timestamp: Date.now()
        });

        // Try to sync immediately if online
        if (this.isOnline) {
            this.attemptSync();
        } else {
            // Register background sync
            this.registerBackgroundSync();
        }

        return game;
    }

    async getUserGames(userId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['games'], 'readonly');
            const store = transaction.objectStore('games');
            const index = store.index('userId');
            const request = index.getAll(userId);

            request.onsuccess = () => {
                const games = request.result.sort((a, b) => b.timestamp - a.timestamp);
                resolve(games);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllGames() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['games'], 'readonly');
            const store = transaction.objectStore('games');
            const request = store.getAll();

            request.onsuccess = () => {
                const games = request.result.sort((a, b) => b.timestamp - a.timestamp);
                resolve(games);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteUserGames(userId) {
        const games = await this.getUserGames(userId);
        for (const game of games) {
            await this.deleteFromStore('games', game.localId);
        }
    }

    // ===== SYNC QUEUE =====

    async addToSyncQueue(operation) {
        return this.putInStore('syncQueue', operation);
    }

    async getSyncQueue() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearSyncQueue() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async removeFromSyncQueue(id) {
        return this.deleteFromStore('syncQueue', id);
    }

    // ===== SYNC LOGIC =====

    async attemptSync() {
        if (!this.isOnline || this.syncInProgress) return;

        this.syncInProgress = true;
        const queue = await this.getSyncQueue();

        if (queue.length === 0) {
            this.syncInProgress = false;
            return;
        }

        let syncedCount = 0;
        let failedCount = 0;

        for (const operation of queue) {
            try {
                if (operation.type === 'SAVE_GAME') {
                    await this.syncGame(operation.data);
                } else if (operation.type === 'DELETE_ACCOUNT') {
                    await this.syncDeleteAccount(operation.data);
                }
                await this.removeFromSyncQueue(operation.id);
                syncedCount++;
            } catch (err) {
                console.error('Sync failed for operation:', operation, err);
                failedCount++;
            }
        }

        this.syncInProgress = false;

        if (this.onSyncComplete) {
            this.onSyncComplete({ synced: syncedCount, failed: failedCount });
        }

        // If some failed, retry later
        if (failedCount > 0) {
            setTimeout(() => this.attemptSync(), 30000);
        }
    }

    async syncGame(gameData) {
        // This will be called from app.js with the Firebase db instance
        // For now, just mark as synced in local DB
        const updated = { ...gameData, synced: true };
        await this.putInStore('games', updated);
        return updated;
    }

    async syncDeleteAccount(data) {
        // Handled by app.js
        return true;
    }

    registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.sync.register('sync-games').catch((err) => {
                    console.log('Background sync not supported:', err);
                });
            });
        }
    }

    // ===== LEADERBOARD CACHE =====

    async cacheLeaderboard(games) {
        const entry = {
            id: 'latest',
            games: games,
            timestamp: Date.now()
        };
        await this.putInStore('leaderboard', entry);
    }

    async getCachedLeaderboard() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['leaderboard'], 'readonly');
            const store = transaction.objectStore('leaderboard');
            const request = store.get('latest');

            request.onsuccess = () => resolve(request.result?.games || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== USER DATA CACHE =====

    async cacheUserData(key, data) {
        await this.putInStore('userData', { key, data, timestamp: Date.now() });
    }

    async getCachedUserData(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['userData'], 'readonly');
            const store = transaction.objectStore('userData');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== HELPERS =====

    putInStore(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    deleteFromStore(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    getPendingCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineSyncManager;
}
