import { describe, it, expect, vi } from "vitest";
import { executeLiveToolCall } from "../liveToolDispatcher.ts";
import { ConversationState } from "../conversationState.ts";
import { Settings } from "../../types.ts";

vi.mock("../geminiService.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../geminiService.ts")>();
  return {
    ...original,
    processLead: vi.fn().mockResolvedValue("lead_12345")
  };
});

const mockSettings: Settings = {
  office_name: "Blueprint HVAC",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["New York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  on_call_technician_phone: "+17175550199",
  after_hours_message: "Closed",
  emergency_keywords: ["gas leak"],
  receptionist_voice_style: "professional",
  prompt_overrides: "",
  calendar_id: "primary"
};

describe("Live Tool Dispatcher Unit Tests", () => {
  it("executes saveLead and returns success with lead_id", async () => {
    const state = new ConversationState();
    const address = "123 Main St, York, PA 17401";
    await executeLiveToolCall({ id: "confirm_1", name: "confirmCallerDetails", args: {
      confirmation_type: "address", full_address: address, zip_code: "17401"
    } }, mockSettings, undefined, state);
    const res = await executeLiveToolCall(
      {
        id: "call_1",
        name: "saveLead",
        args: { caller_name: "Alice", callback_number: "+15550001111", property_address: address, call_type: "estimate_request", emergency_flag: false }
      },
      mockSettings,
      undefined,
      state
    );

    expect(res.callId).toBe("call_1");
    expect(res.output.success).toBe(true);
    expect(res.output.lead_id).toBeDefined();
  });

  it("returns safe HVAC triage guidance for life-safety issues", async () => {
    const res = await executeLiveToolCall(
      {
        id: "triage_1",
        name: "triageHvacIssue",
        args: { issue_description: "I smell gas near the furnace", zip_code: "17401" }
      },
      mockSettings
    );

    expect(res.output.success).toBe(true);
    expect(res.output.is_life_safety).toBe(true);
    expect(res.output.mandatory_instruction).toContain("call 911");
  });

  it("normalizes a mislabeled gas-odor lead into an emergency", async () => {
    const state = new ConversationState();
    const address = "12 Main St, York, PA 17401";
    await executeLiveToolCall({ id: "confirm_gas", name: "confirmCallerDetails", args: {
      confirmation_type: "address", full_address: address, zip_code: "17401"
    } }, mockSettings, undefined, state);
    const res = await executeLiveToolCall(
      {
        id: "save_gas",
        name: "saveLead",
        args: {
          callback_number: "+15550001111",
          property_address: address,
          call_type: "repair_request",
          issue_description: "There is a gas smell near the furnace",
          emergency_flag: false
        }
      },
      mockSettings,
      undefined,
      state
    );

    expect(res.output.success).toBe(true);
    expect(res.output.call_type).toBe("emergency");
    expect(res.output.emergency_flag).toBe(true);
  });

  it("executes checkAppointmentSlots and returns availability slots", async () => {
    const res = await executeLiveToolCall(
      {
        id: "call_2",
        name: "checkAppointmentSlots",
        args: { service_type: "estimate", requested_date: "2026-08-12", preferred_window: "morning" }
      },
      mockSettings
    );

    expect(res.callId).toBe("call_2");
    expect(res.output.configured).toBe(true);
    expect(res.output.available_slots).toBeDefined();
  });

  it("executes bookAppointment and returns event_id and booking status", async () => {
    const state = new ConversationState();
    const address = "123 Main St, York, PA 17401";
    await executeLiveToolCall({ id: "slot_1", name: "checkAppointmentSlots", args: {
      service_type: "repair", requested_date: "2026-08-12", preferred_window: "morning"
    } }, mockSettings, undefined, state);
    await executeLiveToolCall({ id: "confirm_address", name: "confirmCallerDetails", args: {
      confirmation_type: "address", full_address: address, zip_code: "17401"
    } }, mockSettings, undefined, state);
    await executeLiveToolCall({ id: "confirm_appt", name: "confirmCallerDetails", args: {
      confirmation_type: "appointment", appointment_start: "2026-08-12 10:15"
    } }, mockSettings, undefined, state);
    const res = await executeLiveToolCall(
      {
        id: "call_3",
        name: "bookAppointment",
        args: {
          caller_name: "Bob Smith",
          callback_number: "+15552223333",
          appointment_start: "2026-08-12 10:15",
          property_address: address,
          service_type: "repair"
        }
      },
      mockSettings,
      undefined,
      state
    );

    expect(res.callId).toBe("call_3");
    expect(res.output.success).toBe(true);
    expect(res.output.event_id).toBeDefined();
    expect(res.output.booking_status).toBe("booked");
  });

  it("executes transferCall when transfer is enabled", async () => {
    const res = await executeLiveToolCall(
      {
        id: "call_4",
        name: "transferCall",
        args: { reason: "Gas leak detected", caller_callback_number: "+15559998888" }
      },
      mockSettings
    );

    expect(res.callId).toBe("call_4");
    expect(res.output.success).toBe(true);
    expect(res.output.transferred).toBe(true);
    expect(res.output.target_number).toBe("+17175550199");
  });

  it("routes a Josh/owner request to the configured owner route", async () => {
    const ownerSettings: Settings = {
      ...mockSettings,
      owner_name: "Josh",
      owner_phone_number: "+17175550001"
    };
    const res = await executeLiveToolCall(
      {
        id: "call_owner",
        name: "transferCall",
        args: {
          target_number: "+15550009999",
          reason: "Caller asks to speak with Josh, the owner",
          caller_callback_number: "+15559998888"
        }
      },
      ownerSettings
    );

    expect(res.output.success).toBe(true);
    expect(res.output.route).toBe("owner");
    expect(res.output.target_number).toBe("+17175550001");
    expect(res.output.handoff_summary).toContain("owner handoff");
  });

  it("does not require name or reason details before an owner direct-line transfer", async () => {
    const ownerSettings: Settings = {
      ...mockSettings,
      owner_name: "Josh",
      owner_phone_number: "+17175550001"
    };
    const res = await executeLiveToolCall(
      {
        id: "call_owner_no_callback",
        name: "transferCall",
        args: { reason: "Caller requests Josh, the business owner" }
      },
      ownerSettings
    );

    expect(res.output.success).toBe(true);
    expect(res.output.route).toBe("owner");
    expect(res.output.target_number).toBe("+17175550001");
  });

  it("returns failure when transfer is disabled", async () => {
    const disabledSettings: Settings = { ...mockSettings, transfer_enabled: false };
    const res = await executeLiveToolCall(
      {
        id: "call_5",
        name: "transferCall",
        args: { reason: "Need specialist", caller_callback_number: "+15559998888" }
      },
      disabledSettings
    );

    expect(res.callId).toBe("call_5");
    expect(res.output.success).toBe(false);
    expect(res.output.error).toBe("TRANSFER_NOT_CONFIGURED");
  });
});
