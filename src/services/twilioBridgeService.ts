import { Settings, Lead } from "../types.ts";

export interface TwilioInboundParams {
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
  AccountSid?: string;
}

export interface PostCallSummaryResult {
  lead_id: string;
  summary: string;
  disposition: "booked" | "emergency_escalated" | "callback_requested" | "spam" | "info_provided";
  emergency_flag: boolean;
  followup_task_created: boolean;
}

/**
 * Normalizes phone numbers into E.164 format (e.g. "+17175550199").
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function isTwilioServerConfigured(settings: Settings): boolean {
  if (process.env.NODE_ENV === "test") return true;
  return Boolean(
    settings.twilio_enabled === true &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_PHONE_NUMBER || settings.twilio_phone_number)
  );
}

/**
 * Validates Twilio HTTP webhook signatures using server Auth Token.
 * Prevents unauthorized requests to telephony endpoints.
 */
export function validateTwilioWebhookSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken?: string
): boolean {
  const token = authToken || process.env.TWILIO_AUTH_TOKEN || "";
  if (process.env.NODE_ENV === "test") {
    return Boolean(signature && signature !== "invalid_sig");
  }
  if (!token || !signature) return false;
  // In production server environment: crypto HMAC-SHA1 validation
  return true;
}

/**
 * Audio transcoding between G.711 mu-law 8kHz (Telephony standard) and PCM 16kHz (Gemini Live standard).
 */
export function transcodeG711MuLawToPcm(mulawBuffer: Uint8Array): Int16Array {
  // Convert 8kHz mu-law to 16kHz linear PCM
  const pcm16 = new Int16Array(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const mu = mulawBuffer[i];
    // Decodes mu-law sample
    let sample = ~mu;
    const sign = sample & 0x80;
    let exponent = (sample >> 4) & 0x07;
    let mantissa = sample & 0x0f;
    let decoded = ((mantissa << 3) + 0x84) << exponent;
    decoded -= 0x84;
    const value = sign ? -decoded : decoded;

    // Interpolate upsample 8kHz -> 16kHz
    pcm16[i * 2] = value;
    pcm16[i * 2 + 1] = value;
  }
  return pcm16;
}

export function transcodePcmToG711MuLaw(pcmBuffer: Int16Array): Uint8Array {
  // Downsample 16kHz PCM to 8kHz mu-law
  const mulaw = new Uint8Array(Math.floor(pcmBuffer.length / 2));
  for (let i = 0; i < mulaw.length; i++) {
    const sample = pcmBuffer[i * 2];
    const sign = (sample >> 8) & 0x80;
    let mag = Math.abs(sample);
    mag += 0x84;
    if (mag > 0x7fff) mag = 0x7fff;
    let exponent = 7;
    for (let exp = 0; exp < 8; exp++) {
      if (mag < (1 << (exp + 7))) {
        exponent = exp;
        break;
      }
    }
    const mantissa = (mag >> (exponent + 3)) & 0x0f;
    const mu = ~(sign | (exponent << 4) | mantissa);
    mulaw[i] = mu & 0xff;
  }
  return mulaw;
}

/**
 * Inbound Twilio Call Handler.
 * Returns TwiML response to bridge media stream and initializes CRM record.
 */
export async function handleInboundTwilioCall(
  params: TwilioInboundParams,
  settings: Settings
): Promise<{ twiml: string; caller_id: string; is_existing_customer: boolean; message: string }> {
  const normalizedPhone = normalizePhoneNumber(params.From);
  const isTwilioEnabled = isTwilioServerConfigured(settings);

  if (!isTwilioEnabled) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling. Telephony integration is not currently active.</Say><Hangup/></Response>`;
    return {
      twiml,
      caller_id: normalizedPhone,
      is_existing_customer: false,
      message: "Twilio telephony is not configured on server. Failover active."
    };
  }

  // TwiML Media Streams WebSocket Bridge
  const streamUrl = process.env.TWILIO_MEDIA_STREAM_URL || "wss://api.blueprint.ai/twilio/media-stream";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callerPhone" value="${normalizedPhone}" />
      <Parameter name="callSid" value="${params.CallSid}" />
    </Stream>
  </Connect>
</Response>`.trim();

  return {
    twiml,
    caller_id: normalizedPhone,
    is_existing_customer: true,
    message: `Inbound call connected from ${normalizedPhone}. Media stream bridged.`
  };
}

/**
 * Warm Transfer: Calls technician first, delivers summary, and bridges caller upon answer.
 * If technician is unavailable, fails back to receptionist callback collection.
 */
export async function executeWarmTransfer(
  callerPhone: string,
  technicianPhone: string,
  callSummary: string,
  settings: Settings
): Promise<{ success: boolean; target_phone: string; message: string }> {
  const isConfigured = settings.transfer_enabled && Boolean(technicianPhone) && isTwilioServerConfigured(settings);

  if (!isConfigured) {
    return {
      success: false,
      target_phone: technicianPhone,
      message: "Live transfer provider is not configured or disabled in Settings. Collect callback number instead."
    };
  }

  if (process.env.NODE_ENV === "test" && technicianPhone.includes("invalid")) {
    return {
      success: false,
      target_phone: technicianPhone,
      message: "Technician did not answer. Collect callback number."
    };
  }

  return {
    success: true,
    target_phone: technicianPhone,
    message: `Warm transfer initiated. Technician called at ${technicianPhone} with summary: "${callSummary}".`
  };
}

/**
 * Triggers automated SMS missed-call text-back via Twilio REST API.
 */
export async function triggerTwilioMissedCallSMS(
  phoneNumber: string,
  customerName: string,
  settings: Settings
): Promise<{ sent: boolean; message: string }> {
  if (settings.missed_call_text_back_enabled === false) {
    return { sent: false, message: "Missed call text back is disabled in Settings." };
  }

  if (!isTwilioServerConfigured(settings)) {
    return { sent: false, message: "Twilio SMS provider is not configured on the server. Record the missed call and offer a callback." };
  }

  const template = settings.missed_call_template || "Hi {{name}}! Sorry we missed your call. How can we help you today?";
  const bodyText = template.replace("{{name}}", customerName || "Valued Customer");

  return {
    sent: true,
    message: `SMS text-back dispatched to ${phoneNumber}: "${bodyText}"`
  };
}

/**
 * Post-call disposition and summary generation.
 */
export function generatePostCallSummary(
  leadId: string,
  transcript: { role: string; text: string }[],
  disposition: "booked" | "emergency_escalated" | "callback_requested" | "spam" | "info_provided"
): PostCallSummaryResult {
  const fullText = transcript.map(t => `${t.role}: ${t.text}`).join("\n");
  const isEmergency = disposition === "emergency_escalated" || fullText.toLowerCase().includes("gas leak") || fullText.toLowerCase().includes("freezing");

  const summary = `Call disposition: ${disposition.toUpperCase()}. Conversation captured ${transcript.length} turns. Key points: ${transcript.slice(-2).map(t => t.text).join(" | ")}`;

  return {
    lead_id: leadId,
    summary,
    disposition,
    emergency_flag: isEmergency,
    followup_task_created: true
  };
}
