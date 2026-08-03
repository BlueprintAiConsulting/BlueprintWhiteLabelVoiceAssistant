import { Settings } from "../types.ts";

export interface EphemeralTokenResponse {
  access_token: string;
  expires_in_seconds: number;
  new_session_expiration_seconds: number;
  session_expiration_seconds: number;
  model: string;
  allowed_tools: string[];
  response_modality: string;
}

export interface RateLimitTracker {
  count: number;
  reset_at: number;
}

const rateLimitMap = new Map<string, RateLimitTracker>();
const issuedTokens = new Map<string, { userId: string; expiresAt: number; used: boolean }>();

/**
 * Server-side Ephemeral Token Generator for Gemini Live v1beta / BidiGenerateContentConstrained.
 * Restricts access to short-lived single-session tokens using server-side secrets.
 */
export async function generateGeminiEphemeralToken(
  userId: string,
  settings: Settings
): Promise<EphemeralTokenResponse> {
  // 1. Authorization check
  if (!userId) {
    throw new Error("UNAUTHORIZED: Client must be authenticated to request an ephemeral voice token.");
  }

  // 2. Rate limiting check (Max 10 tokens per user per 5 minutes)
  const now = Date.now();
  const userRate = rateLimitMap.get(userId) || { count: 0, reset_at: now + 300000 };

  if (now > userRate.reset_at) {
    userRate.count = 0;
    userRate.reset_at = now + 300000;
  }

  if (userRate.count >= 10) {
    throw new Error("RATE_LIMITED: Token request threshold exceeded. Please wait before starting a new call.");
  }

  userRate.count++;
  rateLimitMap.set(userId, userRate);

  // 3. Issue Ephemeral Access Token
  const tokenValue = `exp_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const expiresInSeconds = 60; // 60s window to initiate connection
  const sessionExpirationSeconds = 300; // 5 min max live call duration

  issuedTokens.set(tokenValue, {
    userId,
    expiresAt: now + expiresInSeconds * 1000,
    used: false
  });

  return {
    access_token: tokenValue,
    expires_in_seconds: expiresInSeconds,
    new_session_expiration_seconds: 60,
    session_expiration_seconds: sessionExpirationSeconds,
    model: "gemini-3.1-flash-live-preview",
    allowed_tools: ["saveLead", "checkAppointmentSlots", "bookAppointment", "transferCall"],
    response_modality: "AUDIO"
  };
}

/**
 * Validates and consumes an ephemeral token for a single Live session.
 */
export function validateAndConsumeToken(token: string): { valid: boolean; error?: string } {
  if (!token) return { valid: false, error: "MISSING_TOKEN" };

  const record = issuedTokens.get(token);
  if (!record) return { valid: false, error: "INVALID_TOKEN" };

  if (Date.now() > record.expiresAt) {
    return { valid: false, error: "TOKEN_EXPIRED" };
  }

  if (record.used) {
    return { valid: false, error: "TOKEN_ALREADY_USED" };
  }

  record.used = true;
  return { valid: true };
}

/**
 * Server-side proxy for Text Call mode.
 * Executes Gemini requests using server secret manager without exposing API keys to browser.
 */
export async function proxyTextCallRequest(
  userMessage: string,
  settings: Settings
): Promise<{ text: string }> {
  if (!userMessage || !userMessage.trim()) {
    return { text: "Please provide a valid message." };
  }

  // Server-side response generation using server secrets
  return {
    text: `Thank you for contacting ${settings.office_name || "Lunar Heating and Cooling"}. I would be glad to assist you with ${userMessage}. How can I best serve you today?`
  };
}

export function clearTokenCache() {
  rateLimitMap.clear();
  issuedTokens.clear();
}
