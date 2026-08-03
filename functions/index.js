const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Simple in-memory rate limiting per UID
const userRateLimits = new Map();

exports.issueGeminiEphemeralToken = onRequest(
  { secrets: [geminiApiKey], cors: true },
  async (req, res) => {
    // Enable CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // 1. Verify Authorization Bearer Token
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid Bearer Authorization token." });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (authErr) {
        res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired Firebase ID token." });
        return;
      }

      const uid = decodedToken.uid;

      // 2. Rate limiting check (Max 10 requests per 5 minutes per UID)
      const now = Date.now();
      const userRecord = userRateLimits.get(uid) || { count: 0, resetAt: now + 300000 };

      if (now > userRecord.resetAt) {
        userRecord.count = 0;
        userRecord.resetAt = now + 300000;
      }

      if (userRecord.count >= 10) {
        res.status(429).json({ error: "RATE_LIMITED", message: "Too many token requests. Please try again later." });
        return;
      }

      userRecord.count++;
      userRateLimits.set(uid, userRecord);

      // 3. Request real Gemini Ephemeral Token from Google API
      const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "SERVER_CONFIG_ERROR", message: "GEMINI_API_KEY secret is not set on server." });
        return;
      }

      const payload = {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString()
      };

      const googleResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google Auth Tokens Endpoint Error:", googleResponse.status, errorText);
        res.status(502).json({
          error: "GOOGLE_API_ERROR",
          message: "Google rejected the ephemeral-token request. Check the Gemini API key, API access, and token payload configuration."
        });
        return;
      }

      const data = await googleResponse.json();
      const tokenName = data.token?.name || data.name || "";

      if (!tokenName) {
        res.status(500).json({ error: "INVALID_GOOGLE_RESPONSE", message: "Google API did not return a valid token name." });
        return;
      }

      // 4. Return normalized response
      res.status(200).json({
        access_token: tokenName,
        expires_in_seconds: 60,
        session_expiration_seconds: 1800,
        model: "gemini-3.1-flash-live-preview",
        response_modality: "AUDIO"
      });
    } catch (err) {
      console.error("Internal Server Error in issueGeminiEphemeralToken:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: err.message || "An unexpected error occurred." });
    }
  }
);
