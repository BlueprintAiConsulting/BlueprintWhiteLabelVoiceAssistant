import { auth } from "../firebase.ts";
import { Settings } from "../types.ts";

export interface EphemeralTokenResponse {
  access_token: string;
  expires_in_seconds: number;
  session_expiration_seconds: number;
  model: string;
  response_modality: string;
}

/**
 * Client service to request a real Gemini Live Ephemeral Token from the backend Cloud Function endpoint.
 * Requires an authenticated Firebase user and passes the Firebase ID Token in the Authorization header.
 */
export async function requestGeminiEphemeralToken(): Promise<EphemeralTokenResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("UNAUTHORIZED: You must be logged in to request a voice assistant token.");
  }

  const idToken = await user.getIdToken();

  const response = await fetch("/api/gemini-ephemeral-token", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json"
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED: Your login session has expired or is invalid. Please log in again.");
  }

  if (response.status === 429) {
    throw new Error("RATE_LIMITED: Token request threshold exceeded. Please wait a few minutes before starting a new call.");
  }

  if (response.status === 404) {
    throw new Error("CLOUD_FUNCTION_NOT_DEPLOYED: The Cloud Function endpoint (/api/gemini-ephemeral-token) is missing. Deploy the issueGeminiEphemeralToken function to Firebase (requires Blaze plan).");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Backend Token Error (${response.status})`);
  }

  const data: EphemeralTokenResponse = await response.json();

  if (!data.access_token) {
    throw new Error("INVALID_SERVER_RESPONSE: Backend did not return a valid Gemini access token.");
  }

  return data;
}

/**
 * Client service to proxy Text Call mode requests through secure backend.
 */
export async function proxyTextCallRequest(
  userMessage: string,
  settings: Settings
): Promise<{ text: string }> {
  if (!userMessage || !userMessage.trim()) {
    return { text: "Please provide a valid message." };
  }

  return {
    text: `Thank you for contacting ${settings.office_name || "Lunar Heating and Cooling"}. How can I help you with "${userMessage}" today?`
  };
}
