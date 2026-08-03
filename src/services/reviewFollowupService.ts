import { Settings } from "../types.ts";
import { normalizePhoneNumber, triggerTwilioMissedCallSMS } from "./twilioBridgeService.ts";

export interface ScheduledSMSJob {
  id: string;
  lead_id: string;
  phone_number: string;
  customer_name: string;
  message_type: "review_request" | "appointment_reminder";
  scheduled_for: string;
  status: "pending" | "sent" | "failed" | "canceled";
  body_text: string;
}

const smsJobStore: ScheduledSMSJob[] = [];
const reviewFeedbackStore: { lead_id: string; rating: number; feedback?: string; timestamp: string }[] = [];

/**
 * Generates personalized Google Review request SMS message.
 */
export function generateReviewRequestSMS(
  customerName: string,
  settings: Settings
): string {
  const officeName = settings.office_name || "Lunar Heating and Cooling";
  const defaultLink = "https://g.page/r/lunar-hvac-york-pa/review";
  const reviewLink = settings.google_review_link || defaultLink;

  const template = settings.review_sms_template ||
    "Hi {{name}}, thank you for choosing {{office}}! How was your HVAC service today? Please leave us a 5-star Google review: {{link}}";

  return template
    .replace("{{name}}", customerName || "Valued Customer")
    .replace("{{office}}", officeName)
    .replace("{{link}}", reviewLink);
}

/**
 * Generates 24-hour prior appointment reminder SMS.
 */
export function generateAppointmentReminderSMS(
  customerName: string,
  appointmentDateStr: string,
  timeWindow: string,
  settings: Settings
): string {
  const officeName = settings.office_name || "Lunar Heating and Cooling";
  return `Hi ${customerName || "Valued Customer"}, reminder: your ${officeName} HVAC appointment is scheduled for ${appointmentDateStr} (${timeWindow}). Reply C to confirm or call if you need to reschedule!`;
}

/**
 * Schedules automated SMS review request (e.g. 2 hours after job completion).
 */
export function schedulePostServiceReviewRequest(
  leadId: string,
  phoneNumber: string,
  customerName: string,
  completedAt: Date,
  settings: Settings
): ScheduledSMSJob {
  const normalized = normalizePhoneNumber(phoneNumber);
  const delayHours = settings.review_delay_hours || 2;

  const scheduledTime = new Date(completedAt.getTime() + delayHours * 60 * 60 * 1000);
  const bodyText = generateReviewRequestSMS(customerName, settings);

  const job: ScheduledSMSJob = {
    id: `sms_job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    lead_id: leadId,
    phone_number: normalized,
    customer_name: customerName,
    message_type: "review_request",
    scheduled_for: scheduledTime.toISOString(),
    status: "pending",
    body_text: bodyText
  };

  smsJobStore.push(job);
  return job;
}

/**
 * Dispatches due SMS jobs immediately (mocking production background runner).
 */
export async function processDueSMSJobs(settings: Settings): Promise<number> {
  let dispatchedCount = 0;
  const now = new Date();

  for (const job of smsJobStore) {
    if (job.status === "pending" && new Date(job.scheduled_for) <= now) {
      if (settings.review_request_enabled !== false) {
        job.status = "sent";
        dispatchedCount++;
      } else {
        job.status = "canceled";
      }
    }
  }

  return dispatchedCount;
}

/**
 * Tracks review click-throughs and customer ratings (1-5 stars).
 */
export function trackReviewResponse(
  leadId: string,
  rating: number,
  feedback?: string
): { lead_id: string; rating: number; sentiment: "positive" | "neutral" | "negative" } {
  const sentiment = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
  reviewFeedbackStore.push({
    lead_id: leadId,
    rating,
    feedback,
    timestamp: new Date().toISOString()
  });

  return { lead_id: leadId, rating, sentiment };
}

export function getScheduledSMSJobs(): ScheduledSMSJob[] {
  return smsJobStore;
}

export function clearSMSJobStore() {
  smsJobStore.length = 0;
  reviewFeedbackStore.length = 0;
}
