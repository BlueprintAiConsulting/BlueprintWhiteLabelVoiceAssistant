---
name: firebase-serverless-ops
description: Rules and guidelines for Firestore collection structuring, secure Security Rules, and high-performance Cloud Functions (cold starts, configuration).
version: 1.0.0
user-invocable: true
allowed-tools:
  - Bash(*)
---
# Firebase & Serverless Operations Guide

This skill provides design guidelines, security patterns, and performance optimizations for projects utilizing Google Firebase (Firestore, Cloud Functions, and Firebase Auth).

---

## 1. Firestore Data Modeling & Query Design

Firestore is a document-oriented NoSQL database. Structuring data correctly prevents query limitations, expensive document reads, and performance bottlenecks.

### 1.1 Root Collections vs. Sub-collections
- **Use Sub-collections** when documents belong logically to a parent (e.g. `users/{userId}/activities/{activityId}`). This automatically isolates user data, simplifies security rules, and allows collection group queries if cross-user analysis is needed.
- **Use Root Collections** when documents need to be searched independently of any single parent (e.g. global `properties` or `leads`).

### 1.2 Denormalization vs. References
Firestore has no JOINs. Denormalize data that is read frequently but changes rarely:
- **Normalize (References)**: Save a `userId` inside a `lead` document instead of the entire user object.
- **Denormalize (Duplicate)**: Save the user's name inside a `lead` document if it is always displayed next to the lead info, to avoid fetching the user document separately. When the name changes, update both documents.

### 1.3 Firestore Anti-Patterns
- **Frequent writes on a single document**: Do not write to a single document more than 1 time per second (e.g. global counters). Use **Distributed Counters** if high-frequency writes are needed.
- **Deeply nested maps**: Avoid massive map fields inside documents; split them into sub-collections once they grow dynamically to prevent hitting the 1MB document size limit.

---

## 2. Secure Security Rules Patterns

Never ship open security rules (`allow read, write: if true;`). Rules must validate authentication, resource ownership, and data schemas.

### 2.1 Standard Secure Boilerplate (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Checks if the user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Checks if the logged-in user matches the document ID
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // User Profile Rules
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
    }

    // User Sub-collection Rules (Isolated activities)
    match /users/{userId}/activities/{activityId} {
      allow read, write: if isOwner(userId);
    }

    // Global Collections (e.g., Leads)
    match /leads/{leadId} {
      // Allowed to create a lead even if unauthenticated (e.g., from landing page form)
      allow create: if true;
      // Only authenticated team members can read or edit leads
      allow read, update, delete: if isAuthenticated() && request.auth.token.admin == true;
    }
  }
}
```

---

## 3. High-Performance Cloud Functions

Cloud Functions are serverless blocks of code. Poorly optimized functions suffer from long response latencies (cold starts) and resource limits.

### 3.1 Cold Start Optimization
Cold starts occur when a function instance spins up for the first time. Minimize cold start time by:
- **Initializing clients globally** (outside the request handler) so they are reused across warm instances.
- **Lazy importing** libraries that are only needed in specific routes.

```javascript
// GOOD: Global initialization
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.getWeather = async (req, res) => {
  // Use the pre-initialized db instance
  const snapshot = await db.collection('weather').get();
  res.status(200).send(snapshot.docs.map(doc => doc.data()));
};
```

### 3.2 Secret Management
Never hardcode API keys, service accounts, or database passwords in source code. Use **Google Cloud Secret Manager** and load them into functions securely.

```javascript
// Deploying secrets: firebase functions:secrets:set STRIPE_API_KEY="sk_live_..."
const { onRequest } = require("firebase-functions/v2/https");

exports.processPayment = onRequest(
  { secrets: ["STRIPE_API_KEY"] }, // Secret is exposed via process.env.STRIPE_API_KEY
  async (req, res) => {
    const stripe = require('stripe')(process.env.STRIPE_API_KEY);
    // Process payment...
  }
);
```

### 3.3 CORS & Timeout Configuration
Configure functions with explicit runtime limits to control execution cost and prevent infinite loops:

```javascript
const { onRequest } = require("firebase-functions/v2/https");

exports.heavyCalculation = onRequest(
  {
    timeoutSeconds: 60, // Limit function execution time (max 540)
    memory: "1GiB",     // Default is 256MiB. Max 32GiB. Adjust based on load.
    cors: ["https://yourdomain.com"] // Restrict API to your front-end origin
  },
  async (req, res) => {
    // Logic here
  }
);
```

---

## 4. Pre-Delivery Checklist

Before deploying Firestore structures and serverless functions, verify:
- [ ] No collections have `allow read, write: if true;` rules.
- [ ] Document write frequency is designed to stay under 1 write/sec per document.
- [ ] Large array or map fields are evaluated to ensure they don't exceed the 1MB document size limit.
- [ ] Database initializations (SDK connections, configurations) occur outside request handlers.
- [ ] All third-party API keys are loaded via Secret Manager, not `.env` or source code files.
- [ ] Functions have correct memory limits (e.g. visualizers/PDF generators might need 1GiB or 2GiB, simple API CRUD needs 256MiB).
- [ ] CORS is restricted to your production and development environments.
