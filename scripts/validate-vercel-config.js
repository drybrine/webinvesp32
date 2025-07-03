#!/usr/bin/env node

/**
 * Vercel Deployment Validation Script
 * Validates Firebase configuration for Vercel deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Vercel deployment configuration...\n');

// Check if vercel.json exists
const vercelConfigPath = path.join(__dirname, '..', 'vercel.json');
if (!fs.existsSync(vercelConfigPath)) {
  console.error('❌ vercel.json not found!');
  process.exit(1);
}

// Read vercel.json
const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

// Required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

console.log('✅ vercel.json found');

// Check environment variables configuration
if (!vercelConfig.env) {
  console.error('❌ No environment variables configured in vercel.json');
  process.exit(1);
}

console.log('✅ Environment variables section found');

// Check required Firebase environment variables
const missingVars = requiredEnvVars.filter(envVar => !vercelConfig.env[envVar]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables in vercel.json:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
}

console.log('✅ All required Firebase environment variables configured');

// Check framework configuration
if (vercelConfig.framework !== 'nextjs') {
  console.warn('⚠️  Framework not set to "nextjs" in vercel.json');
}

console.log('✅ Framework configuration looks good');

// Check functions configuration
if (!vercelConfig.functions) {
  console.warn('⚠️  No functions configuration found in vercel.json');
} else {
  console.log('✅ Functions configuration found');
}

// Check build configuration
if (!vercelConfig.buildCommand) {
  console.warn('⚠️  No build command specified in vercel.json');
} else if (vercelConfig.buildCommand !== 'npm run build') {
  console.warn('⚠️  Build command is not "npm run build"');
} else {
  console.log('✅ Build command configured correctly');
}

// Check .env.vercel template
const envVercelPath = path.join(__dirname, '..', '.env.vercel');
if (!fs.existsSync(envVercelPath)) {
  console.warn('⚠️  .env.vercel template not found');
} else {
  console.log('✅ .env.vercel template found');
}

// Check VERCEL_DEPLOYMENT.md
const deploymentGuidePath = path.join(__dirname, '..', 'VERCEL_DEPLOYMENT.md');
if (!fs.existsSync(deploymentGuidePath)) {
  console.warn('⚠️  VERCEL_DEPLOYMENT.md guide not found');
} else {
  console.log('✅ Deployment guide found');
}

console.log('\n🎉 Vercel deployment configuration validation complete!');
console.log('\n📝 Next steps:');
console.log('1. Deploy to Vercel using the dashboard or CLI');
console.log('2. Set environment variables in Vercel project settings');
console.log('3. Use the values from your Firebase Console');
console.log('4. Test the deployment');
console.log('\n💡 For detailed instructions, see VERCEL_DEPLOYMENT.md');