import { Settings, Lead } from "../types.ts";
import { processLead } from "./geminiService.ts";
import { getAvailableAppointmentSlots, bookAppointmentSlot } from "./calendarService.ts";
import { ConversationState } from "./conversationState.ts";

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

        onCapturedLead?.(args);
        let leadId = `lead_${Date.now()}`;
        try {
          const created = await processLead(args);
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
        const ownerRequest = /\b(josh|owner|manager|boss|person in charge|proprietor)\b/i.test(transferReason);
        const ownerTarget = settings.owner_phone_number || settings.transfer_phone_number || settings.on_call_technician_phone;
        const transferTarget = ownerRequest
          ? ownerTarget
          : (args.target_number || settings.on_call_technician_phone || settings.transfer_phone_number);
        const isTransferConfigured = settings.transfer_enabled && Boolean(transferTarget);

        if (!isTransferConfigured) {
          return {
            toolName: name,
            callId: id,
            output: {
              success: false,
              transferred: false,
              error: "TRANSFER_NOT_CONFIGURED",
              message: "Live call transfer provider is not configured. Collect callback phone number and inform caller an emergency technician will call back immediately."
            }
          };
        }

        return {
          toolName: name,
          callId: id,
          output: {
            success: true,
            transferred: true,
            route: ownerRequest ? "owner" : "on_call_technician",
            target_number: transferTarget,
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
