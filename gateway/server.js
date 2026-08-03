const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const firestore = admin.firestore();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

const healthResponse = (_req, res) => {
  res.json({ ok: true, service: "lunar-hvac-live-gateway", gemini_configured: Boolean(process.env.GEMINI_API_KEY) });
};
// Keep a plain root/health endpoint for Cloud Run probes and simple smoke tests.
// (Some Google Front End paths can intercept `/healthz` before Express.)
app.get("/", healthResponse);
app.get("/health", healthResponse);
app.get("/healthz", healthResponse);

app.post("/twilio/inbound", (req, res) => {
  if (!validateTwilioRequest(req)) return res.status(403).send("Invalid Twilio signature");
  const host = req.get("host");
  const protocol = req.get("x-forwarded-proto") === "https" ? "wss" : "ws";
  const sharedSecret = (process.env.GATEWAY_SHARED_SECRET || "").trim();
  const token = sharedSecret ? `?token=${encodeURIComponent(sharedSecret)}` : "";
  const caller = escapeXml(req.body.From || "");
  const callSid = escapeXml(req.body.CallSid || "");
  const streamUrl = `${protocol}://${host}/twilio/media-stream${token}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Connect><Stream url="${streamUrl}"><Parameter name="callerPhone" value="${caller}"/><Parameter name="callSid" value="${callSid}"/></Stream></Connect></Response>`;
  res.type("text/xml").send(twiml);
});

// Configure the Twilio number's status callback to this endpoint for missed-call
// text-back. It is intentionally a no-op until Twilio credentials are present.
app.post("/twilio/status", async (req, res) => {
  if (!validateTwilioRequest(req)) return res.status(403).send("Invalid Twilio signature");
  const status = String(req.body.CallStatus || "").toLowerCase();
  if (["no-answer", "busy", "failed", "canceled"].includes(status)) {
    try {
      await sendMissedCallText(req.body.From || "");
    } catch (error) {
      console.error("Missed-call SMS failed", error.message || error);
    }
  }
  res.status(204).end();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true, maxPayload: 2 * 1024 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/twilio/media-stream") {
    socket.destroy();
    return;
  }
  const requiredToken = (process.env.GATEWAY_SHARED_SECRET || "").trim();
  if (requiredToken && url.searchParams.get("token") !== requiredToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
});

wss.on("connection", (twilioSocket) => {
  const session = new PhoneSession(twilioSocket);
  session.start().catch(error => session.fail(error));
});

class PhoneSession {
  constructor(twilioSocket) {
    this.twilio = twilioSocket;
    this.gemini = null;
    this.streamSid = "";
    this.callSid = "";
    this.callerPhone = "";
    this.greetingSent = false;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.addressConfirmed = false;
    this.zipConfirmed = false;
    this.availableSlots = [];
    this.toolQueue = Promise.resolve();
    this.twilioAudioQueue = [];
    this.twilioAudioTimer = null;
    this.pcm24kRemainder = Buffer.alloc(0);
    this.keepAlive = setInterval(() => {
      if (this.gemini && this.gemini.readyState === WebSocket.OPEN) this.gemini.ping();
    }, 20000);
  }

  async start() {
    this.twilio.on("message", raw => this.handleTwilioMessage(raw));
    this.twilio.on("close", () => this.close());
    this.twilio.on("error", error => this.fail(error));
    await this.connectGemini();
  }

  async connectGemini() {
    if (this.stopped) return;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
    this.gemini = new WebSocket(url);
    this.gemini.on("open", () => this.sendSetup());
    this.gemini.on("message", raw => this.handleGeminiMessage(raw));
    this.gemini.on("close", () => {
      if (this.stopped || this.twilio.readyState !== WebSocket.OPEN) return;
      if (this.reconnectAttempts >= 3) return this.fail(new Error("Gemini Live reconnect limit reached"));
      this.reconnectAttempts += 1;
      setTimeout(() => this.connectGemini().catch(error => this.fail(error)), 1000 * this.reconnectAttempts);
    });
    this.gemini.on("error", error => console.error("Gemini gateway WebSocket error", error.message));
  }

