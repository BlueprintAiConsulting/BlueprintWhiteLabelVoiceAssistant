import { describe, it, expect } from "vitest";
import {
  checkRequiredDetailsCaptured,
  evaluateQAFlags,
  extractObjectionThemes,
  computeQAMetrics,
  CallOutcome
} from "../qaService.ts";

const sampleCalls: CallOutcome[] = [
  {
    id: "call_1",
    start_time: "2026-08-03T10:00:00Z",
    end_time: "2026-08-03T10:03:00Z",
    duration_seconds: 180,
    source: "phone",
    call_type: "estimate_request",
    emergency_flag: false,
    appointment_booked: true,
    transfer_attempted: false,
    transfer_success: false,
    final_disposition: "booked",
    transcript: [
      { role: "user", text: "I need a quote. Your price is a bit high." }
    ],
    tool_errors: [],
    captured_details: {
      name: "Dave",
      callback_number: "+17175550199",
      address: "123 Main St",
      service_need: "AC Estimate",
      timing: "2026-08-10"
    },
    qa_flags: []
  },
  {
    id: "call_2",
    start_time: "2026-08-03T11:00:00Z",
    end_time: "2026-08-03T11:00:10Z",
    duration_seconds: 10,
    source: "simulator",
    call_type: "repair_request",
    emergency_flag: false,
    appointment_booked: false,
    transfer_attempted: false,
    transfer_success: false,
    final_disposition: "abandoned",
    transcript: [],
    tool_errors: ["TOOL_ERROR"],
    captured_details: {},
    qa_flags: []
  }
];

describe("QA Performance Dashboard Service Tests", () => {
  it("validates required details by call type", () => {
    const complete = checkRequiredDetailsCaptured("estimate_request", {
      name: "Alice",
      callback_number: "7175550199",
      address: "York PA",
      service_need: "Repair",
      timing: "Tomorrow"
    });
    expect(complete.is_complete).toBe(true);

    const incomplete = checkRequiredDetailsCaptured("emergency", {
      callback_number: "7175550199"
    });
    expect(incomplete.is_complete).toBe(false);
    expect(incomplete.missing_fields).toContain("address");
  });

  it("auto-flags call quality issues and early abandonment", () => {
    const flags = evaluateQAFlags({
      duration_seconds: 10,
      appointment_booked: false,
      tool_errors: ["API_TIMEOUT"],
      final_disposition: "abandoned"
    });

    expect(flags).toContain("EARLY_CALL_ABANDONMENT");
    expect(flags).toContain("TOOL_EXECUTION_FAILURE");
  });

  it("extracts and groups caller objection themes from transcripts", () => {
    const themes = extractObjectionThemes(sampleCalls);
    const priceObjection = themes.find(t => t.theme.includes("Price"));

    expect(priceObjection).toBeDefined();
    expect(priceObjection?.count).toBe(1);
  });

  it("computes high-level QA dashboard metrics accurately", () => {
    const metrics = computeQAMetrics(sampleCalls);

    expect(metrics.total_calls).toBe(2);
    expect(metrics.booked_jobs_count).toBe(1);
    expect(metrics.booking_conversion_rate_pct).toBe(50);
    expect(metrics.abandonment_rate_pct).toBe(50);
  });
});
