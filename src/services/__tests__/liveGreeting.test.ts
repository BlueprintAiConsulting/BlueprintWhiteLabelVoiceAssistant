import { describe, it, expect } from "vitest";
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

  it("introduces as Spring Valley Roofing in roofing voice mode even if prior settings had Lunar Heating", () => {
    const sentMessages: string[] = [];
    const mockWs: any = {
      readyState: 1,
      send: (data: string) => {
        sentMessages.push(data);
      }
    };

    const session = new GeminiLiveSession({
      apiKey: "test_api_key_12345",
      personaName: "Megan",
      settings: {
        industry: "roofing_siding",
        office_name: "Lunar Heating and Cooling",
        receptionist_name: "Megan"
      } as any
    });
    (session as any).ws = mockWs;

    session.triggerInitialGreeting();

    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0]);
    const greetingText = parsed.realtimeInput.text;

    expect(greetingText).toContain("Spring Valley Roofing");
    expect(greetingText).toContain("Thanks for calling Spring Valley Roofing, this is Megan. How can I help you today?");
    expect(greetingText).not.toContain("Lunar Heating");
    expect(greetingText).not.toContain("Apex");
  });

  it("introduces with custom or default HVAC name when in HVAC mode", () => {
    const sentMessages: string[] = [];
    const mockWs: any = {
      readyState: 1,
      send: (data: string) => {
        sentMessages.push(data);
      }
    };

    const session = new GeminiLiveSession({
      apiKey: "test_api_key_12345",
      personaName: "Megan",
      settings: {
        industry: "hvac",
        office_name: "Lunar Heating and Cooling",
        receptionist_name: "Megan"
      } as any
    });
    (session as any).ws = mockWs;

    session.triggerInitialGreeting();

    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0]);
    const greetingText = parsed.realtimeInput.text;

    expect(greetingText).toContain("Lunar Heating and Cooling");
    expect(greetingText).toContain("Thanks for calling Lunar Heating and Cooling, this is Megan. How can I help you today?");
  });
});
