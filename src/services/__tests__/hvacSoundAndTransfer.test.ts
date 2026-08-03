import { describe, it, expect } from "vitest";
import { analyzeHvacSound } from "../hvacIntelligence.ts";
import { executeLiveToolCall } from "../liveToolDispatcher.ts";
import { Settings } from "../../types.ts";

const MOCK_SETTINGS: Settings = {
  office_name: "Lunar Heating and Cooling",
  receptionist_name: "Sarah",
  business_hours: { start: "08:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["York", "Hanover"],
  transfer_enabled: true,
  transfer_phone_number: "+17175770668",
  after_hours_message: "Closed",
  emergency_keywords: ["gas leak", "no heat"],
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("HVAC Acoustic Sound Diagnostic Engine", () => {
  it("correctly diagnoses high-pitched screeching blower belt sound", () => {
    const result = analyzeHvacSound("My furnace is making a high-pitched screeching sound when starting");
    expect(result.sound_type).toBe("high_pitched_squeal");
    expect(result.probable_cause).toContain("blower fan belt");
    expect(result.severity).toBe("warning");
  });

  it("correctly diagnoses refrigerant hissing leak with critical severity", () => {
    const result = analyzeHvacSound("There is a loud hissing and sizzling noise coming from the outdoor AC unit");
    expect(result.sound_type).toBe("hissing_leak");
    expect(result.severity).toBe("critical");
    expect(result.recommended_action).toContain("Turn system OFF immediately");
  });

  it("executes diagnoseHvacSound tool call via liveToolDispatcher", async () => {
    let captured: any = null;
    const res = await executeLiveToolCall(
      {
        id: "call_123",
        name: "diagnoseHvacSound",
        args: { sound_characteristics: "rattling and clanking in furnace fan housing" }
      },
      MOCK_SETTINGS,
      (lead) => { captured = lead; }
    );

    expect(res.output.success).toBe(true);
    expect(res.output.sound_type).toBe("metallic_rattling");
    expect(captured?.sound_diagnosis?.sound_type).toBe("metallic_rattling");
  });
});
