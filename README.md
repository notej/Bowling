# 🎳 BowlTrack - Full-Stack Bowling Score Tracker

A complete, production-ready bowling score tracking application with a real backend database, real-time updates, offline support, and push notifications.

## ✨ Features

- ✅ **Real Database** - SQLite with proper schema, indexes, and relations
- ✅ **JWT Authentication** - Secure email/password auth with bcrypt
- ✅ **REST API** - Full CRUD for games, users, leaderboard
- ✅ **WebSocket Real-Time** - Live leaderboard updates
- ✅ **Offline Mode** - IndexedDB + sync queue + background sync
- ✅ **Push Notifications** - Web Push API with VAPID keys
- ✅ **OCR Score Scanning** - Tesseract.js for digitizing paper scoresheets
- ✅ **Group Leaderboard** - Global rankings with date filters
- ✅ **Account Deletion** - GDPR-compliant full data removal

## 🏗️ Architecture

```
┌─────────────────┐      WebSocket      ┌─────────────────┐
│   Frontend      │ ◄─────────────────► │   Backend       │
│   (PWA)         │      REST API       │   (Node.js)     │
│                 │ ◄─────────────────► │                 │
│  - HTML/CSS/JS  │                     │  - Express      │
│  - IndexedDB    │                     │  - SQLite       │
│  - Service Worker│                    │  - WebSocket    │
│  - Tesseract.js │                     │  - Web Push     │
└─────────────────┘                     └─────────────────┘
```

## 🚀 Quick Start

### 1. Start the Backend Server

```bash
cd server
npm install
npm start
```

The server will start on `http://localhost:3000` with:
- REST API at `/api`
- WebSocket at `/ws`
- SQLite database at `server/bowltrack.db`

### 2. Open the Frontend

Simply open `index.html` in your browser, or serve it:

```bash
# Option A: Python
python -m http.server 8080

# Option B: Node.js
npx serve .

# Option C: VS Code Live Server
# Just right-click index.html → "Open with Live Server"
```

Then go to `http://localhost:8080`

### 3. Test It Out

1. Register a new account
2. Save a bowling game
3. Open in another browser/incognito with a different account
4. Save a game there - see the leaderboard update in real-time!

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| DELETE | `/api/auth/account` | Delete account |
| POST | `/api/games` | Save a game |
| GET | `/api/games/my` | Get my games |
| GET | `/api/games/all` | Get all games |
| DELETE | `/api/games/:id` | Delete a game |
| GET | `/api/leaderboard` | Get leaderboard |
| GET | `/api/leaderboard/stats/:userId` | Get user stats |
| GET | `/api/push/vapid-key` | Get VAPID public key |
| POST | `/api/push/subscribe` | Subscribe to push |
| POST | `/api/push/unsubscribe` | Unsubscribe |

## 📱 Wrapping as Mobile App

### Option A: Capacitor (Recommended)

```bash
# In the project root
npm install @capacitor/core @capacitor/cli
npx cap init BowlTrack com.yourcompany.bowltrack --web-dir .
npx cap add ios
npx cap add android

# Update capacitor.config.json to point to your API:
# {
#   "server": {
#     "url": "https://your-api.com"
#   }
# }

npx cap open ios  # or android
```

### Option B: Deploy to the Web

Deploy the frontend to Vercel/Netlify and backend to Render/Railway:

**Frontend (Vercel):**
```bash
npm i -g vercel
vercel --prod
```

**Backend (Render):**
1. Push to GitHub
2. Connect Render to your repo
3. Set build command: `cd server && npm install`
4. Set start command: `cd server && npm start`
5. Add environment variables from `.env.example`

## 🔐 Environment Variables

Create `server/.env`:

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-random-string-min-32-chars
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email@example.com
```

Generate VAPID keys:
```bash
cd server
npx web-push generate-vapid-keys
```

## 🗄️ Database Schema

```sql
users
├── id (PK)
├── uid (UUID)
├── display_name
├── email (unique)
├── password_hash (bcrypt)
├── fcm_token
├── best_score
└── created_at

games
├── id (PK)
├── game_id (UUID)
├── user_id (FK → users.uid)
├── user_name
├── total_score
├── frames_json
├── date
├── timestamp
└── created_at

push_subscriptions
├── id (PK)
├── user_id (FK)
├── endpoint
├── p256dh
├── auth
└── created_at
```

## 🌐 Offline Behavior

| Scenario | What Happens |
|----------|-------------|
| Online | Games save to API + IndexedDB cache |
| Offline | Games save to IndexedDB + sync queue |
| Reconnect | Auto-sync via Background Sync API |
| View leaderboard | Shows cached data, refreshes when online |
| App closed offline | Data persists, syncs on next open |

## 🔔 Push Notifications

1. User enables notifications in Profile
2. Browser subscribes via Push API with VAPID key
3. Subscription stored in database
4. When someone beats their personal best, server sends push to all other subscribers
5. Service Worker displays notification even if app is closed

## 🛠️ Tech Stack

**Frontend:**
- Vanilla HTML/CSS/JS
- Chart.js for analytics
- Tesseract.js for OCR
- IndexedDB for offline storage
- Service Worker + Background Sync
- Web Push API

**Backend:**
- Node.js + Express
- SQLite3 database
- bcryptjs for password hashing
- jsonwebtoken for JWT auth
- ws for WebSockets
- web-push for notifications

## 📄 License

MIT License - Free to use and modify.

---

**Built with 🎳 for bowlers everywhere**
