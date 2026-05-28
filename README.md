# BS Express Reporting System

## Overview
This is a modern web application for managing and analyzing parcel shipments. It uses React + Tailwind CSS and integrates deeply with Firebase.

## Prerequisites
1. Node.js 18+ installed on your local machine.
2. A Firebase project with standard pay-as-you-go Plan (Blaze or Spark with limits). 

## Setup Instructions

### 1. Firebase Configuration
1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Add a new Web App to your project.
3. Replace the `firebase-applet-config.json` file in the root with your Firebase config or set environment variables.
4. **Enable Authentication**:
   - Go to **Authentication** > **Sign-in method**.
   - Enable **Google Auth**.
5. **Enable Firestore**:
   - Create a Firestore Database in production mode.
   - Deploy `firestore.rules` provided in this repository via Firebase CLI:
     ```bash
     firebase init firestore
     firebase deploy --only firestore:rules
     ```
6. **Enable Storage** (Optional for raw excel storage if implemented):
   - Setup Storage and configure rules similar to Firestore if you are going to store Raw Excel files there.

### 2. Custom Security Rules & Admin Access
The current rule considers the user `bsexpressthailand0@gmail.com` as an `admin`.
```json
// Inside firestore.rules
function isAdmin() { 
  return isSignedIn() && (getUserRole() == 'admin' || request.auth.token.email == 'bsexpressthailand0@gmail.com'); 
}
```
You can grant role 'admin' to other users by adding a document to `/users/{uid}` in Firestore containing `{ "role": "admin" }`.

### 3. Deployments
**To Firebase Hosting:**
1. Install Firebase CLI globally: `npm install -g firebase-tools`
2. Run `firebase login`
3. Run `npm run build`
4. Run `firebase deploy --only hosting`

Ensure your `firebase.json` allows SPA routing:
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Features
- **Dashboard**: Track overall package performance (qty, code, profits, etc).
- **Import Data**: Supports .xlsx, .csv imports up to 10MB chunked into Firestore.
- **Reporting**: Advanced nested reports with grouping, Excel/PDF exporting.
- **Role-based Authentication**: Admin, Staff, and Viewer profiles.
