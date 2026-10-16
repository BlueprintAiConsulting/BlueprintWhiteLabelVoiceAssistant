import { AudioPlaybackQueue } from "../lib/audioPlaybackQueue.ts";
import { processLead } from "./geminiService.ts";
import { Lead, Settings } from "../types.ts";
import { executeLiveToolCall } from "./liveToolDispatcher.ts";
import { buildDynamicSystemPrompt } from "./livePromptBuilder.ts";
import { ConversationState } from "./conversationState.ts";
import { SV_MODE } from "../tenant.ts";
import { CallTelemetry, persistCallTelemetry } from "./observabilityService.ts";

export interface GeminiLiveOptions {
  accessToken?: string;
  apiKey?: string;
  officeName?: string;
  voiceName?: string;
  personaName?: string;
  emergencyKeywords?: string[];
  systemInstruction?: string;
  settings?: Settings;
  mediaStream?: MediaStream;
  onTranscript?: (entry: { role: "user" | "assistant" | "system"; text: string }) => void;
  onToolCall?: (toolInfo: { name: string; args: any }) => void;
  onCapturedLead?: (lead: Partial<Lead>) => void;
  onTurnStateChange?: (state: "listening" | "caller_speaking" | "receptionist_speaking" | "interrupted" | "waiting_for_turn") => void;
  onInterrupted?: () => void;
  onEndCall?: (info: { reason: string; farewell?: string }) => void;
  onError?: (err: any) => void;
  onClose?: () => void;
  onAudioLevel?: (level: number) => void;
  bargeInEnabled?: boolean;
}

