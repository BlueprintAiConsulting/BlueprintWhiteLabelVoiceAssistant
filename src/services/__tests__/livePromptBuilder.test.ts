import { describe, it, expect } from "vitest";
import { buildDynamicSystemPrompt } from "../livePromptBuilder.ts";
import { Settings } from "../../types.ts";

const baseSettings: Settings = {
  office_name: "Apex Heating & Air",
  business_hours: { start: "08:00", end: "18:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
  timezone: "America/Chicago",
  service_areas: ["Dallas", "Fort Worth", "Plano"],
  transfer_enabled: true,
  transfer_phone_number: "+12145550199",
  on_call_technician_phone: "+12145550199",
  after_hours_message: "Apex Air is closed. Call back tomorrow.",
  emergency_keywords: ["gas leak", "carbon monoxide", "freon leak"],
  receptionist_voice_style: "enthusiastic and professional",
  prompt_overrides: "Always mention our free maintenance inspection with every estimate."
};

describe("Live System Prompt Builder Tests", () => {
  it("builds a dynamic prompt containing active Firestore Settings profile", () => {
    const prompt = buildDynamicSystemPrompt({ settings: baseSettings, currentDateStr: "2026-08-03" });

    expect(prompt).toContain("Apex Heating & Air");
    expect(prompt).toContain("Today's Date: 2026-08-03");
    expect(prompt).toContain("America/Chicago");
    expect(prompt).toContain("08:00 to 18:00");
    expect(prompt).toContain("Dallas, Fort Worth, Plano");
    expect(prompt).toContain("gas leak, carbon monoxide, freon leak");
    expect(prompt).toContain("Apex Air is closed.");
    expect(prompt).toContain("enthusiastic and professional");
    expect(prompt).toContain("Always mention our free maintenance inspection with every estimate.");
    expect(prompt).toContain('Josh');
    expect(prompt).toContain("Caller requests Josh, the business owner");
  });

  it("recognizes owner requests as a distinct call path", () => {
    const prompt = buildDynamicSystemPrompt({ settings: baseSettings, currentDateStr: "2026-08-03" });

    expect(prompt).toContain("OWNER & MANAGER CALL HANDLING");
    expect(prompt).toContain("Leave target_number empty");
    expect(prompt).toContain("Never disclose Josh's private phone number");
  });

  it("updates generated system prompt when Settings change", () => {
    const customSettings: Settings = {
      ...baseSettings,
      office_name: "Metro Climate Systems",
      timezone: "America/Los_Angeles",
      service_areas: ["Los Angeles", "Pasadena"],
      prompt_overrides: "Mention our 10% senior discount."
    };

    const prompt = buildDynamicSystemPrompt({ settings: customSettings, currentDateStr: "2026-08-03" });

    expect(prompt).toContain("Metro Climate Systems");
    expect(prompt).toContain("America/Los_Angeles");
    expect(prompt).toContain("Los Angeles, Pasadena");
    expect(prompt).toContain("Mention our 10% senior discount.");
    expect(prompt).not.toContain("Apex Heating & Air");
  });
});
