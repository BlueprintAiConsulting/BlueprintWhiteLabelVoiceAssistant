import { describe, it, expect } from "vitest";
import { GeminiLiveSession } from "../geminiLiveService.ts";

describe("VAD & Turn-Taking Integration Tests", () => {
  it("reports turn states correctly during server messages and barge-in", () => {
    const states: string[] = [];
    let interruptedCalled = false;

    const mockWs: any = {
      readyState: 1, // OPEN
      send: () => {},
      close: () => {}
    };

    const session = new GeminiLiveSession({
      apiKey: "test_key",
      onTurnStateChange: (st) => states.push(st),
      onInterrupted: () => {
        interruptedCalled = true;
      }
    });

    (session as any).ws = mockWs;

    // 1. Simulate setupComplete
    (session as any).handleServerMessage({ setupComplete: {} });
    expect(states).toContain("receptionist_speaking");
    expect(states).toContain("listening");

    // 2. Simulate model audio turn start
    (session as any).handleServerMessage({
      serverContent: {
        modelTurn: {
          parts: [{ text: "Hello! How can I help?" }]
        }
      }
    });
    expect(states[states.length - 1]).toBe("receptionist_speaking");

    // 3. Simulate barge-in interruption
    (session as any).handleServerMessage({
      serverContent: {
        interrupted: true
      }
    });
    expect(interruptedCalled).toBe(true);
    expect(states).toContain("interrupted");
  });

  it("sends turnComplete audio stream end signal on session stop / hang-up", () => {
    const sentMessages: string[] = [];
    const mockWs: any = {
      readyState: 1, // OPEN
      send: (msg: string) => sentMessages.push(msg),
      close: () => {}
    };

    const session = new GeminiLiveSession({ apiKey: "test_key" });
    (session as any).ws = mockWs;

    session.stop();
    expect(sentMessages.some(m => m.includes("turnComplete"))).toBe(true);
  });
});
