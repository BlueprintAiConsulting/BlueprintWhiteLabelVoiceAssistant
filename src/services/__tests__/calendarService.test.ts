import { describe, it, expect, beforeEach } from "vitest";
import {
  checkGoogleCalendarAvailability,
  bookGoogleCalendarAppointment,
  clearIdempotencyCache
} from "../backendCalendarService.ts";
import { getAvailableAppointmentSlots, bookAppointmentSlot } from "../calendarService.ts";
import { Settings } from "../../types.ts";

const mockSettings: Settings = {
  office_name: "Blueprint HVAC",
  business_hours: {
    start: "09:00",
    end: "17:00",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  },
  timezone: "America/New_York",
  service_areas: ["New York", "Brooklyn"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "We are closed.",
  emergency_keywords: ["gas leak", "no heat"],
  receptionist_voice_style: "professional",
  prompt_overrides: "",
  calendar_id: "primary",
  appointment_duration_minutes: 60,
  appointment_buffer_minutes: 15,
  sms_booking_confirmation_enabled: true
};

describe("Google Calendar & Booking Integration Tests", () => {
  beforeEach(() => {
    clearIdempotencyCache();
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GOOGLE_PRIVATE_KEY;
  });

  it("fails safely when Google Calendar credentials are not configured", async () => {
    const unconfiguredSettings: Settings = { ...mockSettings, calendar_id: "" };
    const res = await checkGoogleCalendarAvailability({ requested_date: "2026-08-10" }, unconfiguredSettings);

    expect(res.configured).toBe(false);
    expect(res.available_slots).toHaveLength(0);
    expect(res.message).toContain("Google Calendar integration is not configured");
  });

  it("calculates available slots within business hours when calendar ID is present", async () => {
    const res = await checkGoogleCalendarAvailability(
      { requested_date: "2026-08-10", preferred_window: "morning" },
      mockSettings
    );

    expect(res.configured).toBe(true);
    expect(res.available_slots.length).toBeGreaterThan(0);
    expect(res.available_slots[0]).toContain("2026-08-10 09:00");
  });

  it("prevents duplicate bookings with idempotency key", async () => {
    const bookingReq = {
      caller_name: "John Doe",
      callback_number: "+15551234567",
      property_address: "123 Main St",
      appointment_start: "2026-08-10 10:00",
      idempotency_key: "idemp_test_123"
    };

    const firstBooking = await bookGoogleCalendarAppointment(bookingReq, mockSettings);
    expect(firstBooking.success).toBe(true);
    expect(firstBooking.event_id).toBeDefined();

    // Repeat booking call with exact same idempotency key
    const secondBooking = await bookGoogleCalendarAppointment(bookingReq, mockSettings);
    expect(secondBooking.success).toBe(true);
    expect(secondBooking.event_id).toBe(firstBooking.event_id);
  });

  it("fails safely on booking if calendar configuration is missing", async () => {
    const unconfiguredSettings: Settings = { ...mockSettings, calendar_id: "" };
    const bookingReq = {
      caller_name: "Jane Smith",
      callback_number: "+15559876543",
      appointment_start: "2026-08-10 14:00"
    };

    const result = await bookAppointmentSlot(bookingReq, unconfiguredSettings);
    expect(result.success).toBe(false);
    expect(result.booking_status).toBe("failed_callback_offered");
    expect(result.message).toContain("Google Calendar integration is not configured");
  });
});
