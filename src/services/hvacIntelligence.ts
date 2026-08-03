import { CallType, Settings } from "../types.ts";
import { evaluateEmergencySafeguard } from "./operationalSafeguards.ts";

export type ServiceAreaStatus = "in_area" | "out_of_area" | "unknown";

export interface HvacTriageResult {
  call_type: CallType;
  equipment_type?: string;
  is_emergency: boolean;
  is_life_safety: boolean;
  service_area_status: ServiceAreaStatus;
  mandatory_instruction?: string;
  safe_customer_guidance: string;
  required_intake_fields: string[];
  prohibited_claims: string[];
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function detectEquipment(text: string): string | undefined {
  if (/\b(boiler|radiant heat)\b/.test(text)) return "Boiler";
  if (/\b(heat pump|mini[ -]?split)\b/.test(text)) return "Heat Pump / Mini-Split";
  if (/\b(furnace|heater|heating system)\b/.test(text)) return "Furnace";
  if (/\b(air conditioner|air conditioning|\bac\b|central air)\b/.test(text)) return "Air Conditioning";
  if (/\b(thermostat)\b/.test(text)) return "Thermostat";
  if (/\b(duct|ductwork)\b/.test(text)) return "Ductwork";
  return undefined;
}

export function getServiceAreaStatus(zipCode: string | undefined, settings: Settings): ServiceAreaStatus {
  const digits = (zipCode || "").replace(/\D/g, "").slice(0, 5);
  if (!digits) return "unknown";

  const configuredZips = (settings.service_zip_codes || [])
    .map(zip => String(zip).replace(/\D/g, "").slice(0, 5))
    .filter(Boolean);
  const primaryZip = (settings.primary_zip_code || "").replace(/\D/g, "").slice(0, 5);
  const allowedZips = new Set([...configuredZips, ...(primaryZip ? [primaryZip] : [])]);

  // Without a configured ZIP list we cannot honestly calculate a radius in the
  // browser. Unknown is safer than telling a caller that service is unavailable.
  if (allowedZips.size === 0) return "unknown";
  return allowedZips.has(digits) ? "in_area" : "out_of_area";
}

function classifyCallType(text: string): CallType {
  if (/\b(tune[ -]?up|maintenance plan|maintenance agreement|seasonal maintenance)\b/.test(text)) {
    return "maintenance_request";
  }
  if (/\b(replace|replacement|new system|install|quote|estimate)\b/.test(text)) {
    return "estimate_request";
  }
  if (/\b(repair|not cooling|warm air|stopped cooling|not heating|no heat|broken|leak)\b/.test(text)) {
    return "repair_request";
  }
  return "general_office";
}

export function triageHvacIssue(
  issueText: string,
  settings: Settings,
  zipCode?: string,
  requestedCallType?: string
): HvacTriageResult {
  const text = normalized(issueText);
  const emergency = evaluateEmergencySafeguard(text, settings);
  const equipment = detectEquipment(text);
  const callType = emergency.is_emergency
    ? "emergency"
    : (["estimate_request", "repair_request", "maintenance_request", "existing_customer", "general_office"].includes(requestedCallType || "")
      ? requestedCallType as CallType
      : classifyCallType(text));

  const required = emergency.is_emergency
    ? ["callback_number", "property_address", "emergency_description"]
    : callType === "general_office"
      ? ["caller_name", "callback_number", "question_or_request"]
      : ["caller_name", "callback_number", "property_address", "equipment_type", "issue_description", "preferred_timing"];

  let guidance = "A licensed technician should inspect the system; do not promise a diagnosis, repair, price, or arrival time.";
  if (emergency.is_life_safety) {
    guidance = "Tell the caller to leave the building and call 911 or the gas utility. Do not troubleshoot the equipment or schedule service first.";
  } else if (emergency.is_emergency) {
    guidance = "Treat this as priority dispatch. Collect the callback number and address, then route to the on-call technician without promising an arrival time.";
  } else if (callType === "estimate_request") {
    guidance = "Collect equipment type, approximate age, symptoms or replacement goal, and timing. Offer an estimate appointment; do not quote a final price by phone.";
  } else if (callType === "maintenance_request") {
    guidance = "Collect equipment type, last service date if known, and preferred timing. Describe maintenance generally; do not promise a specific repair outcome.";
  } else if (equipment === "Thermostat") {
    guidance = "Ask what the display shows and whether the system has power. Do not instruct the caller to open electrical panels or handle refrigerant.";
  }

  return {
    call_type: callType,
    equipment_type: equipment,
    is_emergency: emergency.is_emergency,
    is_life_safety: emergency.is_life_safety,
    service_area_status: getServiceAreaStatus(zipCode, settings),
    mandatory_instruction: emergency.mandatory_instruction,
    safe_customer_guidance: guidance,
    required_intake_fields: required,
    prohibited_claims: ["guaranteed diagnosis", "final price without inspection", "guaranteed arrival time", "unsafe electrical or refrigerant instructions"]
  };
}

