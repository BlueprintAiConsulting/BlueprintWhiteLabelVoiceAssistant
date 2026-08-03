import { Settings, Lead } from "../types.ts";
import { normalizePhoneNumber } from "./twilioBridgeService.ts";

export interface CallOutcome {
  id: string;
  call_sid?: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  source: "simulator" | "phone";
  call_type: string;
  lead_id?: string;
  emergency_flag: boolean;
  appointment_booked: boolean;
  transfer_attempted: boolean;
  transfer_success: boolean;
  final_disposition: "booked" | "emergency_escalated" | "callback_requested" | "spam" | "abandoned" | "info_provided";
  transcript: { role: string; text: string }[];
  tool_errors: string[];
  captured_details: {
    name?: string;
    callback_number?: string;
    address?: string;
    service_need?: string;
    timing?: string;
    equipment_type?: string;
  };
  qa_flags: string[];
  coaching_notes?: string;
}

export interface QAMetricsSummary {
  total_calls: number;
  abandonment_rate_pct: number;
  booked_jobs_count: number;
  booking_conversion_rate_pct: number;
  transfer_rate_pct: number;
  transfer_success_rate_pct: number;
  emergency_escalation_rate_pct: number;
  required_detail_capture_rate_pct: number;
  avg_duration_seconds: number;
  tool_failure_rate_pct: number;
  flagged_calls_count: number;
  objection_themes: { theme: string; count: number }[];
}

/**
 * Validates required details by call type:
 * - Estimate/Repair: name, callback number, address, service need, preferred timing
 * - Emergency: callback number, address, emergency description
 * - Maintenance: name, callback number, address, equipment type
 */
export function checkRequiredDetailsCaptured(
  callType: string,
  details: CallOutcome["captured_details"]
): { is_complete: boolean; missing_fields: string[] } {
  const missing: string[] = [];

  const hasName = Boolean(details.name && details.name.trim());
  const hasPhone = Boolean(details.callback_number && details.callback_number.trim());
  const hasAddress = Boolean(details.address && details.address.trim());
  const hasNeed = Boolean(details.service_need && details.service_need.trim());
  const hasTiming = Boolean(details.timing && details.timing.trim());
  const hasEquip = Boolean(details.equipment_type && details.equipment_type.trim());

  if (callType === "emergency") {
    if (!hasPhone) missing.push("callback_number");
    if (!hasAddress) missing.push("address");
    if (!hasNeed) missing.push("emergency_description");
  } else if (callType === "maintenance_request") {
    if (!hasName) missing.push("name");
    if (!hasPhone) missing.push("callback_number");
    if (!hasAddress) missing.push("address");
    if (!hasEquip) missing.push("equipment_type");
  } else {
    // Estimate or Repair
    if (!hasName) missing.push("name");
    if (!hasPhone) missing.push("callback_number");
    if (!hasAddress) missing.push("address");
    if (!hasNeed) missing.push("service_need");
    if (!hasTiming) missing.push("preferred_timing");
  }

  return {
    is_complete: missing.length === 0,
    missing_fields: missing
  };
}

/**
 * Automatically flags QA problem calls:
 * - Missing required details
 * - Failed greeting (receptionist didn't speak)
 * - Unsupported promise / unconfirmed arrival promise
 * - Failed tool call / API error
 * - Ended without clear disposition (abandoned)
 */
export function evaluateQAFlags(call: Partial<CallOutcome>): string[] {
  const flags: string[] = [];

  if (call.tool_errors && call.tool_errors.length > 0) {
    flags.push("TOOL_EXECUTION_FAILURE");
  }

  if (call.duration_seconds && call.duration_seconds < 15 && !call.appointment_booked) {
    flags.push("EARLY_CALL_ABANDONMENT");
  }

  if (call.captured_details && call.call_type) {
    const detailCheck = checkRequiredDetailsCaptured(call.call_type, call.captured_details);
    if (!detailCheck.is_complete) {
      flags.push(`MISSING_REQUIRED_DETAILS: (${detailCheck.missing_fields.join(", ")})`);
    }
  }

  if (call.final_disposition === "abandoned" || !call.final_disposition) {
    flags.push("NO_CLEAR_DISPOSITION");
  }

  if (call.transfer_attempted && !call.transfer_success) {
    flags.push("TRANSFER_FAILED");
  }

  return flags;
}

