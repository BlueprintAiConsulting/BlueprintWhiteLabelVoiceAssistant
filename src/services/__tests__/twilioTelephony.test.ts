import { describe, it, expect } from "vitest";
import {
  normalizePhoneNumber,
  validateTwilioWebhookSignature,
  transcodeG711MuLawToPcm,
  transcodePcmToG711MuLaw,
  handleInboundTwilioCall,
  executeWarmTransfer,
  triggerTwilioMissedCallSMS,
  generatePostCallSummary
} from "../twilioBridgeService.ts";
import { Settings } from "../../types.ts";

const mockSettings: Settings = {
  office_name: "Blueprint HVAC",
  business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  timezone: "America/New_York",
  service_areas: ["New York"],
  transfer_enabled: true,
  transfer_phone_number: "+17175550999",
  twilio_enabled: true,
  twilio_phone_number: "+17175550199",
  missed_call_text_back_enabled: true,
  missed_call_template: "Hello {{name}}, we missed your call. How can we help?",
  after_hours_message: "Office closed.",
  emergency_keywords: ["gas leak"],
  receptionist_voice_style: "professional",
  prompt_overrides: ""
};

describe("Twilio Telephony & SIP Gateway Tests", () => {
  it("normalizes phone numbers into E.164 format", () => {
    expect(normalizePhoneNumber("7175550199")).toBe("+17175550199");
    expect(normalizePhoneNumber("+1 (717) 555-0199")).toBe("+17175550199");
  });

  it("validates Twilio webhook signatures", () => {
    expect(validateTwilioWebhookSignature("https://api.blueprint.ai/twilio", {}, "valid_sig")).toBe(true);
    expect(validateTwilioWebhookSignature("https://api.blueprint.ai/twilio", {}, "invalid_sig")).toBe(false);
  });

  it("transcodes G.711 mu-law 8kHz <-> PCM 16kHz audio streams", () => {
    const inputMuLaw = new Uint8Array([0xff, 0x00, 0x80, 0x7f]);
    const pcm = transcodeG711MuLawToPcm(inputMuLaw);
    expect(pcm.length).toBe(inputMuLaw.length * 2);

    const reEncoded = transcodePcmToG711MuLaw(pcm);
    expect(reEncoded.length).toBe(inputMuLaw.length);
  });

  it("handles inbound Twilio call and generates TwiML Media Streams bridge", async () => {
    const res = await handleInboundTwilioCall(
      { CallSid: "CA12345", From: "7175550199", To: "7175550000" },
      mockSettings
    );

    expect(res.caller_id).toBe("+17175550199");
    expect(res.twiml).toContain("<Connect>");
    expect(res.twiml).toContain("<Stream");
  });

  it("executes warm transfer to on-call technician", async () => {
    const res = await executeWarmTransfer(
      "+17175550199",
      "+17175550999",
      "Gas leak detected at property",
      mockSettings
    );

    expect(res.success).toBe(true);
    expect(res.target_phone).toBe("+17175550999");
    expect(res.message).toContain("Warm transfer initiated");
  });

  it("fails warm transfer gracefully if technician does not answer", async () => {
    const res = await executeWarmTransfer(
      "+17175550199",
      "+17175550000_invalid",
      "Emergency issue",
      mockSettings
    );

    expect(res.success).toBe(false);
    expect(res.message).toContain("Collect callback number");
  });

  it("dispatches automated missed-call SMS text-back", async () => {
    const res = await triggerTwilioMissedCallSMS("+17175550199", "Sarah Jenkins", mockSettings);
    expect(res.sent).toBe(true);
    expect(res.message).toContain("Sarah Jenkins");
  });

  it("generates post-call summary, disposition, emergency flag, and follow-up task", () => {
    const transcript = [
      { role: "assistant", text: "Lunar Heating and Cooling, how can I help?" },
      { role: "user", text: "My furnace is making a loud noise and smells like smoke." }
    ];

    const result = generatePostCallSummary("lead_99", transcript, "emergency_escalated");

    expect(result.lead_id).toBe("lead_99");
    expect(result.disposition).toBe("emergency_escalated");
    expect(result.emergency_flag).toBe(true);
    expect(result.followup_task_created).toBe(true);
  });
});
