import { CallType } from "../types.ts";

export type ConversationStage =
  | "greeting"
  | "collecting_details"
  | "confirming_details"
  | "checking_availability"
  | "confirming_appointment"
  | "executing_tool"
  | "fallback"
  | "closing";

export interface ConversationStateSnapshot {
  stage: ConversationStage;
  caller_name?: string;
  callback_number?: string;
  property_address?: string;
  address_confirmed: boolean;
  zip_code_confirmed: boolean;
  available_slots: string[];
  appointment_confirmed: boolean;
  selected_appointment?: string;
  last_tool?: string;
}

export interface StateGuardResult {
  allowed: boolean;
  missing: string[];
  message: string;
}

const SERVICE_CALL_TYPES = new Set<CallType>([
  "estimate_request",
  "repair_request",
  "maintenance_request",
  "existing_customer",
  "emergency"
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Per-call state machine. This is intentionally separate from Gemini's prompt:
 * prompts guide behavior, while this state is the final gate before side effects.
 */
export class ConversationState {
  private state: ConversationStateSnapshot = this.initialState();

  private initialState(): ConversationStateSnapshot {
    return {
      stage: "greeting",
      address_confirmed: false,
      zip_code_confirmed: false,
      available_slots: [],
      appointment_confirmed: false
    };
  }

  reset(): void {
    this.state = this.initialState();
  }

  snapshot(): ConversationStateSnapshot {
    return { ...this.state, available_slots: [...this.state.available_slots] };
  }

  beginCollection(): void {
    this.state.stage = "collecting_details";
  }

  recordCallerDetails(args: Record<string, any>): void {
    const callerName = text(args.caller_name);
    const callbackNumber = text(args.callback_number);
    const address = text(args.property_address);
    if (callerName) this.state.caller_name = callerName;
    if (callbackNumber) this.state.callback_number = callbackNumber;
    if (address && this.state.property_address && address !== this.state.property_address) {
      // A corrected address invalidates all prior confirmations and the selected slot.
      this.state.address_confirmed = false;
      this.state.zip_code_confirmed = false;
      this.state.appointment_confirmed = false;
      this.state.selected_appointment = undefined;
    }
    if (address) this.state.property_address = address;
    if (address || args.address_confirmed === true || args.zip_code_confirmed === true) {
      this.state.stage = "confirming_details";
    }
  }

  confirmCallerDetails(args: Record<string, any>): StateGuardResult {
    const confirmationType = text(args.confirmation_type).toLowerCase();
    const address = text(args.full_address || args.property_address);
    const zipCode = text(args.zip_code);
    const missing: string[] = [];

    if (!["address", "appointment", "all"].includes(confirmationType)) {
      return {
        allowed: false,
        missing: ["confirmation_type"],
        message: "Specify whether the caller confirmed the address, appointment, or both."
      };
    }

    if (confirmationType === "address" || confirmationType === "all") {
      if (!address) missing.push("full_address");
      if (!zipCode) missing.push("zip_code");
    }
    if (confirmationType === "appointment" || confirmationType === "all") {
      const appointment = text(args.appointment_start);
      if (!appointment) missing.push("appointment_start");
      if (appointment && !this.state.available_slots.includes(appointment)) {
        missing.push("appointment_must_be_from_checked_slots");
      }
    }

    if (missing.length > 0) {
      return {
        allowed: false,
        missing,
        message: `Confirmation cannot be recorded yet. Missing or invalid: ${missing.join(", ")}.`
      };
    }

    if (confirmationType === "address" || confirmationType === "all") {
      this.state.property_address = address;
      this.state.address_confirmed = true;
      this.state.zip_code_confirmed = true;
    }
    if (confirmationType === "appointment" || confirmationType === "all") {
      this.state.selected_appointment = text(args.appointment_start);
      this.state.appointment_confirmed = true;
    }
    this.state.stage = this.state.appointment_confirmed ? "executing_tool" : "collecting_details";
    return { allowed: true, missing: [], message: "Caller confirmation recorded." };
  }

  recordAvailableSlots(slots: string[]): void {
    this.state.available_slots = slots.filter(Boolean);
    this.state.appointment_confirmed = false;
    this.state.selected_appointment = undefined;
    this.state.stage = "checking_availability";
  }

  canSaveLead(args: Record<string, any>): StateGuardResult {
    this.recordCallerDetails(args);
    const callType = text(args.call_type) as CallType;
    const missing: string[] = [];
    if (!this.state.callback_number) missing.push("callback_number");

    if (SERVICE_CALL_TYPES.has(callType)) {
      if (!this.state.property_address) missing.push("property_address");
      if (!this.state.address_confirmed) missing.push("address_confirmation");
      if (!this.state.zip_code_confirmed) missing.push("zip_code_confirmation");
    }

    if (missing.length > 0) {
      this.state.stage = "confirming_details";
      return {
        allowed: false,
        missing,
        message: `Do not save the lead yet. Ask for and explicitly confirm: ${missing.join(", ")}.`
      };
    }

    this.state.stage = "executing_tool";
    this.state.last_tool = "saveLead";
    return { allowed: true, missing: [], message: "Lead requirements satisfied." };
  }

  canBookAppointment(args: Record<string, any>): StateGuardResult {
    this.recordCallerDetails(args);
    const appointment = text(args.appointment_start);
    const missing: string[] = [];
    if (!this.state.callback_number) missing.push("callback_number");
    if (!this.state.property_address) missing.push("property_address");
    if (!this.state.address_confirmed) missing.push("address_confirmation");
    if (!this.state.zip_code_confirmed) missing.push("zip_code_confirmation");
    if (!appointment) missing.push("appointment_start");
    if (appointment && !this.state.available_slots.includes(appointment)) missing.push("checked_available_slot");
    if (!this.state.appointment_confirmed || this.state.selected_appointment !== appointment) missing.push("appointment_confirmation");

    if (missing.length > 0) {
      this.state.stage = "confirming_appointment";
      return {
        allowed: false,
        missing,
        message: `Do not book yet. Complete and confirm: ${missing.join(", ")}.`
      };
    }

    this.state.stage = "executing_tool";
    this.state.last_tool = "bookAppointment";
    return { allowed: true, missing: [], message: "Appointment requirements satisfied." };
  }

  markToolComplete(toolName: string, succeeded: boolean): void {
    this.state.last_tool = toolName;
    this.state.stage = succeeded ? "closing" : "fallback";
  }
}
