import { describe, it, expect, vi } from "vitest";
import { GeminiLiveSession } from "../geminiLiveService.ts";

describe("Live Voice Call Initial Greeting Tests", () => {
  it("sends exactly one initial greeting trigger per session when setup completes", () => {
    const sentMessages: string[] = [];
    const mockWs: any = {
      readyState: 1, // OPEN
      send: (data: string) => {
        sentMessages.push(data);
      }
    };

    const session = new GeminiLiveSession({ apiKey: "test_api_key_12345" });
    (session as any).ws = mockWs;

    // First trigger call
    session.triggerInitialGreeting();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain("[INBOUND CALL CONNECTED]");

    // Subsequent trigger calls should be ignored
    session.triggerInitialGreeting();
    session.triggerInitialGreeting();
    expect(sentMessages.length).toBe(1);
  });
});
