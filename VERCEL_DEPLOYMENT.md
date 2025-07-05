# 🚀 Vercel Deployment Guide for StokManager

## 📋 Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Push your code to GitHub
3. **Firebase Project**: Ensure Firebase is properly configured

## 🔧 Environment Variables Setup

### Required Environment Variables for Vercel

Add these environment variables in your Vercel dashboard:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project_id-default-rtdb.region.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Application Settings
NODE_ENV=production
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
```

## 🚀 Deployment Methods

### Method 1: GitHub Integration (Recommended)

1. **Connect Repository**:
   ```bash
   # Push to GitHub first
   git add .
   git commit -m "Configure for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js settings

3. **Configure Environment Variables**:
   - In Vercel dashboard → Project Settings → Environment Variables
   - Add all the environment variables listed above
   - Set them for Production, Preview, and Development environments

4. **Deploy**:
   - Vercel will automatically deploy on every push to main branch
   - Preview deployments for pull requests

### Method 2: Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   # First deployment (will prompt for configuration)
   vercel

   # Production deployment
   npm run deploy
   # or
   vercel --prod

   # Preview deployment
   npm run deploy-preview
   # or
   vercel
   ```

## ⚙️ Vercel Configuration

The project includes optimized `vercel.json` configuration:

- **Framework**: Auto-detected as Next.js
- **Region**: Singapore (sin1) for optimal performance in Asia
- **Functions**: 30-second timeout for API routes
- **Headers**: Security headers and CORS configuration
- **Caching**: Optimized for static assets and service worker

## 🔥 Firebase Integration on Vercel

### Database Rules
Ensure your Firebase Realtime Database rules allow web access:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "devices": {
      ".read": true,
      ".write": true
    },
    "scans": {
      ".read": true,
      ".write": true
    },
    "attendance": {
      ".read": true,
      ".write": true
    }
  }
}
```

### Security Configuration
- All Firebase config variables use `NEXT_PUBLIC_` prefix (safe for client-side)
- API keys are restricted in Firebase Console
- Database rules control access permissions

## 📊 Performance Optimizations

The deployment includes:

- **Image Optimization**: WebP/AVIF formats with 1-year cache
- **Bundle Splitting**: Optimized chunks for faster loading
- **Compression**: Gzip/Brotli compression enabled
- **CDN**: Global edge network via Vercel
- **Service Worker**: PWA capabilities with proper caching

## 🔍 Monitoring & Analytics

### Vercel Analytics
Enable in Vercel dashboard:
- **Web Analytics**: Page views, performance metrics
- **Speed Insights**: Core Web Vitals monitoring
- **Function Logs**: API route debugging

### Firebase Analytics
Already configured with `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

## 🛠️ Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**:
   ```bash
   # Check if variables are set correctly in Vercel dashboard
   # Ensure NEXT_PUBLIC_ prefix for client-side variables
   ```

2. **Firebase Connection Issues**:
   ```bash
   # Verify Firebase project settings
   # Check database URL format
   # Ensure proper CORS configuration
   ```

3. **Build Failures**:
   ```bash
   # Check build logs in Vercel dashboard
   # Verify all dependencies are in package.json
   # Test build locally: npm run build
   ```

4. **API Routes Timeout**:
   ```bash
   # Functions timeout set to 30s in vercel.json
   # Optimize API route performance
   # Consider using Vercel Edge Functions for faster response
   ```

### Debug Commands

```bash
# Test build locally
npm run build
npm run start

# Check environment variables
vercel env ls

# View deployment logs
vercel logs [deployment-url]

# Pull environment variables locally
vercel env pull .env.local
```

## 🔄 Continuous Deployment

### Automatic Deployments
- **Production**: Deploys on push to `main` branch
- **Preview**: Deploys on pull requests
- **Branch Deployments**: Each branch gets a unique URL

### Deployment Hooks
Configure webhooks for:
- Slack/Discord notifications
- Database migrations
- Cache invalidation

## 📱 Domain Configuration

### Custom Domain
1. Go to Vercel dashboard → Project → Domains
2. Add your custom domain
3. Configure DNS records as instructed
4. SSL certificate is automatically provisioned

### Recommended Domains
- `stokmanager.vercel.app` (free Vercel subdomain)
- `your-domain.com` (custom domain)

## 🔐 Security Best Practices

1. **Environment Variables**: Never commit sensitive data
2. **Firebase Rules**: Restrict database access appropriately
3. **API Keys**: Use Firebase API key restrictions
4. **HTTPS**: Enforced by default on Vercel
5. **Headers**: Security headers configured in vercel.json

## 📈 Performance Monitoring

Monitor your deployment:
- **Vercel Analytics**: Built-in performance metrics
- **Firebase Performance**: Real-time performance monitoring
- **Core Web Vitals**: LCP, FID, CLS tracking

## 🎯 Next Steps After Deployment

1. **Test all features**: Barcode scanning, real-time updates
2. **Configure monitoring**: Set up alerts for downtime
3. **Optimize performance**: Monitor Core Web Vitals
4. **Set up backups**: Regular Firebase data exports
5. **Documentation**: Update README with live URLs

---

## 🚀 Quick Deploy Commands

```bash
# One-time setup
npm install -g vercel
vercel login

# Deploy to production
npm run deploy

# Deploy preview
npm run deploy-preview
```

Your StokManager app will be live at: `https://your-project.vercel.app`