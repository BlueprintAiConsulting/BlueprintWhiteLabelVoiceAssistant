import { describe, it, expect, beforeEach } from "vitest";
import {
  generateReviewRequestSMS,
  generateAppointmentReminderSMS,
  schedulePostServiceReviewRequest,
  processDueSMSJobs,
  trackReviewResponse,
  clearSMSJobStore,
  getScheduledSMSJobs
} from "../reviewFollowupService.ts";
import { Settings } from "../../types.ts";

const mockSettings: Settings = {
  office_name: "Lunar Heating and Cooling",
  business_hours: { start: "00:00", end: "23:59", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
  timezone: "America/New_York",
  service_areas: ["York, PA"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550199",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak"],
  receptionist_voice_style: "professional",
  prompt_overrides: "",
  review_request_enabled: true,
  google_review_link: "https://g.page/r/lunar-hvac-york-pa/review",
  review_delay_hours: 2,
  review_sms_template: "Hi {{name}}, thanks for choosing {{office}}! Leave a 5-star review: {{link}}"
};

describe("Post-Service Reviews & Automated Follow-Up Tests", () => {
  beforeEach(() => {
    clearSMSJobStore();
  });

  it("generates personalized Google Review request SMS", () => {
    const sms = generateReviewRequestSMS("Dave Miller", mockSettings);

    expect(sms).toContain("Dave Miller");
    expect(sms).toContain("Lunar Heating and Cooling");
    expect(sms).toContain("https://g.page/r/lunar-hvac-york-pa/review");
  });

  it("generates 24-hour appointment reminder SMS", () => {
    const reminder = generateAppointmentReminderSMS("Sarah Jenkins", "2026-08-10", "10:00 AM - 12:00 PM", mockSettings);

    expect(reminder).toContain("Sarah Jenkins");
    expect(reminder).toContain("2026-08-10");
    expect(reminder).toContain("10:00 AM - 12:00 PM");
  });

  it("schedules post-service review request 2 hours after job completion", () => {
    const completedTime = new Date("2026-08-03T12:00:00Z");
    const job = schedulePostServiceReviewRequest("lead_88", "7175550199", "Dave Miller", completedTime, mockSettings);

    expect(job.lead_id).toBe("lead_88");
    expect(job.message_type).toBe("review_request");
    expect(job.scheduled_for).toBe("2026-08-03T14:00:00.000Z");
    expect(job.status).toBe("pending");
  });

  it("dispatches due SMS jobs when processDueSMSJobs is triggered", async () => {
    const pastTime = new Date(Date.now() - 10 * 3600 * 1000); // 10 hours ago
    schedulePostServiceReviewRequest("lead_99", "7175550199", "Alice", pastTime, mockSettings);

    const count = await processDueSMSJobs(mockSettings);
    expect(count).toBe(1);

    const jobs = getScheduledSMSJobs();
    expect(jobs[0].status).toBe("sent");
  });

  it("tracks customer review responses and sentiment", () => {
    const pos = trackReviewResponse("lead_88", 5, "Great service!");
    expect(pos.sentiment).toBe("positive");

    const neg = trackReviewResponse("lead_89", 2, "Technician ran late.");
    expect(neg.sentiment).toBe("negative");
  });
});
