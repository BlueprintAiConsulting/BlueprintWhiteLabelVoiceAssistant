import { describe, expect, it } from "vitest";
import { CallTelemetry, redactSensitiveText, retentionExpiresAt } from "../observabilityService.ts";
import { Settings } from "../../types.ts";

const settings: Settings = {
  office_name: "Lunar Heating and Cooling",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday"] },
  timezone: "America/New_York",
  service_areas: ["York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak"],
  recording_retention_days: 7,
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("Production observability", () => {
  it("redacts phone, email, street address, and ZIP from retained text", () => {
    const redacted = redactSensitiveText("Call Sarah at 717-555-0199 or sarah@example.com at 123 Main St, York PA 17401.");
    expect(redacted).not.toContain("717-555-0199");
    expect(redacted).not.toContain("sarah@example.com");
    expect(redacted).not.toContain("123 Main St");
    expect(redacted).not.toContain("17401");
  });

  it("tracks interruptions, tool latency, and retention expiry", () => {
    const telemetry = new CallTelemetry(settings, "call_test");
    telemetry.recordTranscript({ role: "assistant", text: "How can I help?" });
    telemetry.recordInterruption();
    telemetry.recordTool({ name: "saveLead", latency_ms: 12.7, success: false, error: "TOOL_ERROR" });
    const summary = telemetry.summary("2026-08-10T00:00:00.000Z");

    expect(summary.session_id).toBe("call_test");
    expect(summary.interruption_count).toBe(1);
    expect(summary.tool_calls[0].latency_ms).toBe(13);
    expect(summary.tool_calls[0].success).toBe(false);
    expect(summary.retention_expires_at).toBeTruthy();
  });

  it("calculates retention from the configured number of days", () => {
    expect(retentionExpiresAt("2026-08-03T00:00:00.000Z", settings)).toBe("2026-08-10T00:00:00.000Z");
  });
});

