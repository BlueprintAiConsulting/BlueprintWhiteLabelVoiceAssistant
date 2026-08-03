import { describe, expect, it } from "vitest";
import { buildHumanEscalationPlan } from "../humanEscalationService.ts";
import { Settings } from "../../types.ts";

const settings: Settings = {
  office_name: "Lunar Heating and Cooling",
  owner_name: "Josh",
  owner_phone_number: "+17175550001",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  on_call_technician_phone: "+17175550200",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks"],
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("Human escalation planning", () => {
  it("routes Josh requests to the owner with a concise summary", () => {
    const plan = buildHumanEscalationPlan({
      caller_name: "Sarah",
      caller_callback_number: "+17175550999",
      reason: "I need to speak with Josh, the owner"
    }, settings);

    expect(plan.route).toBe("owner");
    expect(plan.target_phone).toBe("+17175550001");
    expect(plan.summary).toContain("Sarah");
    expect(plan.fallback_required_fields).toContain("callback_number");
  });

  it("marks gas odor handoffs as emergency and requires the address fallback", () => {
    const plan = buildHumanEscalationPlan({
      caller_name: "Mike",
      caller_callback_number: "+17175550999",
      reason: "There is a gas smell near my furnace"
    }, settings);

    expect(plan.route).toBe("on_call_technician");
    expect(plan.priority).toBe("emergency");
    expect(plan.mandatory_instruction).toContain("call 911");
    expect(plan.fallback_required_fields).toContain("property_address");
  });
});

