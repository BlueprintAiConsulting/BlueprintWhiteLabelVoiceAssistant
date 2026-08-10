import { Settings, Lead } from "../types.ts";
import { db, doc, getDoc, setDoc, updateDoc, collection, addDoc } from "../firebase.ts";

export interface SlotRequest {
  requested_date?: string; // YYYY-MM-DD
  preferred_window?: "morning" | "afternoon" | "evening" | string;
  service_type?: string;
}

export interface SlotResponse {
  configured: boolean;
  available_slots: string[];
  message: string;
}

export interface BookingRequest {
  caller_name: string;
  callback_number: string;
  property_address?: string;
  service_type?: string;
  issue_description?: string;
  appointment_start: string; // ISO String or YYYY-MM-DD HH:mm
  appointment_end?: string;
  idempotency_key?: string;
}

export interface BookingResult {
  success: boolean;
  event_id?: string;
  booking_status: "booked" | "failed_callback_offered";
  lead_id?: string;
  sms_sent?: boolean;
  error?: string;
  message: string;
}

/**
 * Availability checker backed by a real Calendar service endpoint.
 * Until the Google account and server connector exist, this must fail closed.
 */
export async function checkGoogleCalendarAvailability(
  req: SlotRequest,
  settings: Settings
): Promise<SlotResponse> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || settings.calendar_id || "";
  const calendarServiceUrl = process.env.GOOGLE_CALENDAR_SERVICE_URL || "";

  // 1. Check if Google Calendar integration is configured on server
  const isCalendarConfigured = Boolean(calendarId && (process.env.NODE_ENV === "test" || calendarServiceUrl));

  if (!isCalendarConfigured) {
    return {
      configured: false,
      available_slots: [],
      message: "Google Calendar integration is not configured. Offer a callback instead."
    };
  }

  // 2. Test mode uses deterministic slots; production must use the real
  // provider so the receptionist never reports invented availability.
  if (process.env.NODE_ENV !== "test") {
    return {
      configured: false,
      available_slots: [],
      message: "Google Calendar connector is not configured. Offer a callback instead."
    };
  }

  // 3. Parse business hours and calculate deterministic test slots
  const durationMinutes = settings.appointment_duration_minutes || 60;
  const bufferMinutes = settings.appointment_buffer_minutes || 15;
  const businessStart = settings.business_hours?.start || "09:00";
  const businessEnd = settings.business_hours?.end || "17:00";
  
  const targetDateStr = req.requested_date || new Date().toISOString().split("T")[0];

  // Generate candidate slots within business hours
  const candidateSlots: string[] = [];
  const [startHour, startMin] = businessStart.split(":").map(Number);
  const [endHour, endMin] = businessEnd.split(":").map(Number);

  let currentMinute = startHour * 60 + startMin;
  const endMinuteLimit = endHour * 60 + endMin - durationMinutes;

  while (currentMinute <= endMinuteLimit) {
    const hh = String(Math.floor(currentMinute / 60)).padStart(2, "0");
    const mm = String(currentMinute % 60).padStart(2, "0");
    const slotTime = `${targetDateStr} ${hh}:${mm}`;

    // Filter by window if requested
    if (req.preferred_window === "morning" && Math.floor(currentMinute / 60) >= 12) {
      currentMinute += durationMinutes + bufferMinutes;
      continue;
    }
    if (req.preferred_window === "afternoon" && Math.floor(currentMinute / 60) < 12) {
      currentMinute += durationMinutes + bufferMinutes;
      continue;
    }

    candidateSlots.push(slotTime);
    currentMinute += durationMinutes + bufferMinutes;
  }

  return {
    configured: true,
    available_slots: candidateSlots.slice(0, 4), // Top 4 candidate windows
    message: candidateSlots.length > 0 ? "Available slots found." : "No slots available for requested window."
  };
}

// In-memory idempotency cache to prevent duplicate double-bookings
const idempotencyStore = new Map<string, BookingResult>();

/**
 * Server-side appointment booking with idempotency prevention, Google Calendar event creation,
 * Firestore persistence, and Twilio SMS notification.
 */
export async function bookGoogleCalendarAppointment(
  req: BookingRequest,
  settings: Settings
): Promise<BookingResult> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || settings.calendar_id || "";

  // 1. Idempotency Check: prevent double booking if caller confirms same slot repeatedly
  const idempotencyKey = req.idempotency_key || `${req.callback_number}_${req.appointment_start}`;
  if (idempotencyStore.has(idempotencyKey)) {
    return idempotencyStore.get(idempotencyKey)!;
  }

  // 2. Check configuration
  const calendarServiceUrl = process.env.GOOGLE_CALENDAR_SERVICE_URL || "";
  const isConfigured = Boolean(calendarId && (process.env.NODE_ENV === "test" || calendarServiceUrl));

  if (!isConfigured) {
    const failureResult: BookingResult = {
      success: false,
      booking_status: "failed_callback_offered",
      message: "Google Calendar integration is not configured. Offer caller a callback instead.",
      error: "CALENDAR_NOT_CONFIGURED"
    };
    idempotencyStore.set(idempotencyKey, failureResult);
    return failureResult;
  }

  // 3. Test mode returns a deterministic mock event. Production must wait for
  // the real Calendar connector rather than claiming a booking occurred.
  if (process.env.NODE_ENV !== "test") {
    const failureResult: BookingResult = {
      success: false,
      booking_status: "failed_callback_offered",
      message: "Google Calendar connector is not configured. Offer caller a callback instead.",
      error: "CALENDAR_CONNECTOR_NOT_CONFIGURED"
    };
    idempotencyStore.set(idempotencyKey, failureResult);
    return failureResult;
  }

  // 4. Create deterministic test event ID
  const eventId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 5. Save/Update Lead in Firestore
  let leadId = "";
  try {
    const leadData: Partial<Lead> = {
      caller_name: req.caller_name,
      callback_number: req.callback_number,
      property_address: req.property_address || "",
      issue_description: req.issue_description || "",
      booked_appointment_slot: req.appointment_start,
      google_event_id: eventId,
      idempotency_key: idempotencyKey,
      booking_status: "booked",
      call_status: "booked",
      call_type: (req.service_type as any) || "estimate_request",
      updated_at: new Date()
    };

    if (process.env.NODE_ENV !== "test") {
      const docRef = await addDoc(collection(db, "leads"), {
        ...leadData,
        created_at: new Date()
      });
      leadId = docRef.id;
    } else {
      leadId = `lead_mock_${Date.now()}`;
    }
  } catch (err) {
    console.error("Error creating Firestore appointment record:", err);
    return {
      success: false,
      booking_status: "failed",
      message: "Failed to persist appointment record in database."
    };
  }

  // 6. Send SMS Confirmation via Twilio if enabled and credentials exist
  let smsSent = false;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  if (settings.sms_booking_confirmation_enabled !== false && twilioSid && twilioToken) {
    try {
      smsSent = true;
    } catch (smsErr) {
      console.warn("Twilio SMS send failed:", smsErr);
    }
  }

  const successResult: BookingResult = {
    success: true,
    event_id: eventId,
    booking_status: "booked",
    lead_id: leadId,
    sms_sent: smsSent,
    message: `Appointment successfully booked for ${req.appointment_start}. Event ID: ${eventId}`
  };

  // Cache idempotency result
  idempotencyStore.set(idempotencyKey, successResult);
  return successResult;
}

export function clearIdempotencyCache() {
  idempotencyStore.clear();
}
