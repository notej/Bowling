#!/bin/bash
# BowlTrack Deploy Helper
# This script helps you deploy BowlTrack online

echo "🎳 BowlTrack Deployment Helper"
echo ""

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "✅ Docker found!"
    echo ""
    echo "Option 1: Run locally with Docker (easiest)"
    echo "   docker-compose up"
    echo "   Then open http://localhost:3000"
    echo ""
fi

echo "Option 2: Deploy to Render.com (free, recommended)"
echo "   1. Push this folder to GitHub"
echo "   2. Go to https://render.com and sign up (free)"
echo "   3. Click 'New +' → 'Web Service'"
echo "   4. Connect your GitHub repo"
echo "   5. Render will auto-detect render.yaml and deploy!"
echo ""

echo "Option 3: Deploy to Railway (free)"
echo "   1. Go to https://railway.app and sign up (free)"
echo "   2. Click 'New Project' → 'Deploy from GitHub repo'"
echo "   3. Select your repo"
echo "   4. Railway auto-detects Dockerfile and deploys!"
echo ""

echo "📖 Full instructions in README.md"