/**
 * Extracts and groups common caller objections from authorized transcript text:
 * Price, timing/availability, service area, existing provider, just shopping.
 */
export function extractObjectionThemes(calls: CallOutcome[]): { theme: string; count: number }[] {
  const counts: Record<string, number> = {
    "Price / High Estimate": 0,
    "Timing / Schedule Conflict": 0,
    "Out of Service Area": 0,
    "Has Existing HVAC Provider": 0,
    "Just Shopping / Rate Inquiry": 0
  };

  for (const call of calls) {
    const fullText = (call.transcript || []).map(t => t.text.toLowerCase()).join(" ");

    if (fullText.includes("too expensive") || fullText.includes("quote is high") || fullText.includes("cost") || fullText.includes("price")) {
      counts["Price / High Estimate"]++;
    }
    if (fullText.includes("next week") || fullText.includes("too late") || fullText.includes("busy") || fullText.includes("schedule")) {
      counts["Timing / Schedule Conflict"]++;
    }
    if (fullText.includes("do you cover") || fullText.includes("far away") || fullText.includes("location") || fullText.includes("area")) {
      counts["Out of Service Area"]++;
    }
    if (fullText.includes("already have a tech") || fullText.includes("current company") || fullText.includes("another contractor")) {
      counts["Has Existing HVAC Provider"]++;
    }
    if (fullText.includes("just checking") || fullText.includes("calling around") || fullText.includes("shopping")) {
      counts["Just Shopping / Rate Inquiry"]++;
    }
  }

  return Object.entries(counts)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Computes high-level QA performance metrics across filtered calls.
 */
export function computeQAMetrics(calls: CallOutcome[]): QAMetricsSummary {
  const total = calls.length;
  if (total === 0) {
    return {
      total_calls: 0,
      abandonment_rate_pct: 0,
      booked_jobs_count: 0,
      booking_conversion_rate_pct: 0,
      transfer_rate_pct: 0,
      transfer_success_rate_pct: 0,
      emergency_escalation_rate_pct: 0,
      required_detail_capture_rate_pct: 0,
      avg_duration_seconds: 0,
      tool_failure_rate_pct: 0,
      flagged_calls_count: 0,
      objection_themes: []
    };
  }

  const abandonedCount = calls.filter(c => c.final_disposition === "abandoned" || (c.duration_seconds < 15 && !c.appointment_booked)).length;
  const bookedCount = calls.filter(c => c.appointment_booked).length;
  const transferAttemptedCount = calls.filter(c => c.transfer_attempted).length;
  const transferSuccessCount = calls.filter(c => c.transfer_success).length;
  const emergencyCount = calls.filter(c => c.emergency_flag).length;
  const detailCompleteCount = calls.filter(c => checkRequiredDetailsCaptured(c.call_type, c.captured_details).is_complete).length;
  const toolErrorCount = calls.filter(c => c.tool_errors && c.tool_errors.length > 0).length;
  const totalDuration = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const flaggedCount = calls.filter(c => evaluateQAFlags(c).length > 0).length;

  return {
    total_calls: total,
    abandonment_rate_pct: Math.round((abandonedCount / total) * 100),
    booked_jobs_count: bookedCount,
    booking_conversion_rate_pct: Math.round((bookedCount / total) * 100),
    transfer_rate_pct: Math.round((transferAttemptedCount / total) * 100),
    transfer_success_rate_pct: transferAttemptedCount > 0 ? Math.round((transferSuccessCount / transferAttemptedCount) * 100) : 0,
    emergency_escalation_rate_pct: Math.round((emergencyCount / total) * 100),
    required_detail_capture_rate_pct: Math.round((detailCompleteCount / total) * 100),
    avg_duration_seconds: Math.round(totalDuration / total),
    tool_failure_rate_pct: Math.round((toolErrorCount / total) * 100),
    flagged_calls_count: flaggedCount,
    objection_themes: extractObjectionThemes(calls)
  };
}
