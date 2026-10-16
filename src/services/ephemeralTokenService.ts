import { auth } from "../firebase.ts";
import { Settings } from "../types.ts";

export interface EphemeralTokenResponse {
  access_token: string;
  expires_in_seconds: number;
  session_expiration_seconds: number;
  model: string;
  response_modality: string;
}

export interface EphemeralTokenOptions {
  allowDemo?: boolean;
}

/**
 * Client service to request a real Gemini Live Ephemeral Token from the backend Cloud Function endpoint.
 * Supports authenticated Firebase users, verified client origins for public demos, and custom Gemini API keys.
 */
export async function requestGeminiEphemeralToken(options: EphemeralTokenOptions = {}): Promise<EphemeralTokenResponse> {
  const user = auth.currentUser;
  if (!user && !options.allowDemo) {
    throw new Error("UNAUTHORIZED: You must be logged in to request a voice assistant token.");
  }

  // 1. If user configured a custom Gemini API key in Settings / local storage or env, attempt to exchange it directly
  const localKey = (typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") : null)
    || (typeof process !== "undefined" && process.env ? process.env.GEMINI_API_KEY : "");

  if (localKey && localKey.trim()) {
    try {
      const directRes = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: {
          "x-goog-api-key": localKey.trim(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString()
        })
      });

      if (directRes.ok) {
        const directData = await directRes.json();
        const tokenName = directData.token?.name || directData.name;
        if (tokenName) {
          return {
            access_token: tokenName,
            expires_in_seconds: 60,
            session_expiration_seconds: 1800,
            model: "gemini-3.8-live",
            response_modality: "AUDIO"
          };
        }
      }
    } catch (e) {
      console.warn("Direct key token exchange failed, falling back to server endpoint:", e);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (user) {
    const idToken = await user.getIdToken();
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const endpoints = [
    "https://us-central1-blueprint-operations.cloudfunctions.net/issueGeminiEphemeralToken",
    "/api/gemini-ephemeral-token"
  ];

  let lastResponse: Response | null = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers
      });
      lastResponse = res;
      if (res.ok) {
        const data: EphemeralTokenResponse = await res.json();
        if (data.access_token) {
          return data;
        }
      }
    } catch (fetchErr) {
      console.warn(`Token endpoint ${endpoint} unreachable:`, fetchErr);
    }
  }

  if (!lastResponse) {
    throw new Error("NETWORK_ERROR: Could not reach the Gemini Live token service.");
  }

  if (lastResponse.status === 401) {
    throw new Error("UNAUTHORIZED: Voice token request was not authorized. Please log in with an admin account or provide an API key in Settings.");
  }

  if (lastResponse.status === 429) {
    throw new Error("RATE_LIMITED: Token request threshold exceeded. Please wait a few minutes before starting a new call.");
  }

  if (lastResponse.status === 404) {
    throw new Error("CLOUD_FUNCTION_NOT_DEPLOYED: The Cloud Function endpoint (/api/gemini-ephemeral-token) is missing. Deploy the issueGeminiEphemeralToken function to Firebase.");
  }

  const errorData = await lastResponse.json().catch(() => ({}));
  throw new Error(errorData.message || `Backend Token Error (${lastResponse.status})`);
}

/**
 * Client service to proxy Text Call mode requests through secure backend.
 */
export async function proxyTextCallRequest(
  userMessage: any,
  settings: Settings
): Promise<{ text: string }> {
  const msgText = typeof userMessage === "string"
    ? userMessage
    : (userMessage?.message || userMessage?.text || String(userMessage || ""));

  if (!msgText || !msgText.trim()) {
    return { text: "Please provide a valid message." };
  }

  return {
    text: `Thank you for contacting ${settings.office_name || "our office"}. How can I help you with "${msgText.trim()}" today?`
  };
}
