# StokManager Vercel Setup Script (PowerShell)
# This script helps set up the project for Vercel deployment

Write-Host "🚀 StokManager - Vercel Deployment Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Check if Vercel CLI is installed
try {
    vercel --version | Out-Null
    Write-Host "✅ Vercel CLI already installed" -ForegroundColor Green
} catch {
    Write-Host "📦 Installing Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
}

# Check if user is logged in to Vercel
Write-Host "🔐 Checking Vercel authentication..." -ForegroundColor Blue
try {
    vercel whoami | Out-Null
    Write-Host "✅ Already logged in to Vercel" -ForegroundColor Green
} catch {
    Write-Host "🔑 Please login to Vercel..." -ForegroundColor Yellow
    vercel login
}

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "⚠️  .env.local not found!" -ForegroundColor Yellow
    Write-Host "📋 Creating .env.local from .env.example..." -ForegroundColor Blue
    Copy-Item ".env.example" ".env.local"
    Write-Host "✏️  Please edit .env.local with your Firebase configuration" -ForegroundColor Yellow
    Write-Host "📖 See VERCEL_DEPLOYMENT.md for required environment variables" -ForegroundColor Blue
} else {
    Write-Host "✅ .env.local found" -ForegroundColor Green
}

# Check if this is a git repository
if (-not (Test-Path ".git")) {
    Write-Host "📁 Initializing git repository..." -ForegroundColor Blue
    git init
    git add .
    git commit -m "Initial commit - Configure for Vercel deployment"
    Write-Host "📤 Please push to GitHub and import in Vercel dashboard" -ForegroundColor Yellow
} else {
    Write-Host "✅ Git repository already initialized" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env.local with your Firebase configuration"
Write-Host "2. Push your code to GitHub"
Write-Host "3. Import repository in Vercel dashboard"
Write-Host "4. Configure environment variables in Vercel"
Write-Host "5. Deploy with: npm run deploy"
Write-Host ""
Write-Host "📖 For detailed instructions, see: VERCEL_DEPLOYMENT.md" -ForegroundColor Blue
Write-Host "🌐 Vercel Dashboard: https://vercel.com/dashboard" -ForegroundColor Blue