import { Settings } from "../types.ts";
import { triageHvacIssue } from "./hvacIntelligence.ts";

export type EscalationRoute = "owner" | "on_call_technician" | "custom_role";

export interface HumanEscalationPlan {
  route: EscalationRoute;
  target_phone?: string;
  priority: "routine" | "urgent" | "emergency";
  reason: string;
  summary: string;
  fallback_required_fields: string[];
  fallback_message: string;
  mandatory_instruction?: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildHumanEscalationPlan(
  args: Record<string, any>,
  settings: Settings
): HumanEscalationPlan {
  const reason = text(args.reason) || "Caller requested human assistance.";
  const callerName = text(args.caller_name) || "Caller";
  const callback = text(args.caller_callback_number || args.callback_number);
  const ownerRequest = /\b(josh|owner|manager|boss|person in charge|proprietor)\b/i.test(reason);
  
  // Check for custom roles in additional_transfer_numbers
  let matchedCustomRole = null;
  if (settings.additional_transfer_numbers) {
    for (const contact of settings.additional_transfer_numbers) {
      if (reason.toLowerCase().includes(contact.role.toLowerCase()) || reason.toLowerCase().includes(contact.name.toLowerCase())) {
        matchedCustomRole = contact;
        break;
      }
    }
  }

  const triage = triageHvacIssue(reason, settings);
  
  let route: EscalationRoute;
  let targetPhone: string | undefined;
  let fallbackMessage: string;

  if (ownerRequest) {
    route = "owner";
    targetPhone = settings.owner_phone_number || settings.transfer_phone_number || settings.on_call_technician_phone;
    fallbackMessage = "Josh is unavailable right now. I can take a message and have him call you back.";
  } else if (matchedCustomRole) {
    route = "custom_role";
    targetPhone = matchedCustomRole.number;
    fallbackMessage = `${matchedCustomRole.name} is unavailable right now. I can take a message and have them call you back.`;
  } else {
    route = "on_call_technician";
    targetPhone = settings.on_call_technician_phone || settings.transfer_phone_number;
    fallbackMessage = triage.is_emergency
      ? "The on-call technician is unavailable right now. I will take your callback number and address for priority follow-up."
      : "The technician is unavailable right now. I can take a message and have the office call you back.";
  }

  const priority = triage.is_life_safety ? "emergency" : triage.is_emergency ? "urgent" : "routine";
  const summary = `${priority.toUpperCase()} ${route.replace(/_/g, " ")} handoff. ${callerName}${callback ? ` (${callback})` : ""}: ${reason}`;

  return {
    route,
    target_phone: targetPhone,
    priority,
    reason,
    summary,
    fallback_required_fields: ["caller_name", "callback_number", "reason"].concat(triage.is_emergency ? ["property_address"] : []),
    fallback_message: fallbackMessage,
    mandatory_instruction: triage.mandatory_instruction
  };
}

