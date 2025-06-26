# StokManager - ESP32 Inventory Management System

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/bebekpeking99/v0-website-export-request)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Database-Firebase-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

## Overview

StokManager is a real-time inventory management system that integrates ESP32 barcode scanners with a web interface. The system allows for efficient tracking of inventory items through barcode scanning, with real-time updates and monitoring of connected devices.

## Features

- **Real-time Inventory Tracking**: Instantly update inventory as items are scanned
- **ESP32 Integration**: Connect ESP32 devices with barcode scanners for distributed scanning
- **Device Management**: Monitor connected ESP32 devices with status tracking and remote control
- **Dashboard Analytics**: View inventory statistics and device status at a glance
- **Synchronized Settings**: All system settings stored and synchronized with Firebase
- **Automatic Backup**: Schedule and manage data backups
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Firebase Realtime Database
- **Hardware**: ESP32 microcontrollers with barcode scanner modules
- **Real-time Communication**: Firebase Realtime Database for synchronization
- **Deployment**: Vercel with cron jobs for device status monitoring
- **Authentication**: Firebase Authentication

## System Architecture

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  ESP32 with │       │   Firebase  │       │  Next.js    │
│  Barcode    │◄────►│   Realtime  │◄────►│  Web App     │
│  Scanner    │       │   Database  │       │             │
└─────────────┘       └─────────────┘       └─────────────┘
      ▲                                            ▲
      │                                            │
      └────────────── Heartbeats ─────────────────┘
```

- ESP32 devices send heartbeats and scan data to Firebase
- Web app provides real-time monitoring and management interface
- Cron job checks device status and marks offline devices

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm or pnpm
- Firebase account
- ESP32 devices (optional for hardware integration)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/drybrine/webinvesp32.git
cd webinvesp32
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env.local` file with your Firebase configuration:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_DATABASE_URL=your-database-url
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
CRON_SECRET=your-cron-secret
```

4. Run the development server:
```bash
pnpm dev
```

## ESP32 Setup

The esp32_barcode_scanner.cpp file contains the Arduino code for ESP32 devices. To set up:

1. Install Arduino IDE and ESP32 board support
2. Install required libraries:
   - WiFi
   - HTTPClient
   - ArduinoJson
3. Update WiFi credentials and server URL in the code
4. Flash to your ESP32 device with connected barcode scanner

## Deployment

The application is deployed on Vercel with automatic deployments from the GitHub repository. The deployment includes:

- Web application hosting
- API routes for device communication
- Cron job for monitoring device status

## License

MIT
