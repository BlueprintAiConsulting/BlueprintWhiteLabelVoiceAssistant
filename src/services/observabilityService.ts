import { Settings } from "../types.ts";
import { auth, db, addDoc, collection, serverTimestamp } from "../firebase.ts";

export interface ToolTelemetry {
  name: string;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface CallTelemetrySummary {
  session_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  interruption_count: number;
  tool_calls: ToolTelemetry[];
  transcript: { role: "user" | "assistant" | "system"; text: string }[];
  retention_expires_at: string;
}

function maskPhone(text: string): string {
  return text.replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g, "<PHONE>");
}

function maskEmail(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<EMAIL>");
}

function maskStreetAddress(text: string): string {
  return text.replace(/\b\d{1,6}\s+[A-Za-z0-9 .'-]+\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|way)\b/gi, "<ADDRESS>");
}

/** Redacts common PII before telemetry or transcript retention. */
export function redactSensitiveText(value: string): string {
  return maskStreetAddress(maskEmail(maskPhone(value))).replace(/\b\d{5}(?:-\d{4})?\b/g, "<ZIP>");
}

export function retentionExpiresAt(startedAt: string, settings: Settings): string {
  const retentionDays = Math.max(1, settings.recording_retention_days || 30);
  const expiry = new Date(startedAt);
  expiry.setUTCDate(expiry.getUTCDate() + retentionDays);
  return expiry.toISOString();
}

export class CallTelemetry {
  private readonly sessionId: string;
  private readonly startedAt: string;
  private readonly settings: Settings;
  private interruptions = 0;
  private tools: ToolTelemetry[] = [];
  private transcript: CallTelemetrySummary["transcript"] = [];

  constructor(settings: Settings, sessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) {
    this.sessionId = sessionId;
    this.startedAt = new Date().toISOString();
    this.settings = settings;
  }

  recordTranscript(entry: CallTelemetrySummary["transcript"][number]): void {
    this.transcript.push({ ...entry, text: redactSensitiveText(entry.text) });
  }

  recordInterruption(): void {
    this.interruptions += 1;
  }

  recordTool(tool: ToolTelemetry): void {
    this.tools.push({ ...tool, latency_ms: Math.max(0, Math.round(tool.latency_ms)) });
  }

  summary(endedAt = new Date().toISOString()): CallTelemetrySummary {
    return {
      session_id: this.sessionId,
      started_at: this.startedAt,
      ended_at: endedAt,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(this.startedAt).getTime()),
      interruption_count: this.interruptions,
      tool_calls: [...this.tools],
      transcript: [...this.transcript],
      retention_expires_at: retentionExpiresAt(this.startedAt, this.settings)
    };
  }
}

/** Persists only redacted telemetry and never blocks call completion. */
export async function persistCallTelemetry(summary: CallTelemetrySummary): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    const ref = await addDoc(collection(db, "call_telemetry"), {
      ...summary,
      created_by: auth.currentUser.uid,
      created_at: serverTimestamp()
    });
    return ref.id;
  } catch (error) {
    console.warn("Call telemetry persistence failed:", error);
    return null;
  }
}

