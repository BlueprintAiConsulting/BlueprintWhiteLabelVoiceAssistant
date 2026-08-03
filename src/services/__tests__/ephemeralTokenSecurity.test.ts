import { describe, it, expect, beforeEach } from "vitest";
import {
  generateGeminiEphemeralToken,
  validateAndConsumeToken,
  clearTokenCache
} from "../ephemeralTokenService.ts";
import { Settings } from "../../types.ts";
import fs from "fs";
import path from "path";

const mockSettings: Settings = {
  office_name: "Blueprint HVAC",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["New York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak"],
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("Ephemeral Token Security & Key Protection Tests", () => {
  beforeEach(() => {
    clearTokenCache();
  });

  it("issues short-lived ephemeral token restricted to gemini-3.1-flash-live-preview and AUDIO modality", async () => {
    const tokenRes = await generateGeminiEphemeralToken("user_auth_123", mockSettings);

    expect(tokenRes.access_token).toContain("exp_token_");
    expect(tokenRes.expires_in_seconds).toBe(60);
    expect(tokenRes.session_expiration_seconds).toBe(300);
    expect(tokenRes.model).toBe("gemini-3.1-flash-live-preview");
    expect(tokenRes.response_modality).toBe("AUDIO");
    expect(tokenRes.allowed_tools).toContain("saveLead");
  });

  it("prevents single token from starting unlimited sessions (single-use enforcement)", async () => {
    const tokenRes = await generateGeminiEphemeralToken("user_auth_123", mockSettings);

    const firstUse = validateAndConsumeToken(tokenRes.access_token);
    expect(firstUse.valid).toBe(true);

    const secondUse = validateAndConsumeToken(tokenRes.access_token);
    expect(secondUse.valid).toBe(false);
    expect(secondUse.error).toBe("TOKEN_ALREADY_USED");
  });

  it("rejects unauthorized clients from receiving voice tokens", async () => {
    await expect(generateGeminiEphemeralToken("", mockSettings)).rejects.toThrow("UNAUTHORIZED");
  });

  it("enforces rate limits on token issuance endpoint", async () => {
    for (let i = 0; i < 10; i++) {
      await generateGeminiEphemeralToken("user_spam_check", mockSettings);
    }
    await expect(generateGeminiEphemeralToken("user_spam_check", mockSettings)).rejects.toThrow("RATE_LIMITED");
  });

  it("proves ZERO raw long-lived Gemini API keys exist in client source files", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];

    const keyPattern = /AIzaSy[A-Za-z0-9_-]{33}/;

    for (const file of files) {
      if (typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
        const filePath = path.join(srcDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        expect(keyPattern.test(content)).toBe(false);
      }
    }
  });
});
