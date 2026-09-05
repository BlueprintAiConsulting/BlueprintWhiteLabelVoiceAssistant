import { AudioPlaybackQueue } from "../lib/audioPlaybackQueue.ts";
import { processLead } from "./geminiService.ts";
import { Lead, Settings } from "../types.ts";
import { executeLiveToolCall } from "./liveToolDispatcher.ts";
import { buildDynamicSystemPrompt } from "./livePromptBuilder.ts";
import { ConversationState } from "./conversationState.ts";
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
}

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

  constructor(options: GeminiLiveOptions) {
    this.options = options;
    this.audioQueue = new AudioPlaybackQueue(24000, (isPlaying) => {
      this.handlePlaybackStateChange(isPlaying);
    });
  }

  private handlePlaybackStateChange(isPlaying: boolean) {
    this.isReceptionistSpeaking = isPlaying;
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ isReceptionistSpeaking: isPlaying });
      } catch (_) {}
    }
    if (isPlaying) {
      this.options.onTurnStateChange?.("receptionist_speaking");
    } else {
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
    this.telemetry = this.options.settings ? new CallTelemetry(this.options.settings) : null;
    this.audioQueue.init();
    void this.prepareAudio();

    const accessToken = this.options.accessToken || "";
    const apiKey = this.options.apiKey || "";
    if (!accessToken && !apiKey) {
      throw new Error("UNAUTHORIZED: Missing Gemini Live access token or API key.");
    }

    const authQuery = accessToken ? `access_token=${accessToken}` : `key=${apiKey}`;
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?${authQuery}`;

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
      receptionist_name: "Megan",
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
      receptionist_voice: "Aoede",
      receptionist_voice_style: "warm, concise, natural office receptionist",
      prompt_overrides: ""
    };

    const selectedVoice = this.options.voiceName || baseSettings.receptionist_voice || "Aoede";
    const selectedName = this.options.personaName || baseSettings.receptionist_name || "Sarah";

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
        model: "models/gemini-3.1-flash-live-preview",
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
            endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
            // Require sustained medium-level speech before a barge-in is
            // committed; low room noise should not cut off Megan mid-sentence.
            prefixPaddingMs: 1000,
            // Allow 1.6 seconds of natural pause/noise so addresses, ZIP codes,
            // and second-turn answers finish before Gemini closes the turn.
            silenceDurationMs: 1600
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
                description: "Records an explicit caller confirmation after the receptionist reads back the full address/ZIP or the exact appointment slot and the caller says it is correct. Never call this before the caller explicitly confirms.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    confirmation_type: { type: "STRING", enum: ["address", "appointment", "all"] },
                    full_address: { type: "STRING", description: "Complete street address, city, state, and ZIP as read back to the caller." },
                    zip_code: { type: "STRING", description: "ZIP code repeated digit by digit." },
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
                    property_address: { type: "STRING", description: "Full service address only after the caller confirms the complete read-back, including ZIP code." },
                    address_confirmed: { type: "BOOLEAN", description: "True only after the receptionist reads back the complete street address, city, state, and ZIP and the caller says it is correct." },
                    zip_code_confirmed: { type: "BOOLEAN", description: "True only after the receptionist repeats every ZIP digit and the caller confirms it." },
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
                    property_address: { type: "STRING", description: "Full service property address including ZIP code." },
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

    this.ws.send(JSON.stringify(setupPayload));
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
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const base64Data = this.arrayBufferToBase64(arrayBuffer);
    const pcmPayload = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Data
        }
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
          gateGain = rms >= 0.045 ? 1.0 : 0.0;
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
          const workletUrl = `${import.meta.env.BASE_URL}audio-recorder-worklet.js`.replace(/\/\//g, '/');
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
          try {
            this.workletNode.port.postMessage({ isReceptionistSpeaking: this.audioQueue.isPlaying() });
          } catch (_) {}
          workletLoaded = true;
        } catch (workletErr) {
          console.warn("AudioWorklet failed to load or unsupported, falling back to ScriptProcessorNode:", workletErr);
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
    const receptionistName = this.options.personaName || this.options.settings?.receptionist_name || "Megan";

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