  sendSetup() {
    this.reconnectAttempts = 0;
    this.gemini.send(JSON.stringify({
      setup: {
        model: "models/gemini-3.1-flash-live-preview",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        },
        systemInstruction: { parts: [{ text: gatewayPrompt() }] },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
            endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
            prefixPaddingMs: 500,
            silenceDurationMs: 1400
          }
        },
        tools: [{ functionDeclarations: toolDeclarations() }]
      }
    }));
  }

  handleTwilioMessage(raw) {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }
    if (message.event === "start") {
      this.streamSid = message.start.streamSid || "";
      this.callSid = message.start.callSid || "";
      const params = message.start.customParameters || {};
      this.callerPhone = params.callerPhone || "";
      return;
    }
    if (message.event === "media" && message.media?.payload) {
      if (this.gemini?.readyState === WebSocket.OPEN) {
        const pcm = mulaw8kToPcm16k(Buffer.from(message.media.payload, "base64"));
        this.gemini.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm.toString("base64") } } }));
      }
    }
    if (message.event === "stop") this.close();
  }

  handleGeminiMessage(raw) {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }
    if (message.setupComplete && !this.greetingSent) {
      this.greetingSent = true;
      this.sendGeminiText("[INBOUND CALL CONNECTED] Answer the phone now with your natural greeting.");
    }
    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data && (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith("audio/pcm"))) {
        const incomingPcm = Buffer.concat([this.pcm24kRemainder, Buffer.from(part.inlineData.data, "base64")]);
        const usableBytes = incomingPcm.length - (incomingPcm.length % 6);
        this.pcm24kRemainder = incomingPcm.subarray(usableBytes);
        if (usableBytes > 0) this.sendTwilioAudio(pcm24kToMulaw8k(incomingPcm.subarray(0, usableBytes)));
      }
    }
    const calls = message.toolCall?.functionCalls || [];
    if (calls.length) {
      this.toolQueue = this.toolQueue.then(async () => {
        for (const call of calls) await this.executeTool(call);
      }).catch(error => console.error("Gateway tool queue error", error));
    }
  }

  sendGeminiText(text) {
    if (this.gemini?.readyState === WebSocket.OPEN) this.gemini.send(JSON.stringify({ realtimeInput: { text } }));
  }

  sendTwilioAudio(audio) {
    if (!this.streamSid || this.twilio.readyState !== WebSocket.OPEN) return;
    // Twilio Media Streams expects 8 kHz μ-law to arrive in real-time. Gemini
    // may produce PCM chunks faster than wall-clock time; sending them
    // immediately makes the phone voice sound rushed and drops syllables.
    // Queue 20 ms frames and release exactly one frame every 20 ms.
    for (let offset = 0; offset < audio.length; offset += 160) {
      this.twilioAudioQueue.push(audio.subarray(offset, Math.min(offset + 160, audio.length)));
    }
    if (this.twilioAudioQueue.length > 300) {
      // Six seconds is an emergency safety cap for a stalled Twilio socket.
      // Normal turns stay far below this and are never dropped.
      this.twilioAudioQueue.splice(0, this.twilioAudioQueue.length - 300);
    }
    if (!this.twilioAudioTimer) {
      this.twilioAudioTimer = setInterval(() => this.flushTwilioAudio(), 20);
      this.flushTwilioAudio();
    }
  }

  flushTwilioAudio() {
    if (!this.streamSid || this.twilio.readyState !== WebSocket.OPEN) return this.stopTwilioAudioTimer();
    const frame = this.twilioAudioQueue.shift();
    if (!frame) return this.stopTwilioAudioTimer();
    this.twilio.send(JSON.stringify({ event: "media", streamSid: this.streamSid, media: { payload: frame.toString("base64") } }));
  }

  stopTwilioAudioTimer() {
    if (this.twilioAudioTimer) clearInterval(this.twilioAudioTimer);
    this.twilioAudioTimer = null;
  }

  async executeTool(call) {
    const output = await executeServerTool(call.name, call.args || {}, this);
    if (this.gemini?.readyState === WebSocket.OPEN) {
      this.gemini.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, response: { output } }] } }));
    }
  }

  fail(error) {
    console.error("Phone gateway session failed", error.message || error);
    this.close();
  }

  close() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.keepAlive);
    this.stopTwilioAudioTimer();
    this.twilioAudioQueue = [];
    if (this.gemini && this.gemini.readyState === WebSocket.OPEN) this.gemini.close();
    if (this.twilio.readyState === WebSocket.OPEN) this.twilio.close();
  }
}

