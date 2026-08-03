import { describe, expect, it } from "vitest";
import { getServiceAreaStatus, triageHvacIssue } from "../hvacIntelligence.ts";
import { Settings } from "../../types.ts";

const settings: Settings = {
  office_name: "Lunar Heating and Cooling",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["York"],
  primary_zip_code: "17401",
  service_zip_codes: ["17401", "17402"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks"],
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("HVAC intelligence", () => {
  it("classifies life-safety calls and returns evacuation guidance", () => {
    const result = triageHvacIssue("There is a strong gas smell by the furnace", settings, "17401");
    expect(result.call_type).toBe("emergency");
    expect(result.is_life_safety).toBe(true);
    expect(result.mandatory_instruction).toContain("call 911");
    expect(result.safe_customer_guidance).toContain("leave the building");
  });

  it("classifies equipment and refuses unsupported pricing claims", () => {
    const result = triageHvacIssue("I need a quote to replace my old AC", settings, "17402");
    expect(result.call_type).toBe("estimate_request");
    expect(result.equipment_type).toBe("Air Conditioning");
    expect(result.required_intake_fields).toContain("equipment_type");
    expect(result.prohibited_claims).toContain("final price without inspection");
  });

  it("uses exact ZIP configuration and stays uncertain when ZIP data is absent", () => {
    expect(getServiceAreaStatus("17402", settings)).toBe("in_area");
    expect(getServiceAreaStatus("17300", settings)).toBe("out_of_area");
    expect(getServiceAreaStatus(undefined, settings)).toBe("unknown");
  });
});

