import { Settings } from "../types.ts";
import {
  checkGoogleCalendarAvailability,
  bookGoogleCalendarAppointment,
  SlotRequest,
  SlotResponse,
  BookingRequest,
  BookingResult
} from "./backendCalendarService.ts";

/**
 * Client service interface for checking appointment slot availability.
 * Does not expose service account or Google tokens in Vite/browser code.
 */
export async function getAvailableAppointmentSlots(
  req: SlotRequest,
  settings: Settings
): Promise<SlotResponse> {
  try {
    return await checkGoogleCalendarAvailability(req, settings);
  } catch (err: any) {
    console.error("Error checking Google Calendar availability:", err);
    return {
      configured: false,
      available_slots: [],
      message: "Unable to check calendar availability. Offer caller a callback instead."
    };
  }
}

/**
 * Client service interface for booking an appointment slot after caller confirmation.
 * Prevents duplicate bookings using idempotency keys and stores event_id.
 */
export async function bookAppointmentSlot(
  req: BookingRequest,
  settings: Settings
): Promise<BookingResult> {
  try {
    return await bookGoogleCalendarAppointment(req, settings);
  } catch (err: any) {
    console.error("Error booking Google Calendar appointment:", err);
    return {
      success: false,
      booking_status: "failed_callback_offered",
      message: "Calendar booking failed. Offer caller a callback instead.",
      error: err.message || "BOOKING_ERROR"
    };
  }
}
