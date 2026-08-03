import { Settings } from "../types.ts";

export interface SystemPromptContext {
  settings: Settings;
  currentDateStr?: string;
  isFallback?: boolean;
}

/**
 * Builds dynamic system instructions for Gemini Live Voice & Text Receptionist.
 * Incorporates active Firestore business settings, current date/timezone, emergency rules, and service areas.
 */
export function buildDynamicSystemPrompt(context: SystemPromptContext): string {
  const { settings, currentDateStr } = context;
  const nowStr = currentDateStr || new Date().toISOString().split("T")[0];

  const officeName = settings.office_name || "HVAC Office";
  const timezone = settings.timezone || "America/New_York";
  const startHours = settings.business_hours?.start || "00:00";
  const endHours = settings.business_hours?.end || "23:59";
  const days = (settings.business_hours?.days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).join(", ");
  const serviceAreas = (settings.service_areas || ["Primary Metro Area"]).join(", ");
  const emergencyKeywords = (settings.emergency_keywords || ["gas leak", "no heat", "carbon monoxide", "sparks"]).join(", ");
  const afterHoursMessage = settings.after_hours_message || "Our office is closed. Please leave your details or stay on the line for emergencies.";
  const voiceStyle = settings.receptionist_voice_style || "professional office staff";
  const customInstructions = settings.prompt_overrides ? `\nSPECIAL INSTRUCTIONS:\n${settings.prompt_overrides}` : "";

  return `
You are the front desk receptionist for ${officeName}.
Your goal is to handle inbound calls efficiently, identify the reason for the call, and collect essential details for follow-up.

CURRENT TIME & CONTEXT:
- Today's Date: ${nowStr}
- Business Timezone: ${timezone}
- Business Operating Hours: ${startHours} to ${endHours} (${days})
- Service Areas: ${serviceAreas}

TONE & STYLE:
- Style: ${voiceStyle}.
- Be concise and natural on the phone. Never use robotic or repetitive filler phrases.
- Ask ONE question at a time. Do not double-barrel questions.

INTAKE LOGIC & BUSINESS RULES:
- EMERGENCY CRITERIA: Gas leaks, carbon monoxide, no heat in freezing weather, sparks, smoke, or water leaks. (Keywords: ${emergencyKeywords}).
  - EMERGENCY FIRST ACTION: Collect caller callback number and property address FIRST.
  - TRANSFER RULE: Execute 'transferCall' only if emergency detected and transfer is requested.
- APPOINTMENT SCHEDULING & ESTIMATES:
  - SERVICE AREAS: Only confirm bookings within configured service areas: ${serviceAreas}.
  - CALENDAR SLOTS: Execute 'checkAppointmentSlots' to query availability. Execute 'bookAppointment' ONLY after caller confirms exact date and time.
- AFTER HOURS PROCEDURE:
  - If call occurs outside of operating hours (${startHours}-${endHours}), communicate this message clearly: "${afterHoursMessage}".

ENDING:
- Confirm next steps clearly. Execute 'saveLead' tool as soon as core caller details are captured.${customInstructions}
`.trim();
}
