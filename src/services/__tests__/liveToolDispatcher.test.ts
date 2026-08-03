import { describe, it, expect, beforeEach } from "vitest";
import { executeLiveToolCall } from "../liveToolDispatcher.ts";
import { Settings } from "../../types.ts";

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
    const res = await executeLiveToolCall(
      {
        id: "call_1",
        name: "saveLead",
        args: { caller_name: "Alice", callback_number: "+15550001111", call_type: "estimate_request", emergency_flag: false }
      },
      mockSettings
    );

    expect(res.callId).toBe("call_1");
    expect(res.output.success).toBe(true);
    expect(res.output.lead_id).toBeDefined();
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
    const res = await executeLiveToolCall(
      {
        id: "call_3",
        name: "bookAppointment",
        args: {
          caller_name: "Bob Smith",
          callback_number: "+15552223333",
          appointment_start: "2026-08-12 10:00",
          service_type: "repair"
        }
      },
      mockSettings
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
