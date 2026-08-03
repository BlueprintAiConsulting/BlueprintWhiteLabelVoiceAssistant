import { AudioPlaybackQueue } from "../lib/audioPlaybackQueue.ts";
import { processLead } from "./geminiService.ts";
import { Lead } from "../types.ts";

export interface GeminiLiveOptions {
  apiKey: string;
  officeName?: string;
  emergencyKeywords?: string[];
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

    const apiKey = this.options.apiKey;
    if (!apiKey || apiKey.includes("dummy")) {
      throw new Error("Invalid or missing Gemini API Key");
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

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

    this.ws.onclose = () => {
      this.isConnected = false;
      this.options.onTranscript?.({ role: "system", text: "Voice call disconnected." });
      this.options.onClose?.();
      this.stop();
    };
  }

  private sendSetupConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const officeName = this.options.officeName || "Blueprint AI HVAC";
    const emergencyKeywords = (this.options.emergencyKeywords || ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke"]).join(", ");

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
              text: `You are the friendly, concise front-desk HVAC receptionist for ${officeName}. Answer calls naturally, identify the caller's request, collect essential details (Name, Phone, Address, Equipment Type, Issue), and identify emergencies immediately (Keywords: ${emergencyKeywords}). When core info is obtained, execute the saveLead tool.`
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
