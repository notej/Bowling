# 🚀 BowlTrack Deployment Guide (For Beginners)

## 🎯 The Easiest Option: Run on Your Computer First

Before deploying online, test everything works locally:

```bash
# 1. Open terminal/command prompt
# 2. Navigate to the bowling-app folder
cd bowling-app

# 3. Start the server
cd server
npm install
npm start

# 4. Open your browser to:
# http://localhost:3000
```

That's it! The app is running on YOUR computer. Other people on your WiFi can access it by going to your computer's IP address.

---

## 🌐 Deploy Online (Choose ONE)

### Option A: Render.com ⭐ EASIEST & FREE

**Cost:** $0 (free tier) | **Difficulty:** ⭐ (Very Easy)

**Step 1: Create a GitHub Account**
1. Go to https://github.com/signup
2. Sign up with your email (free)
3. Verify your email

**Step 2: Upload BowlTrack to GitHub**
1. On GitHub, click the **green "New"** button (top left)
2. Name it `bowltrack`
3. Click **"Create repository"**
4. You'll see instructions. Run these commands in your terminal:

```bash
cd bowling-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bowltrack.git
git push -u origin main
```

**Step 3: Deploy on Render**
1. Go to https://render.com and sign up with GitHub (click "Sign up with GitHub")
2. Click **"New +"** → **"Web Service"**
3. Find and select your `bowltrack` repo
4. Render will auto-fill everything from `render.yaml`!
5. Click **"Create Web Service"**
6. Wait 2-3 minutes for deployment
7. Click the URL (looks like `https://bowltrack-api.onrender.com`)
8. **DONE!** Your app is live on the internet!

---

### Option B: Railway.app 🚂 FREE

**Cost:** $0 (free tier, no credit card) | **Difficulty:** ⭐⭐ (Easy)

**Step 1: Same as above** — Push to GitHub first

**Step 2: Deploy on Railway**
1. Go to https://railway.app and sign up with GitHub
2. Click **"New Project"**
3. Click **"Deploy from GitHub repo"**
4. Select your `bowltrack` repo
5. Railway auto-detects the `Dockerfile` and deploys!
6. Click the generated URL
7. **DONE!**

---

### Option C: Docker (Run Anywhere) 🐳

**Cost:** $0 | **Difficulty:** ⭐⭐⭐ (Medium)

If you have Docker installed:

```bash
cd bowling-app
docker-compose up
```

Then open http://localhost:3000

To deploy Docker online:
- **Fly.io**: https://fly.io (free tier, $0)
- **Google Cloud Run**: https://cloud.google.com/run (free tier)

---

## 📊 Free Tier Comparison

| Platform | Free? | Sleep? | Database | Best For |
|----------|-------|--------|----------|----------|
| **Render** | ✅ Yes | Sleeps after 15min idle | SQLite (included) | Beginners |
| **Railway** | ✅ Yes | No sleep | SQLite (included) | Always-on apps |
| **Fly.io** | ✅ Yes | No sleep | SQLite (included) | Global CDN |
| **Vercel** | ✅ Yes | No sleep | ❌ No backend | Frontend only |

> "Sleep" means the server shuts down after inactivity and takes 30 seconds to wake up on the next request. This is fine for a bowling app!

---

## 🔧 After Deploying: Update Frontend API URL

Once your backend is live, you need to tell the frontend where to find it.

1. Open `js/api-client.js`
2. Find this line:
```javascript
this.baseUrl = this.detectApiUrl();
```
3. Replace the `detectApiUrl()` function with your deployed URL:
```javascript
this.baseUrl = 'https://your-app-name.onrender.com/api';
```
4. Commit and push:
```bash
git add .
git commit -m "Update API URL"
git push
```

Render will auto-redeploy with the new URL!

---

## 🆘 Troubleshooting

**"npm install fails"**
→ Make sure you have Node.js installed: https://nodejs.org (download LTS version)

**"Port 3000 already in use"**
→ Change the port: `PORT=3001 npm start`

**"Cannot connect to API from phone"**
→ Make sure your phone is on the same WiFi. Use your computer's local IP (find it with `ipconfig` on Windows or `ifconfig` on Mac).

**"Render deployment failed"**
→ Check the logs on Render dashboard. Usually it's because `npm install` failed.

---

## 📱 Making It a Mobile App (After Deploying)

Once your app is live online:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init BowlTrack com.yourcompany.bowltrack --web-dir .

# Update capacitor.config.json:
# {
#   "appId": "com.yourcompany.bowltrack",
#   "appName": "BowlTrack",
#   "webDir": ".",
#   "server": {
#     "url": "https://your-app.onrender.com"
#   }
# }

npx cap add android
npx cap open android
# Build APK in Android Studio
```

---

**Questions?** The `README.md` has technical details. This guide is the beginner version!
