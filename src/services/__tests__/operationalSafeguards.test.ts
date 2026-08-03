import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateEmergencySafeguard,
  evaluateAfterHoursSafeguard,
  evaluateDuplicateLeadSafeguard,
  evaluatePrivacyConsentSafeguard,
  recordAuditEvent,
  getAuditLogs,
  clearAuditLogs
} from "../operationalSafeguards.ts";
import { Settings, Lead } from "../../types.ts";

const mockSettings: Settings = {
  office_name: "Blueprint HVAC",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["New York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "Office is closed.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke"],
  receptionist_voice_style: "professional",
  prompt_overrides: "",
  recording_consent_required: true,
  recording_retention_days: 90
};

describe("Operational Safeguards Tests", () => {
  beforeEach(() => {
    clearAuditLogs();
  });

  it("triggers mandatory evacuation protocol for gas leak/carbon monoxide life-safety emergency", () => {
    const res = evaluateEmergencySafeguard("I smell a strong gas leak near my furnace", mockSettings);

    expect(res.is_emergency).toBe(true);
    expect(res.is_life_safety).toBe(true);
    expect(res.mandatory_instruction).toContain("LIFE SAFETY ALERT");
    expect(res.collect_callback_first).toBe(true);
    expect(res.allow_arrival_time_promise).toBe(false);
  });

  it("handles non-life-safety heating emergency with callback-first rule", () => {
    const res = evaluateEmergencySafeguard("My furnace stopped heating and it is freezing inside", mockSettings);

    expect(res.is_emergency).toBe(true);
    expect(res.is_life_safety).toBe(false);
    expect(res.collect_callback_first).toBe(true);
    expect(res.allow_arrival_time_promise).toBe(false);
  });

  it("evaluates after-hours behavior for non-emergency callback task creation", () => {
    const afterHoursTime = new Date("2026-08-03T21:30:00");
    const res = evaluateAfterHoursSafeguard(afterHoursTime, mockSettings, false);

    expect(res.is_after_hours).toBe(true);
    expect(res.action).toBe("create_callback_task");
    expect(res.message).toContain("Office is closed");
  });

  it("detects duplicate caller phone and links existing customer record", () => {
    const existingLeads: Lead[] = [
      {
        id: "lead_101",
        callback_number: "+17175550199",
        caller_name: "Dave Johnson",
        call_type: "repair_request",
        call_status: "contacted",
        created_at: "2026-07-28",
        transcript: []
      }
    ];

    const res = evaluateDuplicateLeadSafeguard("(717) 555-0199", existingLeads);

    expect(res.is_duplicate).toBe(true);
    expect(res.existing_lead_id).toBe("lead_101");
    expect(res.action).toBe("link_record");
    expect(res.prior_context_summary).toContain("Dave Johnson");
  });

  it("enforces recording consent prompt before starting call recording", () => {
    const noConsent = evaluatePrivacyConsentSafeguard(mockSettings, false);
    expect(noConsent.recording_permitted).toBe(false);
    expect(noConsent.consent_message).toContain("This call may be recorded");

    const withConsent = evaluatePrivacyConsentSafeguard(mockSettings, true);
    expect(withConsent.recording_permitted).toBe(true);
  });

  it("records audit events for security and compliance tracking", () => {
    recordAuditEvent("emergency_escalation", { reason: "Gas leak", caller: "+17175550199" }, "lead_101");
    recordAuditEvent("privacy_consent", { consent_granted: true }, "lead_101");

    const logs = getAuditLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].event_type).toBe("emergency_escalation");
    expect(logs[1].event_type).toBe("privacy_consent");
  });
});
