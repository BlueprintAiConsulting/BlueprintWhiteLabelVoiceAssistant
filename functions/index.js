const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Simple in-memory rate limiting per UID
const userRateLimits = new Map();

const ALLOWED_ORIGINS = [
  "https://lunar-hvac.web.app",
  "https://lunar-hvac.firebaseapp.com",
  "https://sv-receptionist.web.app",
  "https://sv-receptionist.firebaseapp.com",
  "https://blueprint-operations.web.app",
  "https://blueprint-operations.firebaseapp.com",
  "https://blueprintaiconsulting.github.io",
  "https://rcruitlync.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const isDynamicAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".github.io") ||
    origin.endsWith(".web.app") ||
    origin.endsWith(".firebaseapp.com") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  );
  if (isDynamicAllowed) {
    res.set("Access-Control-Allow-Origin", origin);
  } else {
    res.set("Access-Control-Allow-Origin", "*");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function escapeXml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

exports.issueGeminiEphemeralToken = onRequest(
  { cors: false },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // 1. Identify Client (Bearer token OR authorized origin demo request)
      const authHeader = req.headers.authorization || "";
      let clientIdentifier = null;

      if (authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.split("Bearer ")[1];
        try {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          clientIdentifier = `auth_${decodedToken.uid}`;
        } catch (authErr) {
          res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired Firebase ID token." });
          return;
        }
      } else {
        const clientIp = (req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
        clientIdentifier = `demo_${clientIp}`;
      }

      // 2. Rate limiting check (Max 45 for authenticated, 30 for demo per 5 min)
      const now = Date.now();
      const record = userRateLimits.get(clientIdentifier) || { count: 0, resetAt: now + 300000 };

      if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + 300000;
      }

      const limit = clientIdentifier.startsWith("auth_") ? 45 : 30;
      if (record.count >= limit) {
        res.status(429).json({ error: "RATE_LIMITED", message: "Too many voice session requests. Please wait a few minutes." });
        return;
      }

      record.count++;
      userRateLimits.set(clientIdentifier, record);

      // 3. Request real Gemini Ephemeral Token from Google API
      const apiKey = process.env.GEMINI_LIVE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "SERVER_CONFIG_ERROR", message: "GEMINI_LIVE_API_KEY is not set on server." });
        return;
      }

      const payload = {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString()
      };

      const googleResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google Auth Tokens Endpoint Error:", googleResponse.status, errorText);
        res.status(502).json({
          error: "GOOGLE_API_ERROR",
          message: "Google rejected the ephemeral-token request. Check the Gemini API key, API access, and token payload configuration."
        });
        return;
      }

      const data = await googleResponse.json();
      const tokenName = data.token?.name || data.name || "";

      if (!tokenName) {
        res.status(500).json({ error: "INVALID_GOOGLE_RESPONSE", message: "Google API did not return a valid token name." });
        return;
      }

      // 4. Return normalized response
      res.status(200).json({
        access_token: tokenName,
        expires_in_seconds: 60,
        session_expiration_seconds: 1800,
        model: "gemini-3.8-live", // upgraded from gemini-3.1-flash-live-preview
        response_modality: "AUDIO"
      });
    } catch (err) {
      console.error("Internal Server Error in issueGeminiEphemeralToken:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred while generating session token." });
    }
  }
);

