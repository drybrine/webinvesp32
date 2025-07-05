#!/bin/bash

# StokManager Vercel Setup Script
# This script helps set up the project for Vercel deployment

echo "🚀 StokManager - Vercel Deployment Setup"
echo "========================================"

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
else
    echo "✅ Vercel CLI already installed"
fi

# Check if user is logged in to Vercel
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "🔑 Please login to Vercel..."
    vercel login
else
    echo "✅ Already logged in to Vercel"
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found!"
    echo "📋 Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo "✏️  Please edit .env.local with your Firebase configuration"
    echo "📖 See VERCEL_DEPLOYMENT.md for required environment variables"
else
    echo "✅ .env.local found"
fi

# Check if this is a git repository
if [ ! -d ".git" ]; then
    echo "📁 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - Configure for Vercel deployment"
    echo "📤 Please push to GitHub and import in Vercel dashboard"
else
    echo "✅ Git repository already initialized"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. Edit .env.local with your Firebase configuration"
echo "2. Push your code to GitHub"
echo "3. Import repository in Vercel dashboard"
echo "4. Configure environment variables in Vercel"
echo "5. Deploy with: npm run deploy"
echo ""
echo "📖 For detailed instructions, see: VERCEL_DEPLOYMENT.md"
echo "🌐 Vercel Dashboard: https://vercel.com/dashboard"