async function executeServerTool(name, args, session) {
  if (name === "confirmCallerDetails") {
    const type = String(args.confirmation_type || "");
    if (type === "address" || type === "all") {
      if (!args.full_address || !args.zip_code) return { success: false, error: "ADDRESS_CONFIRMATION_INCOMPLETE", message: "Full address and ZIP are required." };
      session.addressConfirmed = true;
      session.zipConfirmed = true;
    }
    if (type === "appointment" || type === "all") {
      if (!session.availableSlots.includes(args.appointment_start)) return { success: false, error: "SLOT_NOT_CONFIRMED", message: "The caller must choose a slot returned by availability." };
    }
    return { success: true, confirmed: true, message: "Caller confirmation recorded." };
  }
  if (name === "triageHvacIssue") return triageIssue(args.issue_description || args.reason_for_call || "");
  if (name === "checkAppointmentSlots") return { success: false, configured: false, available_slots: [], error: "CALENDAR_NOT_CONFIGURED", message: "Google Calendar is not connected. Offer a callback." };
  if (name === "bookAppointment") return { success: false, booking_status: "failed_callback_offered", error: "CALENDAR_NOT_CONFIGURED", message: "Google Calendar is not connected. Offer a callback." };
  if (name === "transferCall") return executeTwilioWarmTransfer(args, session);
  if (name === "sendMissedCallTextBack") {
    const sent = await sendMissedCallText(args.callback_number || session.callerPhone, args.customer_name || args.caller_name || "");
    return sent.sent ? { success: true, ...sent } : { success: false, error: "SMS_NOT_CONFIGURED", ...sent };
  }
  if (name === "saveLead") {
    if (["estimate_request", "repair_request", "maintenance_request", "existing_customer", "emergency"].includes(args.call_type) && (!session.addressConfirmed || !session.zipConfirmed)) {
      return { success: false, error: "LEAD_REQUIREMENTS_INCOMPLETE", message: "Confirm the complete address and ZIP before saving this service lead." };
    }
    const lead = cleanObject({ ...args, callback_number: args.callback_number || session.callerPhone, call_sid: session.callSid, call_status: args.emergency_flag ? "emergency_follow_up" : "new", created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
    const ref = await firestore.collection("leads").add(lead);
    return { success: true, lead_id: ref.id, message: "Lead details successfully saved." };
  }
  return { success: false, error: "UNKNOWN_TOOL", message: `Tool ${name} is not recognized.` };
}

function triageIssue(text) {
  const value = String(text).toLowerCase();
  const lifeSafety = /gas leak|gas smell|smell gas|carbon monoxide|fire|flames|smoke|sparks/.test(value);
  const emergency = lifeSafety || /no heat|freezing|flooding/.test(value);
  return { success: true, call_type: emergency ? "emergency" : /replace|replacement|estimate|quote/.test(value) ? "estimate_request" : /tune.?up|maintenance/.test(value) ? "maintenance_request" : "repair_request", is_emergency: emergency, is_life_safety: lifeSafety, mandatory_instruction: lifeSafety ? "Tell the caller to leave the building and call 911 before taking details." : null, message: lifeSafety ? "Life-safety protocol required." : "Collect safe, observable HVAC details only." };
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function twilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_PHONE_NUMBER || "").trim();
  const messagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  return { accountSid, authToken, from, messagingServiceSid };
}

function twilioConfigured() {
  const config = twilioConfig();
  return Boolean(config.accountSid && config.authToken && (config.from || config.messagingServiceSid));
}

function validateTwilioRequest(req) {
  if (String(process.env.TWILIO_VALIDATE_SIGNATURE || "").toLowerCase() !== "true") return true;
  const { authToken } = twilioConfig();
  const signature = req.get("x-twilio-signature") || "";
  if (!authToken || !signature) return false;
  const protocol = req.get("x-forwarded-proto") || "https";
  const url = `${protocol}://${req.get("host")}${req.originalUrl}`;
  const params = req.body || {};
  const payload = url + Object.keys(params).sort().map(key => `${key}${params[key]}`).join("");
  const expected = crypto.createHmac("sha1", authToken).update(payload).digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function twilioPost(path, fields) {
  const config = twilioConfig();
  if (!config.accountSid || !config.authToken) throw new Error("Twilio credentials are not configured");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(fields)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function executeTwilioWarmTransfer(args, session) {
  const reason = String(args.reason || "");
  const ownerRequest = /\b(josh|owner|manager|boss|person in charge|proprietor)\b/i.test(reason);
  const target = String(ownerRequest
    ? (process.env.TWILIO_OWNER_NUMBER || process.env.TWILIO_TRANSFER_NUMBER || args.target_number || args.technician_phone || "")
    : (args.technician_phone || args.target_number || process.env.TWILIO_TRANSFER_NUMBER || "")).trim();
  const config = twilioConfig();
  if (!twilioConfigured() || !config.from || !target || !session.callSid) {
    return { success: false, transferred: false, error: "TRANSFER_PROVIDER_NOT_CONFIGURED", message: "The transfer provider is not connected. Collect the caller's message and callback number." };
  }
  const room = `lunar-hvac-${session.callSid}`;
  const summary = reason.slice(0, 500) || "HVAC service call";
  const conferenceXml = `<Response><Say voice="alice">Lunar Heating and Cooling transfer. Caller summary: ${escapeXml(summary)}</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true">${escapeXml(room)}</Conference></Dial></Response>`;
  const callerXml = `<Response><Dial><Conference startConferenceOnEnter="true">${escapeXml(room)}</Conference></Dial></Response>`;
  try {
    await twilioPost("Calls.json", { To: target, From: config.from, Twiml: conferenceXml });
    await twilioPost(`Calls/${encodeURIComponent(session.callSid)}.json`, { Twiml: callerXml });
    return { success: true, transferred: true, target_phone: target, message: "Warm transfer started. The technician is receiving the call summary now." };
  } catch (error) {
    console.error("Warm transfer failed", error.message || error);
    return { success: false, transferred: false, error: "TRANSFER_FAILED", message: "The technician could not be reached. Collect a callback number instead." };
  }
}

async function sendMissedCallText(phone, customerName = "") {
  const normalized = normalizePhone(phone);
  if (!normalized) return { sent: false, message: "No callback number was available for SMS." };
  if (!twilioConfigured()) return { sent: false, message: "Twilio SMS provider is not configured. Record the missed call and offer a callback." };
  const config = twilioConfig();
  const template = process.env.TWILIO_MISSED_CALL_TEMPLATE || "Hi {{name}}, this is Megan from Lunar Heating and Cooling. Sorry we missed your call. Reply here and we will get back to you shortly.";
  const body = template.replace(/\{\{name\}\}/g, customerName || "there");
  const fields = { To: normalized, Body: body };
  if (config.messagingServiceSid) fields.MessagingServiceSid = config.messagingServiceSid;
  else fields.From = config.from;
  const result = await twilioPost("Messages.json", fields);
  return { sent: true, message: "Missed-call text-back sent.", message_sid: result.sid || "" };
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return String(phone || "").startsWith("+") ? String(phone) : "";
}

function mulaw8kToPcm16k(input) {
  const output = Buffer.alloc(input.length * 4);
  for (let i = 0; i < input.length; i++) {
    const decoded = decodeMulaw(input[i]);
    output.writeInt16LE(decoded, i * 4);
    output.writeInt16LE(decoded, i * 4 + 2);
  }
  return output;
}

function pcm24kToMulaw8k(input) {
  const samples = Math.floor(input.length / 2);
  const output = Buffer.alloc(Math.floor(samples / 3));
  for (let i = 0; i < output.length; i++) output[i] = encodeMulaw(input.readInt16LE(i * 6));
  return output;
}

function decodeMulaw(byte) {
  const sample = (~byte) & 0xff;
  const sign = sample & 0x80;
  const exponent = (sample >> 4) & 0x07;
  const mantissa = sample & 0x0f;
  const value = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign ? -value : value;
}

function encodeMulaw(sample) {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.min(0x7fff, Math.abs(sample) + 0x84);
  let exponent = 7;
  for (let i = 0; i < 8; i++) if (magnitude < (1 << (i + 7))) { exponent = i; break; }
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[character]));
}

function gatewayPrompt() {
  return `You are Megan, the natural human receptionist for Lunar Heating and Cooling. Answer the phone immediately, speak calmly and briefly, wait for the caller to finish, and stop when interrupted. Use one question at a time. If the caller asks for Josh, the owner, the boss, or the manager, treat it as an OWNER ROUTING DECISION: say "Absolutely, one moment while I connect you to Josh," then immediately call transferCall with reason "Caller requests Josh, the business owner". Do not ask for the caller's name or what they want first. Never diagnose remotely, promise a final price or arrival time, or give unsafe repair instructions. For gas odor, carbon monoxide, fire, smoke, flames, or sparks, tell the caller to leave and call 911. Confirm the complete address and ZIP before saving a service lead. Calendar is not connected yet, so never claim an appointment was booked.`;
}

function toolDeclarations() {
  return [
    { name: "triageHvacIssue", description: "Classify the HVAC issue and return safe guidance.", parameters: { type: "OBJECT", properties: { issue_description: { type: "STRING" }, reason_for_call: { type: "STRING" }, zip_code: { type: "STRING" } }, required: ["issue_description"] } },
    { name: "confirmCallerDetails", description: "Record an explicit caller confirmation after address/ZIP read-back.", parameters: { type: "OBJECT", properties: { confirmation_type: { type: "STRING", enum: ["address", "appointment", "all"] }, full_address: { type: "STRING" }, zip_code: { type: "STRING" }, appointment_start: { type: "STRING" } }, required: ["confirmation_type"] } },
    { name: "saveLead", description: "Save a lead only after required details are confirmed.", parameters: { type: "OBJECT", properties: { caller_name: { type: "STRING" }, callback_number: { type: "STRING" }, property_address: { type: "STRING" }, call_type: { type: "STRING" }, emergency_flag: { type: "BOOLEAN" }, issue_description: { type: "STRING" } }, required: ["callback_number", "call_type", "emergency_flag"] } },
    { name: "checkAppointmentSlots", description: "Check technician availability; currently unavailable until Calendar is connected.", parameters: { type: "OBJECT", properties: { service_type: { type: "STRING" }, requested_date: { type: "STRING" } }, required: ["service_type"] } },
    { name: "bookAppointment", description: "Book a confirmed appointment; currently unavailable until Calendar is connected.", parameters: { type: "OBJECT", properties: { callback_number: { type: "STRING" }, appointment_start: { type: "STRING" } }, required: ["callback_number", "appointment_start"] } },
    { name: "transferCall", description: "Warm-transfer the caller. For Josh/the owner, use the configured owner direct line immediately; caller callback details may be omitted when caller ID is available.", parameters: { type: "OBJECT", properties: { caller_name: { type: "STRING" }, caller_callback_number: { type: "STRING" }, target_number: { type: "STRING" }, technician_phone: { type: "STRING" }, reason: { type: "STRING" } }, required: ["reason"] } },
    { name: "sendMissedCallTextBack", description: "Send an SMS text-back after a missed call when Twilio messaging is configured.", parameters: { type: "OBJECT", properties: { callback_number: { type: "STRING" }, customer_name: { type: "STRING" }, caller_name: { type: "STRING" } }, required: ["callback_number"] } }
  ];
}

server.listen(process.env.PORT || 8080, () => console.log(`Lunar HVAC gateway listening on ${process.env.PORT || 8080}`));