exports.twilioSendSms = onRequest(
  { cors: false },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED", message: "Use POST to dispatch SMS." });
      return;
    }

    try {
      const bodyData = req.body || {};
      let storedSettings = {};
      try {
        const snap = await admin.firestore().doc("settings/config").get();
        if (snap.exists) {
          storedSettings = snap.data() || {};
        }
      } catch (e) {
        console.warn("Could not read settings/config in twilioSendSms:", e);
      }

      const sid = (bodyData.accountSid || storedSettings.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || "").trim();
      const token = (bodyData.authToken || storedSettings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || "").trim();
      const fromPhone = (bodyData.fromPhone || storedSettings.twilio_phone_number || process.env.TWILIO_PHONE_NUMBER || "").trim();
      const toPhone = (bodyData.to || storedSettings.on_call_technician_phone || storedSettings.transfer_phone_number || "").trim();
      const messageBody = (bodyData.body || "").trim();

      if (!toPhone || !messageBody) {
        res.status(400).json({ error: "MISSING_PARAMS", message: "Missing recipient phone number ('to') or message 'body'." });
        return;
      }

      if (!sid || !token || !fromPhone) {
        res.status(400).json({
          error: "MISSING_TWILIO_CREDENTIALS",
          message: "Twilio Account SID, Auth Token, and From Phone Number are required to send live SMS."
        });
        return;
      }

      const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
      const params = new URLSearchParams({
        To: toPhone,
        From: fromPhone,
        Body: messageBody
      });

      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`
        },
        body: params.toString()
      });

      const twilioJson = await twilioRes.json().catch(() => ({}));
      if (!twilioRes.ok) {
        res.status(twilioRes.status).json({
          error: "TWILIO_API_ERROR",
          message: twilioJson.message || `Twilio API failed with status ${twilioRes.status}`,
          code: twilioJson.code
        });
        return;
      }

      res.status(200).json({
        success: true,
        sid: twilioJson.sid,
        status: twilioJson.status,
        to: toPhone,
        from: fromPhone
      });
    } catch (err) {
      console.error("Error in twilioSendSms:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: err.message || "Unexpected SMS dispatch error." });
    }
  }
);

let cachedGoogleCloudToken = null;
let cachedGoogleCloudTokenExpiry = 0;

async function getGoogleCloudAccessToken() {
  const now = Date.now();
  if (cachedGoogleCloudToken && cachedGoogleCloudTokenExpiry > now + 60000) {
    return cachedGoogleCloudToken;
  }
  try {
    const metaRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.access_token) {
        cachedGoogleCloudToken = metaData.access_token;
        cachedGoogleCloudTokenExpiry = now + ((metaData.expires_in || 3600) * 1000);
        return cachedGoogleCloudToken;
      }
    }
  } catch (_) {}
  try {
    const cred = admin.app().options.credential;
    if (cred && typeof cred.getAccessToken === "function") {
      const tokenObj = await cred.getAccessToken();
      if (tokenObj && tokenObj.access_token) {
        cachedGoogleCloudToken = tokenObj.access_token;
        cachedGoogleCloudTokenExpiry = now + 1800000;
        return cachedGoogleCloudToken;
      }
    }
  } catch (_) {}
  return null;
}

async function callVertexGemini(requestBody) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "blueprint-operations";
  const token = await getGoogleCloudAccessToken();
  if (token) {
    // 1. Primary: Gemini 2.5 Flash on Vertex us-central1 (~630ms response time, co-located in us-central1)
    try {
      const req25 = {
        ...requestBody,
        generationConfig: {
          ...(requestBody.generationConfig || {}),
          thinkingConfig: { thinkingBudget: 0 }
        }
      };
      const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`;
      const vertexRes = await fetch(vertexUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req25)
      });
      if (vertexRes.ok) {
        return await vertexRes.json();
      }
      const errText = await vertexRes.text();
      console.warn("Vertex AI gemini-2.5-flash warning:", vertexRes.status, errText);
    } catch (e25) {
      console.warn("Vertex AI gemini-2.5-flash error:", e25);
    }

    // 2. High-availability fallback: Gemini 3.8 Flash on Vertex AI Global (thinkingLevel: "low")
    try {
      const req38 = {
        ...requestBody,
        generationConfig: {
          ...(requestBody.generationConfig || {}),
          thinkingConfig: { thinkingLevel: "low" }
        }
      };
      const global38Url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/gemini-3.8-flash:generateContent`;
      const global38Res = await fetch(global38Url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req38)
      });
      if (global38Res.ok) {
        return await global38Res.json();
      }
      const err38 = await global38Res.text();
      console.warn("Vertex AI gemini-3.8-flash global warning:", global38Res.status, err38);
    } catch (e38) {
      console.warn("Vertex AI gemini-3.8-flash global error:", e38);
    }
  }

  const apiKey = process.env.GEMINI_LIVE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    for (const studioModel of ["gemini-2.5-flash", "gemini-3.8-flash"]) {
      try {
        const studioRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${studioModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          }
        );
        if (studioRes.ok) {
          return await studioRes.json();
        }
      } catch (_) {}
    }
  }
  return null;
}

function mapGeminiVoiceToTtsVoice(voiceName) {
  // Chirp 3 HD voices are the same generative voice family Gemini Live uses natively,
  // so a fallback turn sounds like the same human, not a robotic Neural2 voice.
  const chirp = ["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"];
  const legacy = {
    Aoede: "en-US-Neural2-F", Kore: "en-US-Neural2-C", Leda: "en-US-Neural2-F", Zephyr: "en-US-Neural2-F",
    Puck: "en-US-Neural2-D", Charon: "en-US-Neural2-D", Fenrir: "en-US-Neural2-J", Orus: "en-US-Neural2-J"
  };
  const v = chirp.includes(voiceName) ? voiceName : "Aoede";
  return { name: `en-US-Chirp3-HD-${v}`, legacyName: legacy[v] };
}

async function synthesizeSpeechPcm24k(text, voiceName) {
  if (!text || !String(text).trim()) return "";
  try {
    const token = await getGoogleCloudAccessToken();
    if (!token) return "";
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "blueprint-operations";
    const voiceSpec = mapGeminiVoiceToTtsVoice(voiceName);
    const synth = (name) => fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": projectId
      },
      body: JSON.stringify({
        input: { text: String(text).trim() },
        voice: {
          languageCode: "en-US",
          name
        },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 24000
        }
      })
    });
    let ttsRes = await synth(voiceSpec.name);
    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.warn("Chirp3-HD TTS warning, retrying legacy voice:", ttsRes.status, errText);
      ttsRes = await synth(voiceSpec.legacyName);
    }
    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.warn("Cloud TTS warning:", ttsRes.status, errText);
      return "";
    }
    const ttsData = await ttsRes.json();
    if (!ttsData.audioContent) return "";
    const wavBuffer = Buffer.from(ttsData.audioContent, "base64");
    // Strip 44-byte WAV header so AudioPlaybackQueue receives raw 24kHz Int16 PCM
    const pcmBuffer = wavBuffer.length > 44 ? wavBuffer.subarray(44) : wavBuffer;
    return pcmBuffer.toString("base64");
  } catch (e) {
    console.warn("Error synthesizing speech PCM:", e);
    return "";
  }
}

function wrapPcm16kToWavBase64(pcmBase64) {
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const wavHeader = Buffer.alloc(44);
  const dataLength = pcmBuffer.length;
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + dataLength, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavHeader.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  wavHeader.writeUInt16LE(1, 22);  // NumChannels (1 = mono)
  wavHeader.writeUInt32LE(16000, 24); // SampleRate (16000)
  wavHeader.writeUInt32LE(32000, 28); // ByteRate (16000 * 2)
  wavHeader.writeUInt16LE(2, 32);  // BlockAlign (2)
  wavHeader.writeUInt16LE(16, 34); // BitsPerSample (16)
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(dataLength, 40);
  return Buffer.concat([wavHeader, pcmBuffer]).toString("base64");
}

exports.voiceReceptionistTurn = onRequest(
  { cors: false, memory: "1GiB", cpu: 1, minInstances: 1 },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const body = req.body || {};
      const action = body.action || "turn";
      const officeName = body.officeName || "Spring Valley Roofing";
      const isRoofing = /roofing|spring valley/i.test(officeName);
      const receptionistName = body.receptionistName || (isRoofing ? "Sarah" : "Mike");
      const voiceName = body.voiceName || (isRoofing ? "Aoede" : "Puck");
      const systemInstruction = body.systemInstruction || `You are ${receptionistName}, the warm, natural phone dispatcher and front-desk specialist for ${officeName}.`;

      if (action === "greet") {
        const greetings = [
          `Thanks for calling ${officeName}, this is ${receptionistName}. How can I help you?`,
          `Hi, ${officeName}, this is ${receptionistName}. What can I do for you today?`,
          `${officeName}, this is ${receptionistName} speaking. How can I help?`
        ];
        const greetingText = greetings[Math.floor(Math.random() * greetings.length)];
        const audioPcmBase64 = await synthesizeSpeechPcm24k(greetingText, voiceName);
        res.status(200).json({
          text: greetingText,
          audioPcmBase64,
          toolCalls: []
        });
        return;
      }

      const history = Array.isArray(body.history) ? body.history : [];
      const contents = [];

      for (const h of history) {
        if (!h || !h.text) continue;
        contents.push({
          role: h.role === "assistant" || h.role === "model" ? "model" : "user",
          parts: [{ text: String(h.text) }]
        });
      }

      const callerTranscript = (body.userText || "").trim();

      if (callerTranscript) {
        contents.push({
          role: "user",
          parts: [{ text: callerTranscript }]
        });
      } else if (body.audioPcmBase64) {
        const wavBase64 = wrapPcm16kToWavBase64(body.audioPcmBase64);
        contents.push({
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: wavBase64
              }
            },
            {
              text: "Listen to the caller's spoken audio above and respond as the office receptionist in a concise, natural spoken response (typically 1-3 sentences max)."
            }
          ]
        });
      } else if (body.toolResponseText) {
        contents.push({
          role: "user",
          parts: [{ text: `[SYSTEM TOOL EXECUTION RESULT]: ${body.toolResponseText}\nNow speak a concise, natural 1-2 sentence response to the caller.` }]
        });
      } else {
        res.status(200).json({
          callerTranscript: "",
          text: "",
          audioPcmBase64: "",
          toolCalls: []
        });
        return;
      }

      const geminiReq = {
        systemInstruction: {
          parts: [
            {
              text: `${systemInstruction}

CRITICAL CONVERSATIONAL PHONE VOICE RULES (ACT AS AN EXPERIENCED FRONT-DESK DISPATCHER):
- You are ${receptionistName}, the warm, experienced human front-desk dispatcher for ${officeName}. Never refer to yourself as an AI bot or computer program.
- Speak in a natural, friendly, down-to-earth, and conversational human tone. Sound like a knowledgeable local trade professional on the telephone.
- NATURAL BITE-SIZED PACING (SWEET SPOT): Standard back-and-forth dialogue should be 1 to 2 short sentences. When giving emergency advice, safety instructions, or technical explanations, keep it to 2 to 3 concise sentences max (about 35 to 45 words). Give the single most immediate practical action first, never lecture or monologue, and finish with one clear follow-up question.
- Always use natural contractions ("I'll", "we're", "let's", "that's", "don't"). Avoid robotic, stiff, or formal script-reading vocabulary.
- Use natural conversational confirmations when appropriate ("Gotcha", "Sure thing", "I hear you", "No problem at all", "Let's get that taken care of").
- ONE QUESTION AT A TIME: Ask only ONE clear question per turn so the caller never feels interrogated or overwhelmed.
- ZERO REPETITION / ACTIVE MEMORY: Pay close attention to everything the caller already said in the conversation. Never re-ask for their name, town, street address, callback number, or issue if they already gave it.
- TRADE-SAVVY EMPATHY & INTAKE HANDLING:
  * ROOF REPLACEMENTS & ESTIMATES: When a caller inquires about a roof replacement, new roof quote, or aging shingles, confirm warmly that all our written estimates are 100% free with zero obligation. Ask about the age of their roof or number of stories, get the street address and town, and schedule an on-site estimate visit.
  * ROUTINE ROOF REPAIRS: When a caller reports missing shingles, a leaking pipe boot collar, chimney flashing, or a small ceiling water spot, reassure them warmly that we do routine repairs every day and never push an unnecessary full replacement. Schedule an on-roof repair assessment.
  * ACTIVE LEAK EMERGENCIES: Only if the caller states water is actively pouring or dripping through their ceiling right now during rain, lead with immediate empathy, advise placing a bucket underneath, keeping off the roof, and capture address and phone immediately for emergency dispatch.
  * PRICING QUESTIONS: If they ask for a ballpark price over the phone, warmly explain that pricing depends on roof pitch, squares, layers to tear off, and decking condition—which is why our in-person inspection and written estimate are completely free.
- STRICTLY FORBIDDEN: NEVER use markdown, asterisks, bullet points, numbered lists, or emojis. Output plain, spoken conversational English only.
- SOUND HUMAN, NOT SCRIPTED: Vary how you start each turn (never the same opener twice in a row; sometimes no opener at all). Light natural speech habits are fine ("okay so", "yeah", "mm-hmm", "let's see"). Never say "Great question", "I understand your concern", "Certainly", "I'd be happy to assist", or "Thank you for providing that information". Never parrot the caller's sentence back. Use exclamation points rarely.
- MIRROR THE CALLER: stressed caller means calm and reassuring; relaxed caller means easygoing; short busy caller means get to the point.
- ALWAYS finish your sentence. Never trail off mid-thought.`
            }
          ]
        },
        contents,
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: 140
        }
      };

      if (Array.isArray(body.tools) && body.tools.length > 0 && !body.toolResponseText) {
        geminiReq.tools = body.tools;
      }

      const geminiData = await callVertexGemini(geminiReq);
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];

      const toolCalls = [];
      const textParts = [];

      for (const p of parts) {
        if (p.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: p.functionCall.name,
            args: p.functionCall.args || {}
          });
        }
        if (p.text) {
          textParts.push(p.text);
        }
      }

      const replyText = textParts.join(" ").trim();
      const audioPcmBase64 = replyText ? await synthesizeSpeechPcm24k(replyText, voiceName) : "";

      res.status(200).json({
        callerTranscript,
        text: replyText,
        audioPcmBase64,
        toolCalls
      });
    } catch (err) {
      console.error("Error in voiceReceptionistTurn:", err);
      res.status(500).json({ error: "VOICE_TURN_ERROR", message: err.message || "Failed to process voice turn." });
    }
  }
);

exports.twilioVoiceWebhook = onRequest(
  { cors: false },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      let settings = {
        office_name: "Spring Valley Roofing",
        receptionist_name: "Mike",
        transfer_enabled: true,
        transfer_phone_number: "+17175770668",
        on_call_technician_phone: "+17175770668",
        owner_name: "Josh",
        owner_phone_number: "+17175770668",
        sms_alerts_enabled: true,
        emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "active leak", "water pouring", "roof collapse", "tree on roof", "emergency"]
      };

      try {
        const snap = await admin.firestore().doc("settings/config").get();
        if (snap.exists) {
          settings = { ...settings, ...snap.data() };
        }
      } catch (e) {
        console.warn("Could not read settings/config in twilioVoiceWebhook:", e);
      }

      const officeName = req.query.office || settings.office_name || "Spring Valley Roofing";
      const isRoofing = /roofing|spring valley/i.test(officeName);
      const receptionistName = req.query.receptionist || settings.receptionist_name || (isRoofing ? "Sarah" : "Mike");
      const ownerName = isRoofing ? (settings.owner_name && settings.owner_name !== "Josh" ? settings.owner_name : "Chris") : (settings.owner_name || "Josh");
      const isFemale = /sarah|female|aoede/i.test(receptionistName) || isRoofing;
      const transferPhone = req.query.transfer || settings.on_call_technician_phone || settings.transfer_phone_number || "+17175770668";
      const pollyVoice = isFemale ? "Google.en-US-Chirp3-HD-Aoede" : "Google.en-US-Chirp3-HD-Puck";

      const body = req.body || {};
      const speechResult = (body.SpeechResult || req.query.SpeechResult || "").trim();
      const callerFrom = (body.From || req.query.From || "Unknown Caller").trim();
      const callSid = (body.CallSid || req.query.CallSid || `call_${Date.now()}`).trim();
      const turn = parseInt(req.query.turn || "0", 10);

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "us-central1-blueprint-operations.cloudfunctions.net";
      let basePath = req.originalUrl ? req.originalUrl.split("?")[0] : "/twilioVoiceWebhook";
      if (host.includes("cloudfunctions.net") && !basePath.includes("twilioVoiceWebhook")) {
        basePath = "/twilioVoiceWebhook";
      }
      const nextWebhookUrl = `${protocol}://${host}${basePath}?turn=${turn + 1}`;

      // Initial Inbound Call Greeting
      if (!speechResult) {
        const greeting = `Thanks for calling ${officeName}, this is ${receptionistName}. How can I help you today?`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(nextWebhookUrl)}" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US">
    <Say voice="${pollyVoice}">${escapeXml(greeting)}</Say>
  </Gather>
  <Say voice="${pollyVoice}">Hm, I didn't catch anything there. Feel free to call us back anytime, okay? Bye now.</Say>
</Response>`;
        res.set("Content-Type", "text/xml");
        res.status(200).send(twiml);
        return;
      }

      // Caller spoke: evaluate emergency / transfer / AI response via Vertex AI
      const lowerSpeech = speechResult.toLowerCase();
      const emergencyKeywords = settings.emergency_keywords || ["water pouring", "roof collapse", "tree on roof", "emergency tarp", "gas leak", "carbon monoxide", "no heat", "sparks"];
      const isKeywordEmergency = emergencyKeywords.some(kw => lowerSpeech.includes(String(kw).toLowerCase()))
        && !lowerSpeech.includes("replacement")
        && !lowerSpeech.includes("estimate")
        && !lowerSpeech.includes("quote");
      const ownerRegex = new RegExp(`\\b(${ownerName.toLowerCase()}|owner|manager|real person|live person|a human|transfer me|dispatcher)\\b|\\b(speak|talk) (to|with) (someone|somebody|a person)\\b`, "i");
      const asksForHumanOrOwner = ownerRegex.test(lowerSpeech);

      let aiReply = `Okay, gotcha. And what's the address over there?`;
      let shouldTransfer = isKeywordEmergency || asksForHumanOrOwner;
      let isCallDone = /\b(thank you|thanks that's all|goodbye|bye|that is all)\b/i.test(lowerSpeech) && turn >= 2;
      let callType = isKeywordEmergency ? "emergency" : (lowerSpeech.includes("replacement") || lowerSpeech.includes("estimate") || lowerSpeech.includes("quote") ? "estimate_request" : "repair_request");

      // Conversation memory: Twilio webhooks are stateless, so load prior turns for this call
      const leadRef = admin.firestore().collection("leads").doc(`twilio_${callSid}`);
      let priorTurns = [];
      try {
        const leadSnap = await leadRef.get();
        if (leadSnap.exists && Array.isArray(leadSnap.data().call_transcript)) {
          priorTurns = leadSnap.data().call_transcript.slice(-14);
        }
      } catch (memErr) {
        console.warn("Could not load Twilio call memory:", memErr);
      }
      const historyText = priorTurns.length
        ? priorTurns.map(t => `${t.role === "assistant" ? receptionistName : "Caller"}: ${t.text}`).join("\n")
        : "(This is the caller's first reply after your greeting.)";

      try {
        const tradeContext = `
BUSINESS KNOWLEDGE:
- Office: ${officeName}. Owner: ${ownerName}${isRoofing ? " (CertainTeed Master Craftsman)" : ""}.
- Service call / inspection: ${settings.pricing_service_call || (isRoofing ? "100% free written estimates for replacements; upfront pricing before any repair work" : "standard diagnostic visit, upfront pricing before any work")}.
- After-hours / emergency: ${settings.pricing_after_hours || "emergency dispatch available"}.
- Maintenance plan: ${settings.maintenance_plan_name ? `${settings.maintenance_plan_name} at ${settings.maintenance_plan_price}: ${settings.maintenance_plan_benefits}` : "No maintenance plan is offered. Do not mention one."}
- Free in-home estimates for full replacements and larger projects.
${isRoofing ? `- Roofing Services: We specialize in full CertainTeed roof replacements (CertainTeed Landmark and Landmark PRO architectural shingles, 1-2 day installation, full tear-offs down to bare decking, WinterGuard ice & water shield, balanced ridge ventilation) and routine roof repairs (pipe boot collar replacements, chimney and dormer flashing resealing, wind-blown and creased shingle patches, valley leak repairs).
- Roof Replacement Inquiries: When callers ask about a roof replacement, new roof quote, or aging shingles, confirm all estimates are 100% free and in writing. Ask about the approximate age of their roof or number of stories, gather their street address and town, and offer an estimate slot with Chris or an estimator.
- Routine Roof Repairs: When callers ask about a minor leak, leaking pipe boot, chimney flashing, or a couple missing shingles, reassure them that we handle small repairs every day and never push an unnecessary replacement. Schedule an on-roof evaluation.
- Active Leaks: Only if water is actively pouring or dripping into the home right now, advise placing a bucket underneath, staying off the roof, and get their address immediately for emergency tarping.` : "- HVAC: all major brands serviced. Frozen AC line: turn cooling off, fan on, so the coil thaws."}
${(Array.isArray(settings.custom_faqs) ? settings.custom_faqs : []).map(f => `- Q: ${f.question} A: ${f.answer}`).join("\n")}
- When a caller asks a question, answer it directly in a sentence, then gently move toward getting someone out there.`;

        const prompt = `You are ${receptionistName}, a warm, experienced ${isFemale ? "woman" : "guy"} who answers the phones at ${officeName}. You've done this for years and you're genuinely good with people.
Caller Phone: ${callerFrom}
${tradeContext}

CONVERSATION SO FAR:
${historyText}
Caller (just now): "${speechResult}"

HOW YOU TALK (THIS IS A LIVE PHONE CALL, YOUR WORDS ARE SPOKEN ALOUD):
- Sound like a real front-desk person, relaxed and friendly, not a call-center script or phone menu.
- BITE-SIZED NATURAL ANSWERS (SWEET SPOT): Routine turns should be 1 to 2 short sentences. When giving emergency guidance, safety instructions, or technical advice, keep it to 2 to 3 concise sentences max (under 45 words). Share the single most urgent tip first, never monologue, and finish by asking only ONE clear question.
- ROOF REPLACEMENTS & GENERAL REPAIRS:
  * For full roof replacements: All written estimates are 100% free with no pressure. Ask one question at a time (like roof age or stories) and offer an inspection slot with Chris.
  * For routine repairs (pipe boot collars, flashing, missing shingles): Reassure the caller that we do small repairs every day and won't push a whole new roof. Schedule an on-roof assessment.
  * For active emergencies: Only if water is actively pouring inside during rain, advise a bucket and get address for emergency tarping.
- React to what they actually said first ("Oh no, okay", "Yep, we can do that", "Mm-hmm"), then ask the next thing. Vary your openers; never start two replies the same way.
- Use contractions and everyday words. Light natural habits are fine ("okay so", "let's see", "alright").
- NEVER say "Great question", "I understand your concern", "Certainly", "I'd be happy to assist", "Thank you for providing that information", or "Is there anything else I can help you with today". Never repeat the caller's sentence back word for word.
- Remember everything in the conversation so far. NEVER re-ask for something they already told you.
- Natural intake order: what's going on, then the address and town, then their name, then confirm the best number (you can see their caller ID).
- If someone sincerely asks if you're a real person, say you're the office's virtual assistant and the team will follow up personally.

Respond with valid JSON ONLY matching this schema:
{
  "spoken_reply": "What you say out loud next. Plain spoken English, complete sentences, no lists, no markdown.",
  "should_transfer": boolean (true ONLY if this is an active emergency or the caller asked to speak with ${ownerName}/a human/dispatcher),
  "is_complete": boolean (true ONLY if the caller is saying goodbye or all info name/address/issue is confirmed and call is wrapping up),
  "call_type": "emergency" | "estimate_request" | "repair_request" | "maintenance_request" | "general_office",
  "caller_name": "extracted caller name if mentioned or empty string",
  "property_address": "extracted address/ZIP if mentioned or empty string",
  "issue_summary": "concise summary of the caller's request"
}`;

        const geminiData = await callVertexGemini({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
        });

        if (geminiData) {
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const parsed = JSON.parse(rawText);
          if (parsed.spoken_reply) aiReply = parsed.spoken_reply;
          if (typeof parsed.should_transfer === "boolean") shouldTransfer = shouldTransfer || parsed.should_transfer;
          if (typeof parsed.is_complete === "boolean") isCallDone = parsed.is_complete;
          if (parsed.call_type) callType = parsed.call_type;

          // Log or update lead in Firestore
          try {
            const leadUpdate = {
              callback_number: callerFrom,
              call_type: callType,
              emergency_flag: Boolean(isKeywordEmergency || callType === "emergency"),
              issue_description: parsed.issue_summary || speechResult,
              reason_for_call: parsed.issue_summary || speechResult,
              status: shouldTransfer ? "dispatched" : "new",
              source: "twilio_phone",
              call_transcript: admin.firestore.FieldValue.arrayUnion(
                { role: "user", text: speechResult, turn, at: Date.now() },
                { role: "assistant", text: aiReply, turn, at: Date.now() + 1 }
              ),
              updated_at: admin.firestore.FieldValue.serverTimestamp()
            };
            if (parsed.caller_name) leadUpdate.caller_name = parsed.caller_name;
            if (parsed.property_address) leadUpdate.property_address = parsed.property_address;
            if (turn <= 1) leadUpdate.created_at = admin.firestore.FieldValue.serverTimestamp();
            await leadRef.set(leadUpdate, { merge: true });
          } catch (dbErr) {
            console.warn("Failed to log Twilio call lead to Firestore:", dbErr);
          }
        }
      } catch (aiErr) {
        console.warn("Gemini generation in twilioVoiceWebhook failed, activating safe transfer fallback:", aiErr);
        shouldTransfer = true;
        aiReply = `Thanks for calling ${officeName}. Let me connect you directly to our office team right now.`;
      }

      if (shouldTransfer && settings.transfer_enabled !== false && transferPhone) {
        const transferAnnouncement = isKeywordEmergency
          ? `${aiReply} Please stay on the line while I connect you directly to our emergency dispatch line.`
          : `${aiReply} Please hold while I connect your call.`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">${escapeXml(transferAnnouncement)}</Say>
  <Dial>${escapeXml(transferPhone)}</Dial>
</Response>`;
        res.set("Content-Type", "text/xml");
        res.status(200).send(twiml);
        return;
      }

      if (isCallDone) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">${escapeXml(aiReply)}</Say>
  <Hangup/>
</Response>`;
        res.set("Content-Type", "text/xml");
        res.status(200).send(twiml);
        return;
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(nextWebhookUrl)}" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US">
    <Say voice="${pollyVoice}">${escapeXml(aiReply)}</Say>
  </Gather>
  <Say voice="${pollyVoice}">Okay, I didn't hear anything, so I'll let you go. Someone from ${escapeXml(officeName)} will follow up with you. Take care!</Say>
</Response>`;
      res.set("Content-Type", "text/xml");
      res.status(200).send(twiml);
    } catch (err) {
      console.error("Error in twilioVoiceWebhook:", err);
      const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">Thank you for calling. Please hold while we connect your call.</Say>
  <Dial>+17175770668</Dial>
</Response>`;
      res.set("Content-Type", "text/xml");
      res.status(200).send(fallbackTwiml);
    }
  }
);

exports.twilioVoiceFallback = onRequest(
  { cors: false },
  async (req, res) => {
    setCorsHeaders(req, res);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Chirp3-HD-Aoede">Thanks for calling Spring Valley Roofing. One moment while I connect your call directly to our office team.</Say>
  <Dial>+17175770668</Dial>
</Response>`;
    res.set("Content-Type", "text/xml");
    res.status(200).send(twiml);
  }
);


