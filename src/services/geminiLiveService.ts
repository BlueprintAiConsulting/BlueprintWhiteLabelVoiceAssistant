import { AudioPlaybackQueue } from "../lib/audioPlaybackQueue.ts";
import { processLead } from "./geminiService.ts";
import { Lead } from "../types.ts";

export interface GeminiLiveOptions {
  apiKey: string;
  officeName?: string;
  emergencyKeywords?: string[];
  systemInstruction?: string;
  onTranscript?: (entry: { role: "user" | "assistant" | "system"; text: string }) => void;
  onToolCall?: (toolInfo: { name: string; args: any }) => void;
  onCapturedLead?: (lead: Partial<Lead>) => void;
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
  private options: GeminiLiveOptions;

  constructor(options: GeminiLiveOptions) {
    this.options = options;
    this.audioQueue = new AudioPlaybackQueue(24000);
  }

  public async start() {
    if (this.isConnected) return;

    this.audioQueue.init();

    const cleanApiKey = apiKey.replace(/['"]/g, '').trim();
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${cleanApiKey}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = async () => {
      this.isConnected = true;
      this.sendSetupConfig();
      await this.initMicrophoneCapture();
      this.options.onTranscript?.({ role: "system", text: "Connected to Voice Receptionist." });
    };

    this.ws.onmessage = async (event) => {
      try {
        let textData = event.data;
        if (event.data instanceof Blob) {
          textData = await event.data.text();
        }
        const msg = JSON.parse(textData);
        this.handleServerMessage(msg);
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

    const officeName = this.options.officeName || "Lunar Heating and Cooling";
    const emergencyKeywords = (this.options.emergencyKeywords || ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"]).join(", ");

    const systemPrompt = this.options.systemInstruction || `
      You are the front desk receptionist for ${officeName}.
      Your goal is to handle inbound calls efficiently, identify the reason for the call, and collect ONLY essential details for follow-up.
      
      TONE & STYLE:
      - Professional, warm, and helpful office staff.
      - Be concise. Don't use repetitive filler phrases.
      - Sound like a natural human on the phone.
      - Ask ONE question at a time.
      
      INTAKE LOGIC:
      - NEW ESTIMATE: Name, Phone, Address, Equipment Type (Furnace, AC, Heat Pump, Boiler), Preferred Date/Time.
      - EMERGENCY: Phone FIRST, then Address, then description.
      - REPAIR: Name, Phone, Address, Issue, Equipment Type, Preferred Date/Time.
      - MAINTENANCE: Name, Phone, Address, Equipment Type, Maintenance Agreement status.
      - EXISTING CUSTOMER / GENERAL / SPAM: Name, Phone, Reason for call.
      
      EMERGENCY CRITERIA:
      - Gas leaks, carbon monoxide, no heat in freezing weather, sparks/smoke, or major water leaks.
      - Emergency keywords: ${emergencyKeywords}.
      
      ENDING:
      - Confirm next steps clearly. Execute 'saveLead' tool as soon as core information is collected.
    `;

    const setupPayload = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Puck"
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
                description: "Initiates an immediate live call transfer to an on-call technician or phone extension when an emergency is detected or caller requests live specialist.",
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
              }
            ]
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(setupPayload));
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
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64Data
              }
            ]
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

  private handleServerMessage(msg: any) {
    // 1. Audio / Server Content Output
    if (msg.serverContent) {
      const modelTurn = msg.serverContent.modelTurn;
      if (modelTurn?.parts) {
        for (const part of modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
            this.audioQueue.enqueueBase64Pcm(part.inlineData.data);
          }
          if (part.text) {
            this.options.onTranscript?.({ role: "assistant", text: part.text });
          }
        }
      }
      if (msg.serverContent.interrupted) {
        // User interrupted model! Clear audio queue (Barge-in handling)
        this.audioQueue.clear();
      }
    }

    // 2. Tool Calls
    if (msg.toolCall?.functionCalls) {
      for (const call of msg.toolCall.functionCalls) {
        this.options.onToolCall?.({ name: call.name, args: call.args });
        if (call.name === "saveLead") {
          this.options.onCapturedLead?.(call.args);
          processLead(call.args);

          // Return tool response back to Gemini
          const responsePayload = {
            toolResponse: {
              functionResponses: [
                {
                  response: { output: { success: true } },
                  id: call.id
                }
              ]
            }
          };
          this.ws?.send(JSON.stringify(responsePayload));
        }
      }
    }
  }

  public stop() {
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
