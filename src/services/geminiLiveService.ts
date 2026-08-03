import { AudioPlaybackQueue } from "../lib/audioPlaybackQueue.ts";
import { processLead } from "./geminiService.ts";
import { Lead, Settings } from "../types.ts";
import { executeLiveToolCall } from "./liveToolDispatcher.ts";
import { buildDynamicSystemPrompt } from "./livePromptBuilder.ts";

export interface GeminiLiveOptions {
  accessToken?: string;
  apiKey?: string;
  officeName?: string;
  emergencyKeywords?: string[];
  systemInstruction?: string;
  settings?: Settings;
  onTranscript?: (entry: { role: "user" | "assistant" | "system"; text: string }) => void;
  onToolCall?: (toolInfo: { name: string; args: any }) => void;
  onCapturedLead?: (lead: Partial<Lead>) => void;
  onTurnStateChange?: (state: "listening" | "caller_speaking" | "receptionist_speaking" | "interrupted" | "waiting_for_turn") => void;
  onInterrupted?: () => void;
  onError?: (err: any) => void;
  onClose?: () => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private audioQueue: AudioPlaybackQueue;
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isConnected: boolean = false;
  private hasGreeted: boolean = false;
  private options: GeminiLiveOptions;

  constructor(options: GeminiLiveOptions) {
    this.options = options;
    this.audioQueue = new AudioPlaybackQueue(24000);
  }

  public async start() {
    if (this.isConnected) return;

    this.audioQueue.init();

    const accessToken = this.options.accessToken || "";
    if (!accessToken) {
      throw new Error("UNAUTHORIZED: Missing Gemini Live access_token. Please log in to request a token.");
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${accessToken}`;

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
      this.options.onClose?.();
      this.stop();
    };
  }

  private sendSetupConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const defaultSettings: Settings = this.options.settings || {
      office_name: this.options.officeName || "Lunar Heating and Cooling",
      business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
      timezone: "America/New_York",
      service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
      primary_zip_code: "17401",
      service_radius_miles: 25,
      service_zip_codes: ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"],
      transfer_enabled: true,
      transfer_phone_number: "+17175770668",
      on_call_technician_phone: "+17175770668",
      after_hours_message: "Thank you for calling Lunar Heating and Cooling. Our office is closed.",
      emergency_keywords: this.options.emergencyKeywords || ["gas leak", "carbon monoxide", "no heat", "sparks"],
      receptionist_voice: "Kore",
      receptionist_voice_style: "warm, concise, natural female office receptionist",
      prompt_overrides: ""
    };

    // Enforce female receptionist voice ("Kore") unconditionally for voice call mode
    let selectedVoice = defaultSettings.receptionist_voice || "Kore";
    if (selectedVoice === "Puck" || selectedVoice === "Charon" || selectedVoice === "Fenrir" || !selectedVoice) {
      selectedVoice = "Kore";
    }
    const systemPrompt = this.options.systemInstruction || buildDynamicSystemPrompt({ settings: defaultSettings });

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
            prefixPaddingMs: 300,
            silenceDurationMs: 700
          }
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "saveLead",
                description: "Saves the captured lead details to the database.",
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
                    property_address: { type: "STRING" },
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
                description: "Initiates an immediate live call transfer to the business owner when the caller asks for Josh/the owner, or to an on-call technician for emergencies and specialist requests. Leave target_number empty for owner requests so routing uses the configured owner number.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    target_number: { type: "STRING", description: "Phone number to transfer to." },
                    reason: { type: "STRING", description: "Reason for call transfer." },
                    caller_callback_number: { type: "STRING", description: "Caller phone number." }
                  },
                  required: ["reason", "caller_callback_number"]
                }
              },
              {
                name: "checkAppointmentSlots",
                description: "Queries available technician time slots for estimates, repairs, or seasonal tune-ups.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    service_type: { type: "STRING", description: "Type of service." },
                    requested_date: { type: "STRING", description: "Requested date." },
                    preferred_window: { type: "STRING", description: "'morning' or 'afternoon'" }
                  },
                  required: ["service_type"]
                }
              },
              {
                name: "bookAppointment",
                description: "Books a confirmed HVAC technician appointment slot after caller agreement.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    caller_name: { type: "STRING", description: "Name of the caller." },
                    callback_number: { type: "STRING", description: "Callback phone number." },
                    appointment_start: { type: "STRING", description: "Exact date and time selected (e.g. 2026-08-10 10:00)." },
                    property_address: { type: "STRING", description: "Property address for service." },
                    service_type: { type: "STRING", description: "Service type requested." },
                    issue_description: { type: "STRING" }
                  },
                  required: ["callback_number", "appointment_start"]
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

  private async initMicrophoneCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx({ sampleRate: 16000 });

      // Add audio recorder worklet
      const workletUrl = `${import.meta.env.BASE_URL}audio-recorder-worklet.js`.replace(/\/\//g, '/');
      await this.audioCtx.audioWorklet.addModule(workletUrl);

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioCtx, "audio-recorder-processor");

      this.workletNode.port.onmessage = (event) => {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const arrayBuffer = event.data;
        const base64Data = this.arrayBufferToBase64(arrayBuffer);

        const pcmPayload = {
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Data
            }
          }
        };

        this.ws.send(JSON.stringify(pcmPayload));
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioCtx.destination);
    } catch (err) {
      console.error("Error setting up microphone worklet capture:", err);
      this.options.onError?.(err);
    }
  }

  public triggerInitialGreeting() {
    if (this.hasGreeted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.hasGreeted = true;
    this.options.onTurnStateChange?.("receptionist_speaking");
    const initialGreetingPayload = {
      realtimeInput: {
        text: "[INBOUND CALL CONNECTED] Answer the phone now with your natural greeting."
      }
    };

    this.ws.send(JSON.stringify(initialGreetingPayload));
  }

  private async handleServerMessage(msg: any) {
    // 0. Setup Complete -> Answer Inbound Call Immediately
    if (msg.setupComplete) {
      this.isConnected = true;
      await this.initMicrophoneCapture();
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
        this.options.onTurnStateChange?.("receptionist_speaking");
        for (const part of modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
            this.audioQueue.enqueueBase64Pcm(part.inlineData.data);
          }
          if (part.text) {
            this.options.onTranscript?.({ role: "assistant", text: part.text });
          }
        }
      }
      if (msg.serverContent.turnComplete) {
        this.options.onTurnStateChange?.("listening");
      }
      if (msg.serverContent.interrupted) {
        // User interrupted model! Clear audio queue (Barge-in handling)
        this.audioQueue.clear();
        this.options.onInterrupted?.();
        this.options.onTurnStateChange?.("interrupted");
        setTimeout(() => this.options.onTurnStateChange?.("caller_speaking"), 300);
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

        const execution = await executeLiveToolCall(
          { id: call.id, name: call.name, args: call.args },
          defaultSettings,
          this.options.onCapturedLead
        );

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
      }
    }
  }

  public stop() {
    this.sendAudioStreamEnd();
    this.isConnected = false;
    this.audioQueue.close();

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioCtx) {
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
