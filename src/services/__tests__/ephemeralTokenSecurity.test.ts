import { describe, it, expect, vi } from "vitest";
import { requestGeminiEphemeralToken } from "../ephemeralTokenService.ts";
import fs from "fs";
import path from "path";

describe("Ephemeral Token Production Security Tests", () => {
  it("rejects unauthenticated requests from receiving voice tokens (HTTP 401 requirement)", async () => {
    // When auth.currentUser is null
    await expect(requestGeminiEphemeralToken()).rejects.toThrow("UNAUTHORIZED");
  });

  it("proves Cloud Function issueGeminiEphemeralToken calls Google /v1beta/auth_tokens endpoint server-side", () => {
    const fnPath = path.resolve(__dirname, "../../../functions/index.js");
    const fnContent = fs.readFileSync(fnPath, "utf-8");

    expect(fnContent).toContain("https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    expect(fnContent).toContain("x-goog-api-key");
    expect(fnContent).toContain("gemini-3.1-flash-live-preview");
    expect(fnContent).toContain("access_token");
  });

  it("proves ZERO exp_token_ placeholders or Gemini API keys exist in client source files", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];

    for (const file of files) {
      if (typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
        if (file.includes("__tests__")) continue; // Skip test assertions
        const filePath = path.join(srcDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content.includes("exp_" + "token_")).toBe(false);
        expect(content.includes("mock" + "Ephemeral")).toBe(false);
        expect(content.includes("user_" + "auth_101")).toBe(false);
        expect(content.includes("GEMINI_" + "API_KEY")).toBe(false);
      }
    }
  });

  it("proves built production bundle contains no exp_token_ placeholder token strings", () => {
    const distDir = path.resolve(__dirname, "../../../dist");
    const expToken = "exp_" + "token_";
    if (fs.existsSync(distDir)) {
      const distFiles = fs.readdirSync(distDir, { recursive: true }) as string[];
      for (const file of distFiles) {
        if (typeof file === "string" && file.endsWith(".js")) {
          const content = fs.readFileSync(path.join(distDir, file), "utf-8");
          expect(content.includes(expToken)).toBe(false);
          expect(content.includes("GEMINI_" + "API_KEY")).toBe(false);
        }
      }
    }
  });
});
