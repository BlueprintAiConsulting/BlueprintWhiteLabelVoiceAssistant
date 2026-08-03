import { Settings, Lead } from "../types.ts";
import { normalizePhoneNumber } from "./twilioBridgeService.ts";

export interface EmergencyEvaluation {
  is_emergency: boolean;
  is_life_safety: boolean; // Gas leak, carbon monoxide, smoke/sparks
  mandatory_instruction?: string;
  collect_callback_first: boolean;
  allow_arrival_time_promise: boolean;
}

export interface AfterHoursEvaluation {
  is_after_hours: boolean;
  message: string;
  action: "emergency_escalate" | "create_callback_task";
}

export interface DuplicateLeadEvaluation {
  is_duplicate: boolean;
  existing_lead_id?: string;
  prior_context_summary?: string;
  action: "link_record" | "create_new";
}

export interface AuditEvent {
  event_type: "call_transfer" | "appointment_scheduled" | "emergency_escalation" | "privacy_consent" | "booking_failure";
  timestamp: string;
  lead_id?: string;
  details: Record<string, any>;
}

const auditLogStore: AuditEvent[] = [];

/**
 * 1. Emergency Routing & Life-Safety Safeguards.
 * Detects gas leaks, carbon monoxide, smoke/sparks, major flooding, and no-heat emergencies.
 */
export function evaluateEmergencySafeguard(
  reasonText: string,
  settings: Settings
): EmergencyEvaluation {
  const text = (reasonText || "").toLowerCase();
  const keywords = settings.emergency_keywords || ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "flooding"];

  const isLifeSafety = text.includes("gas leak") || text.includes("carbon monoxide") || text.includes("smoke") || text.includes("sparks");
  const isEmergency = isLifeSafety || text.includes("no heat") || text.includes("stopped heating") || text.includes("freezing") || text.includes("flooding") || keywords.some(k => text.includes(k.toLowerCase()));

  if (isLifeSafety) {
    return {
      is_emergency: true,
      is_life_safety: true,
      mandatory_instruction: "LIFE SAFETY ALERT: Instruct caller to immediately leave the building and call 911 or the gas utility company before taking follow-up details.",
      collect_callback_first: true,
      allow_arrival_time_promise: false
    };
  }

  if (isEmergency) {
    return {
      is_emergency: true,
      is_life_safety: false,
      collect_callback_first: true,
      allow_arrival_time_promise: false
    };
  }

  return {
    is_emergency: false,
    is_life_safety: false,
    collect_callback_first: false,
    allow_arrival_time_promise: false
  };
}

/**
 * 2. After-Hours Logic Safeguards.
 * Uses business hours & timezone from Firestore settings.
 */
export function evaluateAfterHoursSafeguard(
  nowDate: Date,
  settings: Settings,
  isEmergency: boolean = false
): AfterHoursEvaluation {
  const startStr = settings.business_hours?.start || "09:00";
  const endStr = settings.business_hours?.end || "17:00";

  const [sH, sM] = startStr.split(":").map(Number);
  const [eH, eM] = endStr.split(":").map(Number);

  const currentH = nowDate.getHours();
  const currentM = nowDate.getMinutes();

  const currentMinutes = currentH * 60 + currentM;
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;

  const isAfterHours = currentMinutes < startMinutes || currentMinutes > endMinutes;

  if (isAfterHours) {
    if (isEmergency) {
      return {
        is_after_hours: true,
        message: settings.after_hours_message || "Our office is closed. Connecting emergency dispatch.",
        action: "emergency_escalate"
      };
    }
    return {
      is_after_hours: true,
      message: settings.after_hours_message || "Our office is currently closed. A callback task has been created for tomorrow morning.",
      action: "create_callback_task"
    };
  }

  return {
    is_after_hours: false,
    message: "Office is open.",
    action: "create_callback_task"
  };
}

/**
 * 3. Duplicate Lead Protection.
 * Normalizes phone numbers and checks for existing active leads.
 */
export function evaluateDuplicateLeadSafeguard(
  callerPhone: string,
  existingLeads: Lead[]
): DuplicateLeadEvaluation {
  const normalized = normalizePhoneNumber(callerPhone);
  if (!normalized) return { is_duplicate: false, action: "create_new" };

  const match = existingLeads.find(l => normalizePhoneNumber(l.callback_number) === normalized);

  if (match) {
    return {
      is_duplicate: true,
      existing_lead_id: match.id || "lead_existing",
      prior_context_summary: `Existing Customer (${match.caller_name || "Prior Caller"}). Previously contacted on ${match.created_at || "recent date"}. Reason: ${match.reason_for_call || match.issue_description || "General service"}. Status: ${match.call_status}.`,
      action: "link_record"
    };
  }

  return {
    is_duplicate: false,
    action: "create_new"
  };
}

/**
 * 4. Privacy & Recording Consent Safeguard.
 */
export function evaluatePrivacyConsentSafeguard(
  settings: Settings,
  consentGranted: boolean
): { recording_permitted: boolean; consent_message?: string } {
  const requiresConsent = settings.recording_consent_required !== false;

  if (requiresConsent && !consentGranted) {
    return {
      recording_permitted: false,
      consent_message: "This call may be recorded for quality assurance and training. Do you consent to call recording?"
    };
  }

  return {
    recording_permitted: true
  };
}

/**
 * 5. Audit Logging for Security & Compliance.
 */
export function recordAuditEvent(
  eventType: AuditEvent["event_type"],
  payload: Record<string, any>,
  leadId?: string
): AuditEvent {
  const event: AuditEvent = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    lead_id: leadId,
    details: payload
  };
  auditLogStore.push(event);
  return event;
}

export function getAuditLogs(): AuditEvent[] {
  return auditLogStore;
}

export function clearAuditLogs() {
  auditLogStore.length = 0;
}
