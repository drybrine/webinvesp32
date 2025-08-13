#!/bin/bash

# Vercel Environment Variables Setup Script
# Run this after importing project to Vercel

echo "🚀 Setting up environment variables for Vercel deployment..."
echo ""
echo "Copy and paste these commands in Vercel CLI or manually add via Dashboard:"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_API_KEY"
echo "Value: AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "Value: barcodescanesp32.firebaseapp.com"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_DATABASE_URL"
echo "Value: https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "Value: barcodescanesp32"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
echo "Value: barcodescanesp32.firebasestorage.app"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
echo "Value: 330721800882"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_APP_ID"
echo "Value: 1:330721800882:web:f270138ef40229ec2ccfab"
echo ""

echo "vercel env add NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
echo "Value: G-7J89KNJCCT"
echo ""

echo "✅ All environment variables listed above."
echo "💡 Make sure to set them for: Production, Preview, and Development environments"
echo ""
echo "🔗 Alternative: Use Vercel Dashboard at https://vercel.com/dashboard"
echo "   Go to: Project Settings > Environment Variables"
