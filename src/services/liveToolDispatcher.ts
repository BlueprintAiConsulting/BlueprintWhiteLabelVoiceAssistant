import { Settings, Lead } from "../types.ts";
import { processLead } from "./geminiService.ts";
import { getAvailableAppointmentSlots, bookAppointmentSlot } from "./calendarService.ts";
import { ConversationState } from "./conversationState.ts";
import { triageHvacIssue } from "./hvacIntelligence.ts";
import { buildHumanEscalationPlan } from "./humanEscalationService.ts";

export interface ToolCallPayload {
  id: string;
  name: string;
  args: any;
}

export interface ToolExecutionResult {
  toolName: string;
  callId: string;
  output: {
    success: boolean;
    [key: string]: any;
  };
}

/**
 * Modular dispatcher for Gemini Live function calls.
 * Ensures every incoming call executes reliably and returns a structured output payload.
 */
export async function executeLiveToolCall(
  call: ToolCallPayload,
  settings: Settings,
  onCapturedLead?: (lead: Partial<Lead>) => void,
  conversationState: ConversationState = new ConversationState()
): Promise<ToolExecutionResult> {
  const { id, name, args } = call;

  try {
    switch (name) {
      case "triageHvacIssue": {
        const triage = triageHvacIssue(
          `${args?.issue_description || ""} ${args?.reason_for_call || ""}`,
          settings,
          args?.zip_code,
          args?.call_type
        );
        return {
          toolName: name,
          callId: id,
          output: {
            success: true,
            ...triage,
            message: triage.mandatory_instruction || triage.safe_customer_guidance
          }
        };
      }

      case "confirmCallerDetails": {
        const confirmation = conversationState.confirmCallerDetails(args || {});
        return {
          toolName: name,
          callId: id,
          output: {
            success: confirmation.allowed,
            confirmed: confirmation.allowed,
            missing: confirmation.missing,
            message: confirmation.message
          }
        };
      }

      case "saveLead": {
        const guard = conversationState.canSaveLead(args || {});
        if (!guard.allowed) {
          return {
            toolName: name,
            callId: id,
            output: {
              success: false,
              error: "LEAD_REQUIREMENTS_INCOMPLETE",
              missing: guard.missing,
              message: guard.message
            }
          };
        }

        const triage = triageHvacIssue(
          `${args?.issue_description || ""} ${args?.reason_for_call || ""}`,
          settings,
          args?.zip_code,
          args?.call_type
        );
        const normalizedLead = triage.is_emergency && args.call_type !== "spam"
          ? {
              ...args,
              call_type: "emergency",
              emergency_flag: true,
              emergency_type: args.emergency_type || (triage.is_life_safety ? "Life Safety HVAC Emergency" : "Priority HVAC Emergency")
            }
          : args;

        onCapturedLead?.(normalizedLead);
        let leadId = `lead_${Date.now()}`;
        try {
          const created = await processLead(normalizedLead);
          if (typeof created === "string") leadId = created;
        } catch (dbErr) {
          console.warn("Firestore saveLead notice:", dbErr);
        }

        conversationState.markToolComplete(name, true);
        return {
          toolName: name,
          callId: id,
          output: {
            success: true,
            lead_id: leadId,
            call_type: normalizedLead.call_type,
            emergency_flag: Boolean(normalizedLead.emergency_flag),
            mandatory_instruction: triage.mandatory_instruction || null,
            message: "Lead details successfully saved."
          }
        };
      }

      case "checkAppointmentSlots": {
        const slotResult = await getAvailableAppointmentSlots(
          {
            requested_date: args.requested_date,
            preferred_window: args.preferred_window,
            service_type: args.service_type
          },
          settings
        );

        conversationState.recordAvailableSlots(slotResult.available_slots);
        return {
          toolName: name,
          callId: id,
          output: {
            success: slotResult.configured && slotResult.available_slots.length > 0,
            configured: slotResult.configured,
            available_slots: slotResult.available_slots,
            message: slotResult.message
          }
        };
      }

      case "bookAppointment": {
        const guard = conversationState.canBookAppointment(args || {});
        if (!guard.allowed) {
          return {
            toolName: name,
            callId: id,
            output: {
              success: false,
              error: "BOOKING_REQUIREMENTS_INCOMPLETE",
              missing: guard.missing,
              booking_status: "failed_callback_offered",
              message: guard.message
            }
          };
        }

        const bookingResult = await bookAppointmentSlot(
          {
            caller_name: args.caller_name || "Valued Caller",
            callback_number: args.callback_number,
            property_address: args.property_address,
            service_type: args.service_type,
            issue_description: args.issue_description,
            appointment_start: args.appointment_start,
            idempotency_key: `${args.callback_number}_${args.appointment_start}`
          },
          settings
        );

        if (bookingResult.success) {
          onCapturedLead?.({
            caller_name: args.caller_name,
            callback_number: args.callback_number,
            booked_appointment_slot: args.appointment_start,
            google_event_id: bookingResult.event_id,
            booking_status: "booked",
            call_status: "booked"
          });
        }

        conversationState.markToolComplete(name, bookingResult.success);
        return {
          toolName: name,
          callId: id,
          output: {
            success: bookingResult.success,
            event_id: bookingResult.event_id || null,
            booking_status: bookingResult.booking_status,
            message: bookingResult.message,
            error: bookingResult.error || null
          }
        };
      }

      case "transferCall": {
        const transferReason = typeof args.reason === "string" ? args.reason : "";
        const plan = buildHumanEscalationPlan(args || {}, settings);
        const ownerRequest = plan.route === "owner";
        const transferTarget = ownerRequest
          ? plan.target_phone
          : (args.target_number || plan.target_phone);
        const isTransferConfigured = settings.transfer_enabled && Boolean(transferTarget);

        if (!isTransferConfigured) {
          return {
            toolName: name,
            callId: id,
            output: {
              success: false,
              transferred: false,
              error: "TRANSFER_NOT_CONFIGURED",
              route: plan.route,
              priority: plan.priority,
              handoff_summary: plan.summary,
              fallback_required_fields: plan.fallback_required_fields,
              fallback_message: plan.fallback_message,
              mandatory_instruction: plan.mandatory_instruction || null,
              message: plan.mandatory_instruction || plan.fallback_message
            }
          };
        }

        return {
          toolName: name,
          callId: id,
          output: {
            success: true,
            transferred: true,
            route: plan.route,
            priority: plan.priority,
            target_number: transferTarget,
            handoff_summary: plan.summary,
            fallback_required_fields: plan.fallback_required_fields,
            fallback_message: plan.fallback_message,
            mandatory_instruction: plan.mandatory_instruction || null,
            message: ownerRequest
              ? "Call transfer initiated to the business owner."
              : `Call transfer initiated to ${transferTarget}.`
          }
        };
      }

      default: {
        return {
          toolName: name,
          callId: id,
          output: {
            success: false,
            error: "UNKNOWN_TOOL",
            message: `Tool ${name} is not recognized.`
          }
        };
      }
    }
  } catch (err: any) {
    return {
      toolName: name,
      callId: id,
      output: {
        success: false,
        error: err.message || "TOOL_EXECUTION_ERROR",
        message: `Execution error during ${name}.`
      }
    };
  }
}
