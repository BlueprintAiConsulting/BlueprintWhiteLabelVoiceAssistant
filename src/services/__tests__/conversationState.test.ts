import { describe, expect, it } from "vitest";
import { ConversationState } from "../conversationState.ts";

describe("ConversationState", () => {
  it("blocks a service lead until the full address and ZIP are confirmed", () => {
    const state = new ConversationState();
    const args = {
      caller_name: "Alice",
      callback_number: "+15550001111",
      property_address: "123 Main St, York, PA 17401",
      call_type: "repair_request",
      emergency_flag: false
    };

    expect(state.canSaveLead(args).allowed).toBe(false);
    expect(state.canSaveLead(args).missing).toContain("address_confirmation");

    const confirmation = state.confirmCallerDetails({
      confirmation_type: "address",
      full_address: args.property_address,
      zip_code: "17401"
    });
    expect(confirmation.allowed).toBe(true);
    expect(state.canSaveLead(args).allowed).toBe(true);
  });

  it("requires a checked and explicitly accepted slot before booking", () => {
    const state = new ConversationState();
    const details = {
      caller_name: "Bob Smith",
      callback_number: "+15552223333",
      property_address: "55 Market St, York, PA 17401"
    };
    state.recordCallerDetails(details);
    state.confirmCallerDetails({
      confirmation_type: "address",
      full_address: details.property_address,
      zip_code: "17401"
    });
    state.recordAvailableSlots(["2026-08-12 10:00"]);

    const beforeAcceptance = state.canBookAppointment({ ...details, appointment_start: "2026-08-12 10:00" });
    expect(beforeAcceptance.allowed).toBe(false);
    expect(beforeAcceptance.missing).toContain("appointment_confirmation");

    state.confirmCallerDetails({ confirmation_type: "appointment", appointment_start: "2026-08-12 10:00" });
    expect(state.canBookAppointment({ ...details, appointment_start: "2026-08-12 10:00" }).allowed).toBe(true);
  });

  it("invalidates confirmations when the caller corrects the address", () => {
    const state = new ConversationState();
    const original = "123 Main St, York, PA 17401";
    state.confirmCallerDetails({ confirmation_type: "address", full_address: original, zip_code: "17401" });
    state.recordCallerDetails({ property_address: "125 Main St, York, PA 17401" });

    const result = state.canSaveLead({
      callback_number: "+15550001111",
      property_address: "125 Main St, York, PA 17401",
      call_type: "repair_request"
    });
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain("address_confirmation");
  });
});
