# 🚀 Vercel Deployment Guide for Firebase Projects

## 📋 Prerequisites

1. **Firebase Project** sudah dibuat dan dikonfigurasi
2. **GitHub Repository** dengan kode aplikasi
3. **Vercel Account** (gratis di [vercel.com](https://vercel.com))

## 🔧 Step-by-Step Deployment

### 1. **Prepare Firebase Configuration**

Kumpulkan semua informasi Firebase dari Firebase Console:

```bash
# Firebase Console → Project Settings → General → Your apps → Web app
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABCDEF123
```

### 2. **Deploy to Vercel**

#### Option A: Via Vercel Dashboard (Recommended)

1. **Import Project**
   - Login ke [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import dari GitHub repository

2. **Configure Project**
   - Framework: Next.js (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

3. **Set Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all Firebase environment variables
   - Set environment untuk: Production, Preview, Development

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to project directory
cd webinvesp32

# Deploy
vercel

# Follow prompts:
# ? Set up and deploy "~/webinvesp32"? [Y/n] Y
# ? Which scope do you want to deploy to? [Your account]
# ? Link to existing project? [y/N] N
# ? What's your project's name? webinvesp32
# ? In which directory is your code located? ./
```

### 3. **Configure Environment Variables**

Via Vercel Dashboard:
1. Go to Project → Settings → Environment Variables
2. Add each variable:

```env
# Required Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project_id-default-rtdb.region.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Production Environment
NODE_ENV=production

# Optional: Firebase Admin SDK (for server-side operations)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your_project_id",...}
```

### 4. **Firebase Admin SDK Setup (Optional)**

For server-side Firebase operations:

1. **Generate Service Account Key**
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download JSON file

2. **Add to Vercel Environment Variables**
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your_project_id",...}
   ```

### 5. **Deploy & Test**

1. **Automatic Deployment**
   - Vercel will automatically build and deploy
   - Check deployment logs for any errors

2. **Test Firebase Connection**
   - Visit your deployed app: `https://your-project.vercel.app`
   - Go to `/pengaturan` page
   - Click "Test Firebase Connection"
   - Verify database operations work

## 🔧 Advanced Configuration

### Custom Domain

```bash
# Via CLI
vercel domains add your-domain.com

# Or via Dashboard: Project Settings → Domains
```

### Environment-Specific Configuration

```bash
# Production only
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production

# Preview only
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY preview

# Development only
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY development
```

### Function Configuration

The `vercel.json` file is already configured with:
- 30-second timeout for API routes
- Optimized for Singapore region (sin1)
- Proper caching headers

## 🐛 Troubleshooting

### Common Issues

1. **Firebase Configuration Error**
   ```bash
   Error: Firebase configuration incomplete
   ```
   **Solution:** Check all environment variables are set correctly

2. **Build Timeout**
   ```bash
   Error: Build exceeded maximum time limit
   ```
   **Solution:** Optimize build process or contact Vercel support

3. **Function Timeout**
   ```bash
   Error: Function execution timed out
   ```
   **Solution:** Increase timeout in `vercel.json` or optimize API routes

### Debug Steps

1. **Check Deployment Logs**
   - Vercel Dashboard → Project → Functions → View Function Logs

2. **Test Locally**
   ```bash
   # Install Vercel CLI
   npm install -g vercel

   # Run local development with production environment
   vercel dev
   ```

3. **Check Firebase Console**
   - Firebase Console → Database → Data
   - Verify database rules allow read/write operations

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Firebase Hosting vs Vercel](https://firebase.google.com/docs/hosting)
- [Environment Variables Guide](https://vercel.com/docs/concepts/projects/environment-variables)

## 🎯 Best Practices

1. **Use Environment Variables** for all sensitive data
2. **Enable Analytics** in Vercel dashboard
3. **Set up Monitoring** for production applications
4. **Use Preview Deployments** for testing
5. **Configure Custom Domain** for production
6. **Enable Edge Functions** for better performance
7. **Monitor Function Usage** to avoid limits

---

**✅ Your Firebase + Next.js app is now ready for production on Vercel!**