const INLINE_WORKLET_CODE = `
class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceBuffer = [];
    this.sourceOffset = 0;
    this.pendingSamples = [];
    this.targetSampleRate = 16000;
    this.resampleRatio = sampleRate / this.targetSampleRate;
    this.isReceptionistSpeaking = false;
    this.lastReportTime = 0;
    this.speechHoldUntil = 0;

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.isReceptionistSpeaking === 'boolean') {
        this.isReceptionistSpeaking = event.data.isReceptionistSpeaking;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0];
      let energy = 0;
      for (let i = 0; i < channelData.length; i++) {
        energy += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(energy / channelData.length);

      const now = currentTime;
      if (now - this.lastReportTime > 0.08) {
        this.lastReportTime = now;
        this.port.postMessage({ type: 'audio-level', level: rms });
      }

      let gateGain = 1.0;
      if (this.isReceptionistSpeaking) {
        // Persistent Barge-In: silence mic completely unless vocal energy is loud (>= 0.100 RMS)
        gateGain = rms >= 0.100 ? 1.0 : 0.0;
      } else {
        // Quiet Noise Immunity: silence ambient noise (< 0.038 RMS) with 350ms hangover hold
        if (rms >= 0.038) {
          this.speechHoldUntil = now + 0.35;
        }
        gateGain = (now < this.speechHoldUntil) ? 1.0 : 0.0;
      }

      for (let i = 0; i < channelData.length; i++) {
        this.sourceBuffer.push(channelData[i]);
      }

      while (this.sourceBuffer.length >= 2) {
        const index = Math.floor(this.sourceOffset);
        if (index + 1 >= this.sourceBuffer.length) break;
        const fraction = this.sourceOffset - index;
        const sample = (this.sourceBuffer[index] * (1 - fraction) + this.sourceBuffer[index + 1] * fraction) * gateGain;
        const clamped = Math.max(-1, Math.min(1, sample));
        this.pendingSamples.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF);
        this.sourceOffset += this.resampleRatio;

        const consumed = Math.floor(this.sourceOffset);
        if (consumed > 0) {
          const consumable = Math.min(consumed, this.sourceBuffer.length - 1);
          this.sourceBuffer.splice(0, consumable);
          this.sourceOffset -= consumable;
        }
      }

      const packetSize = 320;
      while (this.pendingSamples.length >= packetSize) {
        const packet = this.pendingSamples.splice(0, packetSize);
        const packetBuffer = new Int16Array(packet).buffer;
        this.port.postMessage(packetBuffer, [packetBuffer]);
      }
    }
    return true;
  }
}
registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
`;

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private audioQueue: AudioPlaybackQueue;
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private micMuteGain: GainNode | null = null;
  private micCapturePromise: Promise<void> | null = null;
  private isReceptionistSpeaking: boolean = false;
  private isConnected: boolean = false;
  private hasGreeted: boolean = false;
  private turnCompleteReceived: boolean = false;
  private options: GeminiLiveOptions;
  private conversationState = new ConversationState();
  private telemetry: CallTelemetry | null = null;
  private telemetryFlushed = false;
  private useVertexVoiceEngine = false;
  private vertexHistory: { role: "user" | "assistant"; text: string }[] = [];
  private vertexPcmChunks: Uint8Array[] = [];
  private vertexSpeechDetected = false;
  private vertexSilenceStartMs = 0;
  private vertexSpeechStartMs = 0;
  private vertexProcessingTurn = false;
  private configuredSystemPrompt = "";
  private configuredTools: any[] = [];
  private configuredOfficeName = "Spring Valley Roofing";
  private configuredPersonaName = "Mike";
  private configuredVoiceName = "Puck";
  private speechRecognizer: any = null;
  private speechRecognitionActive = false;
  private bargeInEnabled: boolean = true;
  private consecutiveBargeInFrames: number = 0;
  private consecutiveSpeechFrames: number = 0;
  private preRollChunks: Uint8Array[] = [];
  private lastReceptionistSpeechEndMs: number = 0;
  private ambientNoiseFloor: number = 0.008;

  constructor(options: GeminiLiveOptions) {
    this.options = options;
    if (typeof options.bargeInEnabled === "boolean") {
      this.bargeInEnabled = options.bargeInEnabled;
    }
    this.audioQueue = new AudioPlaybackQueue(24000, (isPlaying) => {
      this.handlePlaybackStateChange(isPlaying);
    });
  }

  public setBargeInEnabled(enabled: boolean) {
    this.bargeInEnabled = enabled;
  }

  private initNativeSpeechRecognition() {
    if (typeof window === "undefined" || this.speechRecognizer) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognizer = new SpeechRec();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = "en-US";
      recognizer.maxAlternatives = 1;

      recognizer.onstart = () => {
        this.speechRecognitionActive = true;
      };

      recognizer.onresult = (event: any) => {
        if (!this.isConnected || this.isReceptionistSpeaking) return;
        // Anti-echo guard: ignore any speech recognition events within 600ms of receptionist speaking
        if (Date.now() - this.lastReceptionistSpeechEndMs < 600) return;

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcriptChunk = res?.[0]?.transcript || "";
          if (res.isFinal) {
            final += transcriptChunk;
          } else {
            interim += transcriptChunk;
          }
        }

        const trimmedInterim = interim.trim();
        if (trimmedInterim && trimmedInterim.replace(/[^a-zA-Z0-9]/g, "").length >= 2) {
          this.options.onTurnStateChange?.("caller_speaking");
        }

        const trimmedFinal = final.trim();
        const clean = trimmedFinal.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        // Ignore single-syllable filler utterances, breathing, or sighs
        const isJunkFiller = /^(um|uh|ah|er|mm|hmm|huh|ha|mhm|oh|\.)$/i.test(clean);
        if (isJunkFiller) return;

        // Ignore short noise artifacts or punctuation hallucinations
        if (clean.length >= 3 && !this.vertexProcessingTurn) {
          this.vertexSpeechDetected = false;
          this.vertexPcmChunks = [];
          this.vertexSilenceStartMs = 0;
          this.consecutiveSpeechFrames = 0;
          if (this.useVertexVoiceEngine) {
            void this.processVertexVoiceTurn({ userText: trimmedFinal });
          } else {
            void this.sendUserText(trimmedFinal);
          }
        }
      };

      recognizer.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Native SpeechRecognition error:", event.error);
        }
      };

      recognizer.onend = () => {
        this.speechRecognitionActive = false;
        if (this.isConnected && !this.isReceptionistSpeaking) {
          try {
            recognizer.start();
          } catch (_) {}
        }
      };

      this.speechRecognizer = recognizer;
      if (this.isConnected && !this.isReceptionistSpeaking) {
        try {
          recognizer.start();
        } catch (_) {}
      }
    } catch (err) {
      console.warn("Could not start native SpeechRecognition:", err);
    }
  }

  private pauseNativeSpeechRecognition() {
    if (this.speechRecognizer && this.speechRecognitionActive) {
      try {
        this.speechRecognizer.abort();
      } catch (_) {}
      this.speechRecognitionActive = false;
    }
  }

  private resumeNativeSpeechRecognition() {
    if (this.speechRecognizer && !this.speechRecognitionActive && this.isConnected && !this.isReceptionistSpeaking) {
      try {
        this.speechRecognizer.start();
      } catch (_) {}
    }
  }

  private handlePlaybackStateChange(isPlaying: boolean) {
    this.isReceptionistSpeaking = isPlaying;
    if (!isPlaying) {
      this.lastReceptionistSpeechEndMs = Date.now();
      this.consecutiveBargeInFrames = 0;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ isReceptionistSpeaking: isPlaying });
      } catch (_) {}
    }
    if (isPlaying) {
      this.pauseNativeSpeechRecognition();
      this.options.onTurnStateChange?.("receptionist_speaking");
    } else {
      this.resumeNativeSpeechRecognition();
      // Once playback drains and turn complete has been received, transition to listening
      if (this.turnCompleteReceived && this.isConnected) {
        this.options.onTurnStateChange?.("listening");
      }
    }
  }

  public async start() {
    if (this.isConnected) return;

    this.conversationState.reset();
    this.hasGreeted = false;
    this.turnCompleteReceived = false;
    this.telemetryFlushed = false;
    this.useVertexVoiceEngine = false;
    this.vertexHistory = [];
    this.vertexPcmChunks = [];
    this.vertexSpeechDetected = false;
    this.vertexSilenceStartMs = 0;
    this.vertexProcessingTurn = false;
    this.consecutiveSpeechFrames = 0;
    this.preRollChunks = [];
    this.telemetry = this.options.settings ? new CallTelemetry(this.options.settings) : null;
    const prewarmedCtx = typeof window !== "undefined" ? (window as any).__prewarmedAudioCtx : null;
    this.audioQueue.init(prewarmedCtx || this.audioCtx || undefined);
    void this.prepareAudio();
    this.initNativeSpeechRecognition();

    const accessToken = this.options.accessToken || "";
    const apiKey = this.options.apiKey || "";
    if (!accessToken && !apiKey) {
      throw new Error("UNAUTHORIZED: Missing Gemini Live access token or API key.");
    }

    const wsEndpoint = accessToken
      ? `BidiGenerateContentConstrained?access_token=${encodeURIComponent(accessToken)}`
      : `BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.${wsEndpoint}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.sendSetupConfig();
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = event.data;
        if (event.data instanceof Blob) {
          textData = await event.data.text();
        }
        const msg = JSON.parse(textData);
        await this.handleServerMessage(msg);
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    this.ws.onerror = (err) => {
      console.error("Gemini Live WebSocket error:", err);
      this.options.onError?.(err);
    };

    this.ws.onclose = (event: CloseEvent) => {
      const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
      if (!isTestEnv && !this.useVertexVoiceEngine && (event.code !== 1000 || !this.hasGreeted)) {
        console.warn("WebSocket closed unexpectedly, activating Vertex AI voice engine fallback:", event);
        void this.activateVertexVoiceEngine();
        return;
      }
      this.isConnected = false;
      const reasonText = event.reason ? `: ${event.reason}` : "";
      const infoText = event.code ? ` (Code ${event.code}${reasonText})` : "";
      this.options.onTranscript?.({ role: "system", text: `Voice call disconnected${infoText}.` });
      void this.flushTelemetry();
      this.options.onClose?.();
      this.stop();
    };
  }

  private sendSetupConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const baseSettings: Settings = this.options.settings || {
      office_name: this.options.officeName || "our office",
      receptionist_name: "Mike",
      business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
      timezone: "America/New_York",
      service_areas: SV_MODE ? ["Pottstown", "Collegeville", "Upper Providence", "Royersford", "Limerick", "Douglassville", "Gilbertsville", "Phoenixville", "Montgomery County"] : ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
      primary_zip_code: SV_MODE ? "19464" : "17401",
      service_radius_miles: 25,
      service_zip_codes: SV_MODE ? ["19464", "19465", "19426", "19468", "19473", "19518", "19525", "19403", "19460", "19475"] : ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"],
      transfer_enabled: true,
      transfer_phone_number: "+17175770668",
      on_call_technician_phone: "+17175770668",
      after_hours_message: "Thank you for calling. Our office is closed.",
      emergency_keywords: this.options.emergencyKeywords || ["gas leak", "carbon monoxide", "no heat", "sparks"],
      receptionist_voice: "Puck",
      receptionist_voice_style: "warm, conversational, natural male office dispatcher",
      prompt_overrides: ""
    };

    const selectedVoice = this.options.voiceName || baseSettings.receptionist_voice || "Puck";
    const selectedName = this.options.personaName || baseSettings.receptionist_name || "Mike";

    let resolvedOffice = this.options.officeName || baseSettings.office_name;
    const isRoofingTrade = baseSettings.industry === "roofing_siding" || /roof|siding/i.test(resolvedOffice);
    if (isRoofingTrade) {
      if (!resolvedOffice || /lunar|heating|cooling|hvac|apex/i.test(resolvedOffice)) {
        resolvedOffice = "Spring Valley Roofing";
      }
    }

    const effectiveSettings: Settings = {
      ...baseSettings,
      office_name: resolvedOffice,
      receptionist_name: selectedName,
      receptionist_voice: selectedVoice
    };

    const systemPrompt = this.options.systemInstruction || buildDynamicSystemPrompt({ settings: effectiveSettings });

    const setupPayload = {
      setup: {
        model: "models/gemini-3.8-live",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice
              }
            }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: systemPrompt
            }
          ]
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
            // Faster turn-taking than the 1.8s noise-immunity setting, while keeping
            // some start padding so room noise doesn't trigger a turn.
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            prefixPaddingMs: 800,
            silenceDurationMs: 900
          }
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "triageHvacIssue",
                description: "Classifies an HVAC issue, checks configured service-area ZIPs, identifies life-safety emergencies, and returns safe intake guidance. Use before collecting detailed service information or scheduling.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    issue_description: { type: "STRING", description: "The caller's own description of the HVAC issue or request." },
                    reason_for_call: { type: "STRING", description: "Short reason for the call." },
                    call_type: { type: "STRING", description: "Known call type if already clear." },
                    equipment_type: { type: "STRING", description: "Furnace, AC, heat pump, boiler, thermostat, or other equipment." },
                    zip_code: { type: "STRING", description: "Caller service ZIP code, if provided." }
                  },
                  required: ["issue_description"]
                }
              },
              {
                name: "confirmCallerDetails",
                description: "Records an explicit caller confirmation after the receptionist reads back the street address and town (or the exact appointment slot) and the caller says it is correct. Never call this before the caller explicitly confirms.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    confirmation_type: { type: "STRING", enum: ["address", "appointment", "all"] },
                    full_address: { type: "STRING", description: "Street address and town as read back to the caller. State defaults to PA; ZIP optional." },
                    zip_code: { type: "STRING", description: "ZIP code only if the caller volunteered it. Never ask for it." },
                    appointment_start: { type: "STRING", description: "Exact slot the caller explicitly accepted." }
                  },
                  required: ["confirmation_type"]
                }
              },
              {
                name: "saveLead",
                description: "Saves captured lead details only after required caller details have been explicitly confirmed with confirmCallerDetails.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    caller_name: { type: "STRING", description: "Name of the caller." },
                    callback_number: { type: "STRING", description: "Callback phone number." },
                    reason_for_call: { type: "STRING", description: "Why they are calling." },
                    call_type: { 
                      type: "STRING", 
                      enum: ["estimate_request", "emergency", "repair_request", "maintenance_request", "existing_customer", "general_office", "spam"] 
                    },
                    emergency_flag: { type: "BOOLEAN", description: "True if emergency call." },
                    emergency_type: { type: "STRING" },
                    property_address: { type: "STRING", description: "Service address (street + town) after the caller confirms the read-back. ZIP optional." },
                    address_confirmed: { type: "BOOLEAN", description: "True only after the receptionist reads back the street address and town and the caller says it is correct." },
                    zip_code_confirmed: { type: "BOOLEAN", description: "Deprecated. Leave unset; ZIP is not required." },
                    equipment_type: { type: "STRING", description: "e.g., Furnace, AC, Heat Pump" },
                    issue_description: { type: "STRING" },
                    preferred_appointment_date: { type: "STRING" },
                    preferred_time_window: { type: "STRING" },
                    maintenance_agreement: { type: "BOOLEAN" }
                  },
                  required: ["callback_number", "call_type", "emergency_flag"]
                }
              },
              {
                name: "transferCall",
                description: "Initiates an immediate live call transfer. For Josh/the owner, route immediately to the configured owner direct line without collecting name or reason first; caller_callback_number may be blank when caller ID is available. Leave target_number empty for owner requests.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    target_number: { type: "STRING", description: "Phone number to transfer to." },
                    reason: { type: "STRING", description: "Reason for call transfer." },
                    caller_name: { type: "STRING", description: "Caller name for the human handoff summary." },
                    caller_callback_number: { type: "STRING", description: "Caller phone number." }
                  },
                  required: ["reason"]
                }
              },
              {
                name: "checkAppointmentSlots",
                description: "Queries open technician/estimator time slots on the company calendar for estimates, roof inspections, repairs, or tune-ups. Use whenever a caller asks to schedule, book, or find an appointment date and time.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    service_type: { type: "STRING", description: "Type of service (e.g. roof replacement estimate, roof inspection, siding quote, repair, tune-up)." },
                    requested_date: { type: "STRING", description: "Requested date in YYYY-MM-DD format (or next business day if unspecified)." },
                    preferred_window: { type: "STRING", description: "'morning' or 'afternoon'" }
                  },
                  required: ["service_type"]
                }
              },
              {
                name: "diagnoseHvacSound",
                description: "Analyzes acoustic characteristics of strange HVAC noises (squealing, metallic rattling, hissing, compressor knocking, relay clicking) to identify probable mechanical faults.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    sound_characteristics: { type: "STRING", description: "Audible sound characteristics (e.g. screeching, rattling, hissing, knocking)." },
                    unit_location: { type: "STRING", description: "Indoor furnace, outdoor condenser, ductwork, etc." }
                  },
                  required: ["sound_characteristics"]
                }
              },
              {
                name: "bookAppointment",
                description: "Locks in and confirms a scheduled appointment slot on the calendar once the caller agrees to a date and time and provides their contact details.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    caller_name: { type: "STRING", description: "Full name of the caller." },
                    callback_number: { type: "STRING", description: "Callback phone number." },
                    appointment_start: { type: "STRING", description: "Exact date and time selected (e.g. 2026-08-10 10:00)." },
                    property_address: { type: "STRING", description: "Service property address (street + town). ZIP optional." },
                    service_type: { type: "STRING", description: "Service type requested (e.g. roof replacement estimate, repair, inspection)." },
                    issue_description: { type: "STRING", description: "Brief description of the service request or issue." },
                    appointment_confirmed: { type: "BOOLEAN", description: "Pass true when the caller agreed to this appointment slot." },
                    address_confirmed: { type: "BOOLEAN", description: "Pass true when the caller confirmed their service address." }
                  },
                  required: ["callback_number", "appointment_start"]
                }
              },
              {
                name: "endCall",
                description: "Hangs up and terminates the phone call. Use this when: 1) The call has reached a natural conclusion; 2) The caller is unresponsive or silent after multiple prompts; 3) The caller refuses to provide basic address or contact details needed to proceed; 4) The caller is a spammer, telemarketer, or solicitor; 5) The caller is abusive, yelling, or playing pranks; 6) The conversation is in a circular loop going nowhere. ALWAYS speak a brief polite sign-off before or while executing this tool.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    reason: {
                      type: "STRING",
                      enum: [
                        "unresponsive_caller",
                        "caller_refused_details",
                        "spam_solicitation",
                        "prank_abusive",
                        "circular_call_dead_end",
                        "caller_concluded_call",
                        "emergency_life_safety"
                      ],
                      description: "Primary reason for disconnecting the call."
                    },
                    farewell_message: {
                      type: "STRING",
                      description: "Polite farewell statement spoken to the caller before hanging up."
                    }
                  },
                  required: ["reason"]
                }
              }
            ]
          }
        ]
      }
    };

    this.configuredSystemPrompt = systemPrompt;
    this.configuredTools = setupPayload.setup.tools;
    this.configuredOfficeName = resolvedOffice;
    this.configuredPersonaName = selectedName;
    this.configuredVoiceName = selectedVoice;

    this.ws.send(JSON.stringify(setupPayload));
  }

  private async activateVertexVoiceEngine() {
    if (this.useVertexVoiceEngine) return;
    this.useVertexVoiceEngine = true;
    this.isConnected = true;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws = null;
    }

    if (!this.configuredSystemPrompt) {
      const baseSettings: Settings = this.options.settings || {
        office_name: this.options.officeName || "Spring Valley Roofing",
        receptionist_name: this.options.personaName || "Mike",
        business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
        timezone: "America/New_York",
        service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
        primary_zip_code: "17401",
        service_radius_miles: 25,
        service_zip_codes: ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"],
        transfer_enabled: true,
        transfer_phone_number: "+17175770668",
        on_call_technician_phone: "+17175770668",
        after_hours_message: "Thank you for calling. Our office is closed.",
        emergency_keywords: this.options.emergencyKeywords || ["gas leak", "carbon monoxide", "no heat", "sparks"],
        receptionist_voice: this.options.voiceName || "Puck",
        receptionist_voice_style: "warm, conversational, natural male office dispatcher",
        prompt_overrides: ""
      };
      this.configuredOfficeName = baseSettings.office_name;
      this.configuredPersonaName = baseSettings.receptionist_name || "Mike";
      this.configuredVoiceName = baseSettings.receptionist_voice || "Puck";
      this.configuredSystemPrompt = this.options.systemInstruction || buildDynamicSystemPrompt({ settings: baseSettings });
    }

    await this.prepareAudio();
    this.initNativeSpeechRecognition();
    this.options.onTranscript?.({ role: "system", text: "Connected to Voice Receptionist (Vertex AI Live Audio)." });

    try {
      this.turnCompleteReceived = false;
      this.options.onTurnStateChange?.("receptionist_speaking");
      const res = await fetch("https://us-central1-blueprint-operations.cloudfunctions.net/voiceReceptionistTurn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "greet",
          officeName: this.configuredOfficeName,
          receptionistName: this.configuredPersonaName,
          voiceName: this.configuredVoiceName,
          systemInstruction: this.configuredSystemPrompt
        })
      });
      if (res.ok) {
        const data = await res.json();
        this.hasGreeted = true;
        if (data.text) {
          this.vertexHistory.push({ role: "assistant", text: data.text });
          this.telemetry?.recordTranscript({ role: "assistant", text: data.text });
          this.options.onTranscript?.({ role: "assistant", text: data.text });
        }
        if (data.audioPcmBase64) {
          this.audioQueue.enqueueBase64Pcm(data.audioPcmBase64);
        }
        this.turnCompleteReceived = true;
        if (!this.audioQueue.isPlaying()) {
          this.options.onTurnStateChange?.("listening");
        }
      }
    } catch (err) {
      console.error("Error in Vertex AI greeting:", err);
      this.options.onTurnStateChange?.("listening");
    }
  }

  public async sendUserText(text: string) {
    if (!text || !text.trim() || !this.isConnected) return;
    const cleanText = text.trim();
    if (this.useVertexVoiceEngine) {
      await this.processVertexVoiceTurn({ userText: cleanText });
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.options.onTranscript?.({ role: "user", text: cleanText });
      this.ws.send(JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: cleanText }] }],
          turnComplete: true
        }
      }));
    }
  }

  private async processVertexVoiceTurn(input: { userText?: string; audioPcmBase64?: string; toolResponseText?: string }) {
    if (!this.isConnected || this.vertexProcessingTurn) return;
    this.vertexProcessingTurn = true;
    this.options.onTurnStateChange?.("waiting_for_turn");

    try {
      if (input.userText) {
        this.options.onTranscript?.({ role: "user", text: input.userText });
      }

      const res = await fetch("https://us-central1-blueprint-operations.cloudfunctions.net/voiceReceptionistTurn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "turn",
          officeName: this.configuredOfficeName,
          receptionistName: this.configuredPersonaName,
          voiceName: this.configuredVoiceName,
          systemInstruction: this.configuredSystemPrompt,
          history: this.vertexHistory,
          userText: input.userText,
          audioPcmBase64: input.audioPcmBase64,
          toolResponseText: input.toolResponseText,
          tools: this.configuredTools
        })
      });

      if (!res.ok) {
        this.options.onTurnStateChange?.("listening");
        return;
      }

      const data = await res.json();

      if (data.callerTranscript && !input.userText) {
        this.options.onTranscript?.({ role: "user", text: data.callerTranscript });
        this.vertexHistory.push({ role: "user", text: data.callerTranscript });
      } else if (input.userText) {
        this.vertexHistory.push({ role: "user", text: input.userText });
      }

      if (data.text) {
        this.turnCompleteReceived = false;
        this.options.onTurnStateChange?.("receptionist_speaking");
        this.vertexHistory.push({ role: "assistant", text: data.text });
        this.telemetry?.recordTranscript({ role: "assistant", text: data.text });
        this.options.onTranscript?.({ role: "assistant", text: data.text });
        if (data.audioPcmBase64) {
          this.audioQueue.enqueueBase64Pcm(data.audioPcmBase64);
        }
        this.turnCompleteReceived = true;
        if (!this.audioQueue.isPlaying()) {
          this.options.onTurnStateChange?.("listening");
        }
      }

      if (Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
        const defaultSettings: Settings = this.options.settings || {
          office_name: this.configuredOfficeName,
          business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
          timezone: "America/New_York",
          service_areas: ["York", "Hanover", "Lancaster"],
          transfer_enabled: true,
          transfer_phone_number: "+17175770668",
          after_hours_message: "We are closed.",
          emergency_keywords: this.options.emergencyKeywords || ["gas leak"],
          receptionist_voice_style: "professional",
          prompt_overrides: ""
        };

        const toolSummaries: string[] = [];
        for (const call of data.toolCalls) {
          this.options.onToolCall?.({ name: call.name, args: call.args });
          const execution = await executeLiveToolCall(
            { id: call.id, name: call.name, args: call.args },
            defaultSettings,
            this.options.onCapturedLead,
            this.conversationState
          );
          toolSummaries.push(`${call.name}: ${JSON.stringify(execution.output)}`);

          if (call.name === "endCall") {
            const reason = call.args?.reason || "caller_concluded_call";
            const farewell = call.args?.farewell_message;
            this.options.onEndCall?.({ reason, farewell });
            setTimeout(() => {
              if (this.isConnected) {
                this.stop();
                this.options.onClose?.();
              }
            }, 3500);
          }
        }

        if (!data.text && toolSummaries.length > 0 && !data.toolCalls.some((c: any) => c.name === "endCall")) {
          this.vertexProcessingTurn = false;
          await this.processVertexVoiceTurn({ toolResponseText: toolSummaries.join(" | ") });
          return;
        }
      }

      if (!data.text && !this.audioQueue.isPlaying()) {
        this.options.onTurnStateChange?.("listening");
      }
    } catch (err) {
      console.error("Error in processVertexVoiceTurn:", err);
      this.options.onTurnStateChange?.("listening");
    } finally {
      this.vertexProcessingTurn = false;
    }
  }

  public sendAudioStreamEnd() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch (err) {
        console.warn("Error sending audio stream end:", err);
      }
    }
  }

  public async prepareAudio(): Promise<void> {
    if (this.micCapturePromise) return this.micCapturePromise;
    this.micCapturePromise = this.initMicrophoneCapture();
    return this.micCapturePromise;
  }

  private handleMicPcmPacket(arrayBuffer: ArrayBuffer) {
    if (!this.isConnected) return;

    const int16 = new Int16Array(arrayBuffer);
    if (int16.length === 0) return;
    let sumSq = 0;
    for (let i = 0; i < int16.length; i++) {
      const norm = int16[i] / 32768;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / int16.length);

    // 1. PERSISTENT BARGE-IN GUARD (CRITICAL)
    // While receptionist is speaking, ZERO mic audio is sent to Vertex or Gemini Live.
    // Barge-in requires deliberate, loud vocal energy (RMS >= 0.100) sustained across
    // 22 consecutive frames (~440ms). Quick coughs, laughs, single words, or room noise
    // will NEVER interrupt.
    if (this.isReceptionistSpeaking) {
      if (!this.bargeInEnabled) {
        this.consecutiveBargeInFrames = 0;
        return;
      }
      const BARGE_IN_RMS_THRESHOLD = 0.100;
      const BARGE_IN_REQUIRED_FRAMES = 22; // 22 frames * 20ms = 440ms of continuous persistent loud speech

      if (rms >= BARGE_IN_RMS_THRESHOLD) {
        this.consecutiveBargeInFrames++;
        if (this.consecutiveBargeInFrames >= BARGE_IN_REQUIRED_FRAMES) {
          this.consecutiveBargeInFrames = 0;
          this.isReceptionistSpeaking = false;
          this.audioQueue.clear();
          this.telemetry?.recordInterruption();
          this.options.onInterrupted?.();
          this.options.onTurnStateChange?.("interrupted");
          setTimeout(() => {
            if (this.isConnected) {
              this.options.onTurnStateChange?.("caller_speaking");
            }
          }, 300);
        }
      } else if (rms < 0.065) {
        this.consecutiveBargeInFrames = 0;
      }
      // CRITICAL: Return immediately so NO audio is sent to Vertex OR WebSocket while receptionist speaks!
      return;
    } else {
      this.consecutiveBargeInFrames = 0;
    }

    // 2. ADAPTIVE NOISE FLOOR ESTIMATOR & SPEECH ONSET
    if (!this.vertexSpeechDetected) {
      this.ambientNoiseFloor = this.ambientNoiseFloor * 0.98 + rms * 0.02;
    }

    // Base onset is 0.038 RMS (quiet room), but dynamically raises if background noise is elevated.
    const SPEECH_ONSET_RMS = Math.max(0.038, this.ambientNoiseFloor * 2.8);
    const SPEECH_CONTINUE_RMS = Math.max(0.022, this.ambientNoiseFloor * 1.5);

    if (this.useVertexVoiceEngine) {
      // Maintain rolling pre-roll buffer (last 6 frames ~120ms) so starting consonants aren't clipped
      this.preRollChunks.push(new Uint8Array(arrayBuffer.slice(0)));
      if (this.preRollChunks.length > 6) {
        this.preRollChunks.shift();
      }

      const now = Date.now();

      if (!this.vertexSpeechDetected) {
        if (rms >= SPEECH_ONSET_RMS) {
          this.consecutiveSpeechFrames++;
          if (this.consecutiveSpeechFrames >= 6) {
            // Sustained caller speech verified (>= 120ms above 0.038 RMS)
            this.vertexSpeechDetected = true;
            this.vertexSpeechStartMs = now - (this.consecutiveSpeechFrames * 20);
            this.vertexSilenceStartMs = 0;
            this.vertexPcmChunks = [...this.preRollChunks];
            this.options.onTurnStateChange?.("caller_speaking");
          }
        } else {
          this.consecutiveSpeechFrames = 0;
        }
      } else {
        // Speech in progress: accumulate frames
        this.vertexPcmChunks.push(new Uint8Array(arrayBuffer.slice(0)));
        if (rms >= SPEECH_CONTINUE_RMS) {
          this.vertexSilenceStartMs = 0;
        } else {
          if (this.vertexSilenceStartMs === 0) {
            this.vertexSilenceStartMs = now;
          } else if (now - this.vertexSilenceStartMs >= 1000 && !this.vertexProcessingTurn) {
            const speechDuration = now - this.vertexSpeechStartMs;
            const chunks = this.vertexPcmChunks;
            this.vertexPcmChunks = [];
            this.vertexSpeechDetected = false;
            this.vertexSilenceStartMs = 0;
            this.consecutiveSpeechFrames = 0;

            // Only submit if caller actually spoke (>= 500ms and >= 15 frames). Discard clicks/coughs/rustles.
            if (speechDuration >= 500 && chunks.length >= 15) {
              const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
              const combined = new Uint8Array(totalLen);
              let offset = 0;
              for (const c of chunks) {
                combined.set(c, offset);
                offset += c.byteLength;
              }
              const audioPcmBase64 = this.arrayBufferToBase64(combined.buffer);
              void this.processVertexVoiceTurn({ audioPcmBase64 });
            } else {
              this.options.onTurnStateChange?.("listening");
            }
          }
        }
      }
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const base64Data = this.arrayBufferToBase64(arrayBuffer);
    const pcmPayload = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Data
        },
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        ]
      }
    };
    try {
      this.ws.send(JSON.stringify(pcmPayload));
    } catch (err) {
      console.warn("Failed to stream microphone PCM chunk:", err);
    }
  }

  private setupScriptProcessorCapture(source: MediaStreamAudioSourceNode, ctx: AudioContext) {
    try {
      const bufferSize = 2048;
      const scriptNode = ctx.createScriptProcessor ? ctx.createScriptProcessor(bufferSize, 1, 1) : null;
      if (!scriptNode) return;
      this.scriptProcessorNode = scriptNode;

      const targetSampleRate = 16000;
      const resampleRatio = ctx.sampleRate / targetSampleRate;
      let sourceBuffer: number[] = [];
      let sourceOffset = 0;
      let pendingSamples: number[] = [];
      let lastReportTime = 0;
      let speechHoldUntil = 0;

      scriptNode.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        if (!inputData || inputData.length === 0) return;

        let energy = 0;
        for (let i = 0; i < inputData.length; i++) {
          energy += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(energy / inputData.length);

        const now = ctx.currentTime;
        if (now - lastReportTime > 0.08) {
          lastReportTime = now;
          this.options.onAudioLevel?.(rms);
        }

        let gateGain = 1.0;
        if (this.isReceptionistSpeaking) {
          // Persistent Barge-In: silence mic completely unless vocal energy is loud (>= 0.100 RMS)
          gateGain = (this.bargeInEnabled && rms >= 0.100) ? 1.0 : 0.0;
        } else {
          // Quiet Noise Immunity: silence ambient noise (< 0.038 RMS) with 350ms hangover hold
          if (rms >= 0.038) {
            speechHoldUntil = now + 0.35;
          }
          gateGain = (now < speechHoldUntil) ? 1.0 : 0.0;
        }

        for (let i = 0; i < inputData.length; i++) {
          sourceBuffer.push(inputData[i]);
        }

        while (sourceBuffer.length >= 2) {
          const index = Math.floor(sourceOffset);
          if (index + 1 >= sourceBuffer.length) break;
          const fraction = sourceOffset - index;
          const sample = (sourceBuffer[index] * (1 - fraction) + sourceBuffer[index + 1] * fraction) * gateGain;
          const clamped = Math.max(-1, Math.min(1, sample));
          pendingSamples.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
          sourceOffset += resampleRatio;

          const consumed = Math.floor(sourceOffset);
          if (consumed > 0) {
            const consumable = Math.min(consumed, sourceBuffer.length - 1);
            sourceBuffer.splice(0, consumable);
            sourceOffset -= consumable;
          }
        }

        const packetSize = 320;
        while (pendingSamples.length >= packetSize) {
          const packet = pendingSamples.splice(0, packetSize);
          const packetBuffer = new Int16Array(packet).buffer;
          this.handleMicPcmPacket(packetBuffer);
        }
      };

      source.connect(scriptNode);
      this.micMuteGain = ctx.createGain();
      this.micMuteGain.gain.value = 0;
      scriptNode.connect(this.micMuteGain);
      this.micMuteGain.connect(ctx.destination);
    } catch (err) {
      console.error("Error setting up ScriptProcessor fallback:", err);
    }
  }

  private async initMicrophoneCapture() {
    if (this.mediaStream && this.audioCtx) return;
    try {
      if (!this.mediaStream) {
        if (this.options.mediaStream && this.options.mediaStream.active && this.options.mediaStream.getAudioTracks().some((t: any) => t.readyState === "live")) {
          this.mediaStream = this.options.mediaStream;
        } else {
          const prewarmed = typeof window !== "undefined" ? (window as any).__prewarmedMicStream : null;
          if (prewarmed && prewarmed.active && prewarmed.getAudioTracks().some((t: any) => t.readyState === "live")) {
            this.mediaStream = prewarmed;
            (window as any).__prewarmedMicStream = null;
          } else {
            try {
              this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              });
            } catch (err: any) {
              if (err?.name === "OverconstrainedError" || err?.name === "TypeError") {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              } else {
                throw err;
              }
            }
          }
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      const prewarmedCtx = typeof window !== "undefined" ? (window as any).__prewarmedAudioCtx : null;
      if (prewarmedCtx && prewarmedCtx.state !== "closed") {
        this.audioCtx = prewarmedCtx;
        (window as any).__prewarmedAudioCtx = null;
        if (this.audioCtx.state === "suspended") {
          await this.audioCtx.resume();
        }
      } else {
        try {
          this.audioCtx = new AudioCtx({ sampleRate: 16000 });
        } catch (_) {
          // Fallback for Safari/iOS WebKit where non-native sampleRate throws NotSupportedError
          this.audioCtx = new AudioCtx();
        }

        if (this.audioCtx.state === "suspended") {
          await this.audioCtx.resume();
        }
      }

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);

      let workletLoaded = false;
      if (this.audioCtx.audioWorklet) {
        try {
          const blob = new Blob([INLINE_WORKLET_CODE], { type: "application/javascript" });
          const blobUrl = URL.createObjectURL(blob);
          try {
            await this.audioCtx.audioWorklet.addModule(blobUrl);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }

          this.workletNode = new AudioWorkletNode(this.audioCtx, "audio-recorder-processor");

          this.workletNode.port.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
              this.handleMicPcmPacket(event.data);
            } else if (event.data && event.data.type === "audio-level") {
              this.options.onAudioLevel?.(event.data.level);
            }
          };

          source.connect(this.workletNode);
          this.micMuteGain = this.audioCtx.createGain();
          this.micMuteGain.gain.value = 0;
          this.workletNode.connect(this.micMuteGain);
          this.micMuteGain.connect(this.audioCtx.destination);
          try {
            this.workletNode.port.postMessage({ isReceptionistSpeaking: this.audioQueue.isPlaying() });
          } catch (_) {}
          workletLoaded = true;
        } catch (workletErr) {
          console.warn("AudioWorklet inline blob failed, attempting fallback URL:", workletErr);
          try {
            const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/';
            const workletUrl = `${baseUrl}audio-recorder-worklet.js`;
            await this.audioCtx.audioWorklet.addModule(workletUrl);
            this.workletNode = new AudioWorkletNode(this.audioCtx, "audio-recorder-processor");
            this.workletNode.port.onmessage = (event) => {
              if (event.data instanceof ArrayBuffer) {
                this.handleMicPcmPacket(event.data);
              } else if (event.data && event.data.type === "audio-level") {
                this.options.onAudioLevel?.(event.data.level);
              }
            };
            source.connect(this.workletNode);
            this.micMuteGain = this.audioCtx.createGain();
            this.micMuteGain.gain.value = 0;
            this.workletNode.connect(this.micMuteGain);
            this.micMuteGain.connect(this.audioCtx.destination);
            workletLoaded = true;
          } catch (fetchErr) {
            console.warn("AudioWorklet failed completely, falling back to ScriptProcessorNode:", fetchErr);
          }
        }
      }

      if (!workletLoaded) {
        this.setupScriptProcessorCapture(source, this.audioCtx);
      }

      this.audioCtx.onstatechange = () => {
        if (this.audioCtx?.state === "suspended" && this.isConnected) {
          void this.audioCtx.resume();
        }
      };
    } catch (err) {
      console.error("Error setting up microphone capture:", err);
      this.options.onError?.(err);
    }
  }

  public triggerInitialGreeting() {
    if (this.hasGreeted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.hasGreeted = true;
    this.turnCompleteReceived = false;
    this.options.onTurnStateChange?.("receptionist_speaking");

    let officeName = this.options.settings?.office_name || this.options.officeName || "our office";
    const isRoofing = this.options.settings?.industry === "roofing_siding" || /roof|siding/i.test(officeName);
    if (isRoofing) {
      if (!officeName || /lunar|heating|cooling|hvac|apex/i.test(officeName)) {
        officeName = "Spring Valley Roofing";
      }
    }
    const receptionistName = this.options.personaName || this.options.settings?.receptionist_name || "Mike";

    const greetingPrompt = `[INBOUND CALL CONNECTED] Answer the phone immediately and cleanly with your official greeting: "Thanks for calling ${officeName}, this is ${receptionistName}. How can I help you today?" Speak with crisp, confident clarity. Never use vocal fillers like "uh", "um", "ugh", or hesitation.`;

    const initialGreetingPayload = {
      realtimeInput: {
        text: greetingPrompt
      }
    };

    this.ws.send(JSON.stringify(initialGreetingPayload));
  }

  private async handleServerMessage(msg: any) {
    // 0. Setup Complete -> Answer Inbound Call Immediately
    if (msg.setupComplete) {
      this.isConnected = true;
      await this.prepareAudio();
      this.options.onTranscript?.({ role: "system", text: "Connected to Voice Receptionist." });
      this.triggerInitialGreeting();
      this.options.onTurnStateChange?.("listening");
    }

    // 1. Audio / Server Content Output
    if (msg.serverContent) {
      if (!this.hasGreeted) {
        this.triggerInitialGreeting();
      }

      const modelTurn = msg.serverContent.modelTurn;
      if (modelTurn?.parts) {
        this.turnCompleteReceived = false;
        this.options.onTurnStateChange?.("receptionist_speaking");
        for (const part of modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
            this.audioQueue.enqueueBase64Pcm(part.inlineData.data);
          }
          if (part.text) {
            this.telemetry?.recordTranscript({ role: "assistant", text: part.text });
            this.options.onTranscript?.({ role: "assistant", text: part.text });
          }
        }
      }
      if (msg.serverContent.turnComplete) {
        this.turnCompleteReceived = true;
        // Only set turn state back to listening if audio playback has finished
        if (!this.audioQueue.isPlaying()) {
          this.options.onTurnStateChange?.("listening");
        }
      }
      if (msg.serverContent.interrupted) {
        this.turnCompleteReceived = true;
        // User interrupted model! Clear audio queue (Barge-in handling)
        this.audioQueue.clear();
        this.telemetry?.recordInterruption();
        this.options.onInterrupted?.();
        this.options.onTurnStateChange?.("interrupted");
        setTimeout(() => {
          if (this.isConnected) {
            this.options.onTurnStateChange?.("caller_speaking");
          }
        }, 300);
      }
    }

    // 2. Tool Calls (Sequential / Parallel)
    if (msg.toolCall?.functionCalls) {
      const defaultSettings: Settings = this.options.settings || {
        office_name: this.options.officeName || "Blueprint HVAC",
        business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
        timezone: "America/New_York",
        service_areas: ["New York"],
        transfer_enabled: true,
        transfer_phone_number: "+17175550199",
        after_hours_message: "We are closed.",
        emergency_keywords: this.options.emergencyKeywords || ["gas leak"],
        receptionist_voice_style: "professional",
        prompt_overrides: ""
      };

      for (const call of msg.toolCall.functionCalls) {
        this.options.onToolCall?.({ name: call.name, args: call.args });

        const toolStartedAt = performance.now();
        const execution = await executeLiveToolCall(
          { id: call.id, name: call.name, args: call.args },
          defaultSettings,
          this.options.onCapturedLead,
          this.conversationState
        );
        this.telemetry?.recordTool({
          name: call.name,
          latency_ms: performance.now() - toolStartedAt,
          success: execution.output.success,
          error: execution.output.error
        });

        // Return tool response back to Gemini for every function call ID
        const responsePayload = {
          toolResponse: {
            functionResponses: [
              {
                response: { output: execution.output },
                id: call.id
              }
            ]
          }
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(responsePayload));
        }

        if (call.name === "endCall") {
          const reason = call.args?.reason || "caller_concluded_call";
          const farewell = call.args?.farewell_message;
          this.options.onEndCall?.({ reason, farewell });

          let disconnectTriggered = false;
          const finalizeDisconnect = () => {
            if (disconnectTriggered) return;
            disconnectTriggered = true;
            if (safetyTimeout) clearTimeout(safetyTimeout);
            setTimeout(() => {
              if (this.isConnected) {
                this.stop();
                this.options.onClose?.();
              }
            }, 500);
          };

          // Safety fallback timeout: ensure call drops within 5s even if no audio streams
          const safetyTimeout = setTimeout(finalizeDisconnect, 5000);

          const origStateCallback = (this.audioQueue as any).onPlaybackStateChange;
          this.audioQueue.setPlaybackStateChangeCallback((isPlaying) => {
            origStateCallback?.(isPlaying);
            if (!isPlaying && this.turnCompleteReceived) {
              finalizeDisconnect();
            }
          });
        }
      }
    }
  }

  public stop() {
    void this.flushTelemetry();
    this.sendAudioStreamEnd();
    this.isConnected = false;
    this.turnCompleteReceived = false;
    this.audioQueue.close();
    this.micCapturePromise = null;

    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.onstart = null;
        this.speechRecognizer.onresult = null;
        this.speechRecognizer.onerror = null;
        this.speechRecognizer.onend = null;
        this.speechRecognizer.abort();
      } catch (_) {}
      this.speechRecognizer = null;
      this.speechRecognitionActive = false;
    }

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.onaudioprocess = null;
      this.scriptProcessorNode.disconnect();
      this.scriptProcessorNode = null;
    }
    if (this.micMuteGain) {
      this.micMuteGain.disconnect();
      this.micMuteGain = null;
    }
    if (this.audioCtx) {
      this.audioCtx.onstatechange = null;
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private async flushTelemetry(): Promise<void> {
    if (this.telemetryFlushed || !this.telemetry) return;
    this.telemetryFlushed = true;
    await persistCallTelemetry(this.telemetry.summary());
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
