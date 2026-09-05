import React, { useState, useEffect, useRef } from "react";
import { createReceptionistChat, processLead, triggerMissedCallTextBack, getSettings, saveLocalSettings, getLocalSavedSettings } from "../services/geminiService.ts";
import { db, doc, setDoc } from "../firebase.ts";
import { getSettingsForIndustry } from "../services/industryPresets.ts";
import { GeminiLiveSession } from "../services/geminiLiveService.ts";
import { requestGeminiEphemeralToken } from "../services/ephemeralTokenService.ts";
import { auth } from "../firebase.ts";
import { TranscriptEntry, Lead } from "../types.ts";
import { buildHumanEscalationPlan } from "../services/humanEscalationService.ts";
import { callTransferAudioFX } from "../lib/callTransferAudioFX.ts";
import { INDUSTRY_PRESETS, IndustryType } from "../services/industryPresets.ts";
import { Phone, PhoneOff, Send, AlertCircle, Clock, User, Home, HelpCircle, ShieldAlert, Mic, MicOff, X, MessageSquare, Sparkles, Activity, Zap, Cpu, Volume2, UserCheck, PhoneCall, Radio, CloudRain, Layers, Droplets, Trees, Wind } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}



export default function Simulator() {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [capturedLead, setCapturedLead] = useState<Partial<Lead> | null>(null);
  const [chat, setChat] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<{ name: string; args: any }[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [transferDetails, setTransferDetails] = useState<{ target: string; reason: string; status: string } | null>(null);
  const [activeVoiceName, setActiveVoiceName] = useState("Aoede");
  const [activePersonaName, setActivePersonaName] = useState("Sarah");
  const [activeIndustry, setActiveIndustry] = useState<IndustryType>("hvac");
  const [settings, setSettings] = useState<any>(null);
  const [smsToast, setSmsToast] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"call" | "scenarios" | "telemetry">("call");
  const [callerAudioLevel, setCallerAudioLevel] = useState<number>(0);
  const [micPermissionModalOpen, setMicPermissionModalOpen] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<"denied" | "unsupported" | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const sanitizeRoofing = (cfg: any) => {
      if (cfg && cfg.industry === "roofing_siding") {
        if (!cfg.office_name || /lunar|heating|cooling|hvac|apex/i.test(cfg.office_name)) {
          cfg.office_name = "Spring Valley Roofing";
        }
      }
      return cfg;
    };

    // 1. Instantly read local settings for zero-flicker render
    const local = getLocalSavedSettings();
    if (local) {
      sanitizeRoofing(local);
      setSettings(local);
      if (local.industry) setActiveIndustry(local.industry);
      if (local.receptionist_voice) setActiveVoiceName(local.receptionist_voice);
      if (local.receptionist_name) setActivePersonaName(local.receptionist_name);
    }

    getSettings().then((s) => {
      sanitizeRoofing(s);
      setSettings(s);
      if (s.industry) setActiveIndustry(s.industry);
      if (s.receptionist_voice) setActiveVoiceName(s.receptionist_voice);
      if (s.receptionist_name) setActivePersonaName(s.receptionist_name);
    }).catch(() => {});

    const handleSettingsUpdated = (e: any) => {
      const updated = e.detail;
      if (updated) {
        sanitizeRoofing(updated);
        setSettings(updated);
        if (updated.industry) setActiveIndustry(updated.industry);
        if (updated.receptionist_voice) setActiveVoiceName(updated.receptionist_voice);
        if (updated.receptionist_name) setActivePersonaName(updated.receptionist_name);
      }
    };
    window.addEventListener("settings-updated", handleSettingsUpdated);
    return () => window.removeEventListener("settings-updated", handleSettingsUpdated);
  }, []);

  const handleSwitchTrade = async (trade: IndustryType) => {
    setActiveIndustry(trade);
    const current = settings || await getSettings();
    const updated = getSettingsForIndustry(trade, current);
    if (trade === "roofing_siding" && (!updated.office_name || /lunar|heating|cooling|hvac|apex/i.test(updated.office_name))) {
      updated.office_name = "Spring Valley Roofing";
    }
    setSettings(updated);
    saveLocalSettings(updated);
    if (updated.receptionist_voice) setActiveVoiceName(updated.receptionist_voice);
    if (updated.receptionist_name) setActivePersonaName(updated.receptionist_name);

    try {
      if (auth.currentUser) {
        await setDoc(doc(db, "settings", "config"), updated, { merge: true });
      }
    } catch (e) {
      console.warn("Could not sync to cloud, saved locally:", e);
    }
  };

  const scrollToBottom = () => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcript]);

  useEffect(() => {
    if (isCalling) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCalling]);

  useEffect(() => {
    return () => {
      callTransferAudioFX.stopRingback();
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCall = async (initialPrompt?: string) => {
    if (isCalling) endCall();
    
    setMobileTab("call");
    setIsLoading(true);
    try {
      const activeConf = getSettingsForIndustry(activeIndustry, settings || await getSettings());
      if (activeIndustry === "roofing_siding" && (!activeConf.office_name || /lunar|heating|cooling|hvac|apex/i.test(activeConf.office_name))) {
        activeConf.office_name = "Spring Valley Roofing";
      }
      const newChat = await createReceptionistChat(activeConf);
      setChat(newChat);
      setIsCalling(true);
      setTranscript([]);
      setDebugInfo([]);
      setCapturedLead(null);
      setTransferDetails(null);

      const officeName = activeConf.office_name || "our office";
      const response = await newChat.sendMessage({ message: `Hello, I'm calling ${officeName}.` });
      setTranscript([{ role: "assistant", text: response.text }]);
      
      if (initialPrompt) {
        setTimeout(() => handleSendMessage(initialPrompt, newChat), 500);
      }
    } catch (error) {
      console.error("Error starting call:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const [turnState, setTurnState] = useState<"listening" | "caller_speaking" | "receptionist_speaking" | "interrupted" | "waiting_for_turn">("listening");

  const handleInitiateVoiceCall = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermissionError("unsupported");
      setMicPermissionModalOpen(true);
      return;
    }

    try {
      setIsLoading(true);

      // 1. Immediately unlock and resume Web Audio within the direct user gesture (essential for iOS Safari)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          if (!(window as any).__prewarmedAudioCtx || (window as any).__prewarmedAudioCtx.state === "closed") {
            (window as any).__prewarmedAudioCtx = new AudioCtx();
          }
          if ((window as any).__prewarmedAudioCtx.state === "suspended") {
            (window as any).__prewarmedAudioCtx.resume().catch(() => {});
          }
        } catch (_) {}
      }

      // 2. Directly trigger the browser's native microphone permission prompt ("Would Like to Access the Microphone")
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (gErr: any) {
        if (gErr?.name === "OverconstrainedError" || gErr?.name === "TypeError") {
          // Fallback for older Safari or WebKit with strict constraint rejection
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw gErr;
        }
      }

      // Permission was granted by caller!
      (window as any).__prewarmedMicStream = stream;
      setMicPermissionModalOpen(false);
      setMicPermissionError(null);

      // Start the voice call immediately with the active stream
      await startVoiceCall(stream);
    } catch (err: any) {
      console.warn("Microphone access prompt error:", err);
      setIsLoading(false);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || /permission|denied|not allowed/i.test(err?.message || "")) {
        setMicPermissionError("denied");
        setMicPermissionModalOpen(true);
      } else {
        setMicPermissionError("unsupported");
        setMicPermissionModalOpen(true);
      }
    }
  };

  const handleGrantMicAndStart = async () => {
    await handleInitiateVoiceCall();
  };

  const startVoiceCall = async (existingStream?: MediaStream) => {
    if (isCalling) endCall();

    setMobileTab("call");
    setIsLoading(true);
    setIsVoiceMode(true);
    setTranscript([]);
    setDebugInfo([]);
    setCapturedLead(null);
    setTransferDetails(null);
    setTurnState("listening");
    setCallerAudioLevel(0);

    let stream = existingStream;
    if (!stream || !stream.active) {
      const prewarmed = typeof window !== "undefined" ? (window as any).__prewarmedMicStream : null;
      if (prewarmed && prewarmed.active && prewarmed.getAudioTracks().some((t: any) => t.readyState === "live")) {
        stream = prewarmed;
      }
    }
    if (stream && stream.active) {
      (window as any).__prewarmedMicStream = stream;
    }

    try {
      let activeSettings;
      try {
        const fetched = await getSettings();
        activeSettings = getSettingsForIndustry(activeIndustry, fetched);
        if (activeIndustry === "roofing_siding" && (!activeSettings.office_name || /lunar|heating|cooling|hvac|apex/i.test(activeSettings.office_name))) {
          activeSettings.office_name = "Spring Valley Roofing";
        }
        const loadedVoice = activeSettings.receptionist_voice || "Aoede";
        const loadedName = activeSettings.receptionist_name || "Megan";
        setActiveVoiceName(loadedVoice);
        setActivePersonaName(loadedName);
        const tradeTitle = INDUSTRY_PRESETS[activeIndustry]?.name || activeIndustry;
        setTranscript(prev => [...prev, { role: "system", text: `[SETTINGS CONTEXT] Trade: ${tradeTitle} | Business: "${activeSettings.office_name}" | Receptionist: ${loadedName} (${loadedVoice})` }]);
      } catch (sErr) {
        activeSettings = getSettingsForIndustry(activeIndustry);
        if (activeIndustry === "roofing_siding" && (!activeSettings.office_name || /lunar|heating|cooling|hvac|apex/i.test(activeSettings.office_name))) {
          activeSettings.office_name = "Spring Valley Roofing";
        }
        setTranscript(prev => [...prev, { role: "system", text: `[SETTINGS WARNING] Operating on local trade preset: "${activeSettings.office_name}".` }]);
      }

      let tokenRes;
      try {
        tokenRes = await requestGeminiEphemeralToken({ allowDemo: true });
        setTranscript(prev => [...prev, { role: "system", text: "[SECURITY] Server-issued Gemini Live WebSocket token received." }]);
      } catch (tErr: any) {
        setTranscript(prev => [...prev, { role: "system", text: `[CONNECTION NOTICE] ${tErr.message || "Failed to obtain Gemini Live ephemeral token from server. You can also provide a Gemini API key in Settings or log in as admin."}` }]);
        setIsLoading(false);
        setIsVoiceMode(false);
        return;
      }

      const loadedVoice = activeSettings?.receptionist_voice || "Aoede";
      const loadedName = activeSettings?.receptionist_name || "Megan";
      
      const session = new GeminiLiveSession({
        accessToken: tokenRes.access_token,
        mediaStream: stream,
        voiceName: loadedVoice,
        personaName: loadedName,
        settings: activeSettings,
        onAudioLevel: (level: number) => {
          setCallerAudioLevel(level);
        },
        onTranscript: (entry) => {
          setTranscript(prev => {
            if (entry.role === "assistant" && prev.length > 0 && prev[prev.length - 1].role === "assistant") {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                text: updated[updated.length - 1].text + entry.text
              };
              return updated;
            }
            return [...prev, entry];
          });
        },
        onTurnStateChange: (state) => {
          setTurnState(state);
        },
        onInterrupted: () => {
          setTranscript(prev => [...prev, { role: "system", text: "[BARGE-IN INTERRUPT] Caller interrupted receptionist playback." }]);
        },
        onToolCall: (toolInfo) => {
          setDebugInfo(prev => [...prev, toolInfo]);
          if (toolInfo.name === "transferCall") {
            const plan = buildHumanEscalationPlan(toolInfo.args || {}, activeSettings || {} as any);
            const targetNum = toolInfo.args.target_number || plan.target_phone || "+1 (717) 577-0668";
            const roleName = plan.route === "custom_role" ? (plan.summary.split(" ")[1] || "Custom Contact") : plan.route === "owner" ? "Owner/Manager" : "On-Call Technician";
            
            callTransferAudioFX.startRingback();
            setTransferDetails({
              target: targetNum,
              reason: `Routing to ${roleName}`,
              status: "ringing"
            });
            setTranscript(prev => [...prev, { role: "system", text: `[LIVE CALL TRANSFER] Initiated transfer to ${roleName} at ${targetNum}. Playing US PSTN Ringback tone...` }]);
          }
          if (toolInfo.name.startsWith("diagnose")) {
            setTranscript(prev => [...prev, { role: "system", text: `[ACOUSTIC DIAGNOSTIC ENGINE] Analyzed unit audio: ${toolInfo.args.sound_characteristics || "Mechanical noise"}. Probable cause identified.` }]);
          }
          if (toolInfo.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${toolInfo.args.service_type || "service"}.` }]);
          }
          if (toolInfo.name === "bookAppointment") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR BOOKING] Scheduled appointment slot: ${toolInfo.args.appointment_start}.` }]);
            const callerName = toolInfo.args.customer_name || "there";
            const dateStr = new Date(toolInfo.args.appointment_start).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
            setSmsToast(`Hi ${callerName}, your ${toolInfo.args.service_type || "service"} is confirmed for ${dateStr} with ${activeSettings?.office_name || settings?.office_name || "our office"}.`);
            setTimeout(() => setSmsToast(null), 8000);
          }
          if (toolInfo.name === "endCall") {
            const reason = toolInfo.args?.reason || "call_ended";
            setTranscript(prev => [...prev, { role: "system", text: `[CALL TERMINATION] Megan executed hang-up protocol: ${reason}.` }]);
          }
        },
        onCapturedLead: (lead) => {
          setCapturedLead(prev => ({ ...prev, ...lead }));
          setTranscript(prev => [...prev, { role: "system", text: "Lead telemetry captured and saved to database." }]);
          
          if (lead.caller_name && (lead as any).service_type) {
             setSmsToast(`Hi ${lead.caller_name}, thanks for calling ${activeSettings?.office_name || settings?.office_name || "our office"}. We've received your request for ${(lead as any).service_type}. Our team will review and get back to you shortly.`);
             setTimeout(() => setSmsToast(null), 8000);
          }
        },
        onEndCall: (info) => {
          const reasonLabels: Record<string, string> = {
            unresponsive_caller: "Caller Unresponsive / Silent",
            caller_refused_details: "Caller Refused Service Details",
            spam_solicitation: "Unsolicited Sales / Spam",
            prank_abusive: "Prank / Inappropriate Caller",
            circular_call_dead_end: "Call Going Nowhere / Stalemate",
            caller_concluded_call: "Call Concluded Normally",
            emergency_life_safety: "Life-Safety 911 Transfer"
          };
          const label = reasonLabels[info.reason] || info.reason || "Call terminated";
          setTranscript(prev => [...prev, { role: "system", text: `[CALL TERMINATED] Megan hung up the call (${label}).` }]);
          setCallerAudioLevel(0);
          setTimeout(() => {
            setIsCalling(false);
            setIsVoiceMode(false);
          }, 800);
        },
        onError: (err: any) => {
          console.error("Voice mode error:", err);
          if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || /permission|denied|allowed/i.test(err?.message || "")) {
            setMicPermissionError("denied");
            setMicPermissionModalOpen(true);
          }
          const detail = err?.message || (typeof err === "string" ? err : "");
          setTranscript(prev => [...prev, { role: "system", text: `Voice connection error ${detail ? `: ${detail}` : "(Check API key or microphone permissions)"}` }]);
        },
        onClose: () => {
          callTransferAudioFX.stopRingback();
          setCallerAudioLevel(0);
          setIsCalling(false);
          setIsVoiceMode(false);
        }
      });

      liveSessionRef.current = session;
      await session.start();
      setIsCalling(true);
    } catch (err: any) {
      console.error("Error starting live voice call:", err);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || /permission|denied|allowed/i.test(err?.message || "")) {
        setMicPermissionError("denied");
        setMicPermissionModalOpen(true);
      }
      setTranscript([{ role: "system", text: `Error: ${err?.message || "Failed to start voice call."}` }]);
      setIsVoiceMode(false);
    } finally {
      setIsLoading(false);
    }
  };

  const simulateMissedCall = async () => {
    setIsLoading(true);
    const mockNumber = `(717) 555-${Math.floor(1000 + Math.random() * 9000)}`;
    setTranscript([{ role: "system", text: `[MISSED CALL] Incoming call from ${mockNumber} was unanswered.` }]);
    await triggerMissedCallTextBack(mockNumber, "Valued Caller");
    setTranscript(prev => [...prev, { role: "system", text: `[AUTOMATED SMS DISPATCHED] Text-back message successfully sent to ${mockNumber}. Lead recorded on Dashboard.` }]);
    setIsLoading(false);
  };

  const endCall = () => {
    callTransferAudioFX.stopRingback();
    setTransferDetails(null);
    setCallerAudioLevel(0);
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    setIsCalling(false);
    setIsVoiceMode(false);
    setChat(null);
    setTranscript(prev => [...prev, { role: "system", text: "Call ended." }]);
  };

  const handleSendMessage = async (text: string, activeChat?: any) => {
    const currentChat = activeChat || chat;
    if (!text.trim() || !currentChat || isLoading) return;

    setTranscript(prev => [...prev, { role: "user", text }]);
    setUserInput("");
    setIsLoading(true);

    try {
      const response = await currentChat.sendMessage({ message: text });
      
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          setDebugInfo(prev => [...prev, { name: call.name, args: call.args }]);
          if (call.name === "saveLead") {
            setCapturedLead(prev => ({ ...prev, ...call.args }));
            await processLead({ ...call.args, transcript: [...transcript, { role: "user", text }, { role: "assistant", text: response.text }] });
            setTranscript(prev => [...prev, { role: "system", text: "Lead details captured and saved to database." }]);
            
            if (call.args.caller_name && call.args.service_type) {
               setSmsToast(`Hi ${call.args.caller_name}, thanks for calling ${settings?.office_name || "our office"}. We've received your request for ${call.args.service_type}. Our team will review and get back to you shortly.`);
               setTimeout(() => setSmsToast(null), 8000);
            }
          }
          if (call.name === "transferCall") {
            const currentSettings = await getSettings();
            const plan = buildHumanEscalationPlan(call.args || {}, currentSettings);
            const targetNum = call.args.target_number || plan.target_phone || "+1 (717) 577-0668";
            const roleName = plan.route === "custom_role" ? (plan.summary.split(" ")[1] || "Custom Contact") : plan.route === "owner" ? "Owner/Manager" : "On-Call Technician";
            
            callTransferAudioFX.startRingback();
            setTransferDetails({
              target: targetNum,
              reason: `Routing to ${roleName}`,
              status: "ringing"
            });
            setTranscript(prev => [...prev, { role: "system", text: `[LIVE CALL TRANSFER] Initiated transfer to ${roleName} at ${targetNum}. Playing US PSTN Ringback tone...` }]);
          }
          if (call.name.startsWith("diagnose")) {
            setTranscript(prev => [...prev, { role: "system", text: `[ACOUSTIC DIAGNOSTIC ENGINE] Analyzed unit noise: ${call.args.probable_cause || "Mechanical Fault"}.` }]);
          }
          if (call.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${call.args.service_type || "service"}.` }]);
          }
          if (call.name === "bookAppointment") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR BOOKING] Scheduled appointment slot: ${call.args.appointment_start}.` }]);
            const callerName = call.args.customer_name || "there";
            const dateStr = new Date(call.args.appointment_start).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
            setSmsToast(`Hi ${callerName}, your ${call.args.service_type || "service"} is confirmed for ${dateStr} with ${settings?.office_name || "our office"}.`);
            setTimeout(() => setSmsToast(null), 8000);
          }
          if (call.name === "endCall") {
            const reasonLabels: Record<string, string> = {
              unresponsive_caller: "Caller Unresponsive / Silent",
              caller_refused_details: "Caller Refused Service Details",
              spam_solicitation: "Unsolicited Sales / Spam",
              prank_abusive: "Prank / Inappropriate Caller",
              circular_call_dead_end: "Call Going Nowhere / Stalemate",
              caller_concluded_call: "Call Concluded Normally",
              emergency_life_safety: "Life-Safety 911 Transfer"
            };
            const label = reasonLabels[call.args?.reason] || call.args?.reason || "Call terminated";
            setTranscript(prev => [...prev, { role: "system", text: `[CALL TERMINATED] Megan hung up: ${label}.` }]);
            setTimeout(() => {
              endCall();
            }, 1200);
          }
        }
      }

      setTranscript(prev => [...prev, { role: "assistant", text: response.text }]);
    } catch (error) {
      console.error("Error sending message:", error);
      setTranscript(prev => [...prev, { role: "system", text: "Error: Could not process message." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 gap-4 sm:gap-6 overflow-y-auto lg:overflow-hidden relative text-slate-900 dark:text-slate-100 font-sans">
      {/* Background radial glow spots */}
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Live Call Transfer HUD Ringback Overlay */}
      <AnimatePresence>
        {transferDetails && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-x-6 top-16 z-50 p-6 bg-slate-900 border border-rose-500/50 rounded-3xl shadow-glow-rose-lg  text-center space-y-4"
          >
            <div className="flex items-center justify-center gap-4">
              <div className="p-3.5 bg-rose-500/20 text-rose-400 rounded-2xl animate-pulse border border-rose-500/40">
                <PhoneCall size={26} />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 font-serif italic">
                  WARM CALL TRANSFER IN PROGRESS
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
                </h3>
                <p className="text-xs font-mono text-cyan-300">Routing to: {transferDetails.target} • Reason: {transferDetails.reason}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-300 bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80">
              <Radio size={16} className="text-cyan-400 animate-pulse" />
              <span>Synthesizing PSTN Dual-Tone Ringback (440Hz + 480Hz)...</span>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-1">
              <button
                onClick={() => {
                  callTransferAudioFX.stopRingback();
                  setTransferDetails(null);
                }}
                className="text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 px-5 py-2.5 rounded-xl font-bold uppercase transition-all min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                Cancel Transfer
              </button>
              <button
                onClick={() => {
                  callTransferAudioFX.stopRingback();
                  callTransferAudioFX.playDTMF(941, 1336, 180);
                  setTransferDetails(prev => prev ? { ...prev, status: "connected" } : null);
                  setTranscript(prev => [...prev, { role: "system", text: "[LIVE CALL CONNECTED] Technician (+1-717-577-0668) answered warm transfer." }]);
                }}
                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-5 py-2.5 rounded-xl font-bold uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.25)] min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                Simulate Tech Answer (DTMF)
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 shrink-0 relative z-10">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif italic text-slate-900 dark:text-slate-100 tracking-tight">Call Simulator</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px] sm:text-[11px] font-mono font-bold shadow-glow-cyan-sm">
              <Zap size={13} className="text-cyan-400 animate-pulse" />
              GEMINI 2.0 MULTIMODAL
            </span>

            {/* Quick 1-Click Trade Switcher */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-full shadow-inner">
              <button
                type="button"
                onClick={() => handleSwitchTrade("hvac")}
                disabled={isCalling}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
                  activeIndustry === "hvac"
                    ? "bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <Wind size={13} /> HVAC Mode
              </button>
              <button
                type="button"
                onClick={() => handleSwitchTrade("roofing_siding")}
                disabled={isCalling}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
                  activeIndustry === "roofing_siding"
                    ? "bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.5)] font-black"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <Home size={13} /> Roofing Mode
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Active Trade: <span className="text-cyan-300 font-semibold">{INDUSTRY_PRESETS[activeIndustry]?.name}</span> ({settings?.office_name || INDUSTRY_PRESETS[activeIndustry]?.defaultOfficeName}) — simulate live inbound caller conversations with ultra-low latency voice & barge-in AI receptionist technology.
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 w-full lg:w-auto">
          {isCalling ? (
            <button
              onClick={endCall}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-500/25 dark:text-rose-200 dark:border-rose-500/60 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs sm:text-sm transition-all shadow-[0_0_20px_rgba(244,63,94,0.2)] min-h-[48px] active:scale-[0.98] cursor-pointer"
            >
              <PhoneOff size={18} />
              <span>Hang Up ({isVoiceMode ? "Voice Mode" : "Text Mode"})</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2.5">
              <button
                onClick={handleInitiateVoiceCall}
                disabled={isLoading}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs sm:text-sm hover:from-cyan-400 hover:to-cyan-300 transition-all shadow-[0_0_25px_rgba(34,211,238,0.45)] disabled:opacity-50 relative overflow-hidden group min-h-[48px] active:scale-[0.98] cursor-pointer"
              >
                <Mic size={18} className="text-slate-950 animate-pulse" />
                <span>Live Voice Call (Mic)</span>
              </button>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => startCall()}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-500/40 px-4 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] sm:text-xs transition-all shadow-sm disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  <Phone size={15} />
                  Text Call
                </button>
                <button
                  onClick={simulateMissedCall}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-amber-500/40 px-4 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] sm:text-xs transition-all shadow-sm disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  <MessageSquare size={15} />
                  Missed Text
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Segmented View Switcher (< lg screens) */}
      <div className="lg:hidden flex items-center bg-white/95 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800/90 shadow-sm dark:shadow-lg shrink-0 gap-1.5 z-10">
        <button
          type="button"
          onClick={() => setMobileTab("call")}
          className={cn(
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer",
            mobileTab === "call"
              ? "bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)] font-black"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <Phone size={14} className={cn(isCalling && "text-slate-950 animate-bounce")} />
          <span>Call {isCalling ? "(Active)" : ""}</span>
          {isCalling && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("scenarios")}
          className={cn(
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer",
            mobileTab === "scenarios"
              ? "bg-slate-900 text-cyan-400 dark:bg-slate-800 dark:text-cyan-300 shadow-sm border border-slate-800 dark:border-slate-700/80 font-black"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <Sparkles size={14} />
          <span>Scenarios</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("telemetry")}
          className={cn(
            "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer",
            mobileTab === "telemetry"
              ? "bg-slate-900 text-cyan-400 dark:bg-slate-800 dark:text-cyan-300 shadow-sm border border-slate-800 dark:border-slate-700/80 font-black"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          <Activity size={14} />
          <span>Telemetry {capturedLead ? "(1)" : ""}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 overflow-hidden relative z-10">
        {/* Left Column: Persona & Quick Launch Scenarios */}
        <div className={cn("flex flex-col gap-5 overflow-y-auto pr-1", mobileTab !== "scenarios" && "hidden lg:flex")}>
          {/* Receptionist Settings Display */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm dark:shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <UserCheck size={14} />
                Receptionist Persona
              </h3>
              <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                Voice: {activeVoiceName}
              </span>
            </div>
            <div className="w-full text-left p-3 rounded-xl border bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-slate-400 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-200">{activePersonaName}</div>
                <div className="text-[10px] text-slate-500 mt-1">Configured in Dashboard Settings</div>
              </div>
              <Sparkles size={14} className="text-cyan-500 dark:text-cyan-400/50" />
            </div>
          </section>

          {/* Quick Launch Scenarios */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-300">{INDUSTRY_PRESETS[activeIndustry]?.name || "Trade"} Scenarios</h2>
              <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 uppercase font-bold">
                {INDUSTRY_PRESETS[activeIndustry]?.shortName}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {(INDUSTRY_PRESETS[activeIndustry]?.quickScenarios || []).map((scenario: any) => (
                <button
                  key={scenario.id}
                  onClick={() => startCall(scenario.prompt)}
                  disabled={isLoading}
                  className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-cyan-500/40 hover:shadow-[0_0_12px_rgba(34,211,238,0.1)] transition-all text-left group disabled:opacity-50 shadow-sm dark:shadow-md cursor-pointer active:scale-[0.99]"
                >
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0 group-hover:bg-cyan-500/20 transition-all">
                    <Sparkles size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-200 truncate">{scenario.title || scenario.label}</div>
                      {scenario.badge && (
                        <span className="text-[9px] font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-slate-700 font-bold shrink-0">
                          {scenario.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 italic mt-0.5">"{scenario.prompt}"</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Center: Live Call Workspace & Transcript */}
        <div className={cn("lg:col-span-2 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-3xl shadow-sm dark:shadow-2xl overflow-hidden relative min-h-[520px] lg:min-h-0", mobileTab !== "call" && "hidden lg:flex")}>
          {/* Quick Scenario Chips Bar for Mobile */}
          <div className="lg:hidden px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800/80 overflow-x-auto flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold shrink-0">Quick Start:</span>
            {(INDUSTRY_PRESETS[activeIndustry]?.quickScenarios || []).map((sc: any) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => startCall(sc.prompt)}
                disabled={isLoading}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all disabled:opacity-50 min-h-[36px] cursor-pointer"
              >
                <Sparkles size={12} className="text-cyan-500 dark:text-cyan-400" />
                <span>{sc.title || sc.label}</span>
              </button>
            ))}
          </div>

          {/* Call Status Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full", isCalling ? "bg-cyan-400 animate-pulse shadow-glow-cyan-strong" : "bg-slate-400 dark:bg-slate-600")} />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest font-mono">
                  {isCalling ? `LIVE CALL IN PROGRESS (${isVoiceMode ? "Voice Mode" : "Text Mode"})` : "VOICE LINE READY"}
                </span>
                {isCalling && (
                  <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 mt-0.5">
                    Receptionist: {activePersonaName}
                  </div>
                )}
              </div>
            </div>
            {isCalling && (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-mono text-cyan-700 dark:text-cyan-300 shadow-inner">
                <Clock size={13} className="text-cyan-600 dark:text-cyan-400" />
                {formatDuration(callDuration)}
              </div>
            )}
          </div>

          {/* Interactive Live Audio Waveform & Caller Input VU Meter */}
          {isCalling && isVoiceMode && (
            <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-800/80 p-3 px-4 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Receptionist Speaking Status & Equalizer */}
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
                  <Volume2 size={15} className={turnState === "receptionist_speaking" ? "text-cyan-400 animate-pulse" : "text-slate-400"} />
                  <span className="uppercase text-[11px] font-bold tracking-wider">
                    {turnState === "receptionist_speaking" ? `${activePersonaName} Speaking...` : turnState === "caller_speaking" ? "Caller Speaking..." : turnState === "interrupted" ? "Barge-In Interrupted!" : "Listening for Voice..."}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 h-5">
                  {[40, 75, 55, 90, 60, 85, 45, 95, 70, 50].map((height, i) => (
                    <div
                      key={i}
                      style={{ height: turnState !== "listening" ? `${height}%` : "20%" }}
                      className={cn(
                        "w-1 rounded-full transition-all duration-150",
                        turnState === "receptionist_speaking" && "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse",
                        turnState === "caller_speaking" && "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse",
                        turnState === "interrupted" && "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse",
                        turnState === "listening" && "bg-slate-700"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Real-time Caller Microphone VU Meter */}
              <div className="flex items-center justify-between sm:justify-end gap-2.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 shadow-inner">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
                  <Mic size={13} className={callerAudioLevel > 0.012 ? "text-emerald-400 animate-pulse" : "text-slate-400"} />
                  <span>Your Mic:</span>
                </div>
                <div className="flex items-center gap-1">
                  {[0.005, 0.015, 0.03, 0.05, 0.08, 0.12].map((thresh, idx) => {
                    const active = callerAudioLevel >= thresh;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "w-1.5 h-3.5 rounded-sm transition-all duration-75",
                          active
                            ? idx < 4
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                              : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                            : "bg-slate-700/60"
                        )}
                      />
                    );
                  })}
                </div>
                <span className="text-[9px] font-mono font-semibold text-slate-300 min-w-[55px] text-right">
                  {callerAudioLevel > 0.012 ? "Speaking" : "Listening"}
                </span>
              </div>
            </div>
          )}

          {/* Transcript Scroll Container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isCalling && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 my-8 sm:my-12">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
                    <Phone size={36} strokeWidth={1.5} className="text-cyan-600 dark:text-cyan-400/60" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-mono tracking-widest text-slate-700 dark:text-slate-300 font-bold">SYSTEM.READY</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tap below to allow microphone access and start speaking with {activePersonaName}.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleInitiateVoiceCall}
                    disabled={isLoading}
                    className="mt-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(34,211,238,0.4)] flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 disabled:opacity-50 min-h-[48px]"
                  >
                    <Mic size={18} className="animate-pulse" />
                    <span>Live Voice Call (Mic)</span>
                  </button>
                </div>
              )}

              {transcript.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[88%] sm:max-w-[85%]",
                    entry.role === "user" ? "ml-auto items-end" : "mr-auto items-start",
                    entry.role === "system" && "mx-auto items-center w-full max-w-full"
                  )}
                >
                  {entry.role !== "system" && (
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1 px-1 font-mono">
                      {entry.role === "assistant" ? `AI Receptionist (${activePersonaName})` : "Caller"}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md backdrop-blur-sm border",
                      entry.role === "user" ? "bg-slate-900 text-white dark:bg-slate-800/90 dark:text-slate-100 rounded-tr-none border-slate-800 dark:border-slate-700/80" : 
                      entry.role === "assistant" ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-950 dark:text-cyan-100 rounded-tl-none border-cyan-200 dark:border-cyan-800/50 shadow-[0_0_12px_rgba(34,211,238,0.05)]" :
                      "bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 italic text-[11px] border border-amber-200 dark:border-amber-500/20 rounded-xl text-center font-mono py-2"
                    )}
                  >
                    {entry.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <div className="flex gap-1.5 items-center px-4 py-2.5 bg-slate-100 dark:bg-slate-800/60 rounded-2xl w-fit border border-slate-200 dark:border-slate-700/60">
                <div className="w-1.5 h-1.5 bg-cyan-500 dark:bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.3s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-500 dark:bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.15s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-500 dark:bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Text Input / VAD Status Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800/80">
            {isVoiceMode ? (
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs shadow-inner">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    turnState === "receptionist_speaking" && "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]",
                    turnState === "caller_speaking" && "bg-emerald-400 animate-ping shadow-[0_0_10px_rgba(52,211,153,0.8)]",
                    turnState === "interrupted" && "bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.8)]",
                    turnState === "listening" && "bg-slate-400 dark:bg-slate-500",
                    turnState === "waiting_for_turn" && "bg-indigo-400 animate-pulse"
                  )} />
                  <span className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 text-[11px] sm:text-xs">
                    VAD STATUS: {turnState.replace("_", " ")}
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 italic text-[11px] hidden sm:inline">Barge-In Interrupt & Auto Voice Detection Active</span>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(userInput);
                }}
                className="flex gap-2.5"
              >
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={!isCalling || isLoading}
                  placeholder={isCalling ? "Type a response to the AI receptionist..." : "Select a scenario or start a call above..."}
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all disabled:opacity-50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!isCalling || isLoading || !userInput.trim()}
                  className="px-4 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-xl hover:bg-cyan-500/30 transition-all disabled:opacity-50 shadow-sm flex items-center justify-center min-w-[44px]"
                >
                  <Send size={18} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Live Function Call Debugger & Captured Lead Card */}
        <div className={cn("flex flex-col gap-5 overflow-y-auto pl-1", mobileTab !== "telemetry" && "hidden lg:flex")}>
          {/* Acoustic Sound Diagnostic Visualizer */}
          {capturedLead?.sound_diagnosis && (
            <section className="bg-amber-950/20 border border-amber-500/40 p-4 rounded-2xl  shadow-lg space-y-2.5">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                <Volume2 size={14} className="animate-pulse" />
                Acoustic Sound Diagnosis
              </h3>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                <div className="font-bold text-amber-200 capitalize">
                  {capturedLead.sound_diagnosis.sound_type.replace(/_/g, ' ')}
                </div>
                <div className="text-slate-300 text-[11px]">
                  <span className="text-slate-400 font-mono font-semibold">Fault:</span> {capturedLead.sound_diagnosis.probable_cause}
                </div>
                <div className="text-slate-400 text-[10px] italic border-t border-slate-800/80 pt-1.5">
                  <span className="text-amber-400 font-mono font-semibold">Action:</span> {capturedLead.sound_diagnosis.recommended_action}
                </div>
              </div>
            </section>
          )}

          {/* Captured Lead Telemetry Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm dark:shadow-lg space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
              <Activity size={14} />
              Captured Lead Telemetry
            </h3>
            {capturedLead ? (
              <div className="space-y-2 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="font-bold text-slate-100 text-sm">{capturedLead.caller_name || "Unknown Caller"}</div>
                <div className="text-cyan-400 font-mono font-semibold">{capturedLead.callback_number || "No number"}</div>
                {capturedLead.property_address && <div className="text-slate-300 font-light">{capturedLead.property_address}</div>}
                {capturedLead.equipment_type && (
                  <div className="inline-block bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono px-2 py-0.5 rounded">
                    {capturedLead.equipment_type}
                  </div>
                )}
                {capturedLead.ai_summary && (
                  <div className="text-slate-400 italic text-[11px] pt-1 border-t border-slate-800/80">
                    "{capturedLead.ai_summary}"
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 font-mono text-[11px] bg-slate-950/40 rounded-xl border border-slate-800/60">
                No lead captured yet. Information will extract automatically during the call.
              </div>
            )}
          </section>

          {/* AI Tool & Function Call Stream */}
          <section className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl  shadow-lg space-y-3 flex-1 flex flex-col">
            <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
              <Cpu size={14} />
              AI Tool & Function Call Stream
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 max-h-56">
              {debugInfo.length > 0 ? (
                debugInfo.map((info, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-[10px] space-y-1">
                    <div className="text-cyan-400 font-bold">⚡ {info.name}()</div>
                    <pre className="text-slate-400 overflow-x-auto text-[9px] bg-slate-900 p-1.5 rounded border border-slate-800/60">
                      {JSON.stringify(info.args, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500 font-mono text-[11px] bg-slate-950/40 rounded-xl border border-slate-800/60">
                  Awaiting function calls (e.g. diagnoseHvacSound, transferCall, saveLead)...
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* SMS Dispatched Toast Notification */}
      <AnimatePresence>
        {smsToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(16,185,129,0.3)]  max-w-sm w-[90%]"
          >
            <div className="bg-emerald-500/20 p-2 rounded-full border border-emerald-500/40 shrink-0">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-emerald-400">
                SMS Dispatched
              </span>
              <p className="text-sm text-slate-200 leading-snug font-medium">
                {smsToast}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Microphone Permission Modal */}
      <AnimatePresence>
        {micPermissionModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 sm:p-8 shadow-2xl safe-area-bottom space-y-6"
            >
              {/* Mobile Drawer Handle */}
              <div className="sm:hidden w-12 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-2 shrink-0" />

              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-3 rounded-2xl shrink-0 border flex items-center justify-center",
                    micPermissionError === "denied"
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                      : micPermissionError === "unsupported"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                      : "bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                  )}>
                    {micPermissionError === "denied" ? (
                      <MicOff className="w-6 h-6" />
                    ) : micPermissionError === "unsupported" ? (
                      <AlertCircle className="w-6 h-6" />
                    ) : (
                      <Mic className="w-6 h-6 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                      {micPermissionError === "denied"
                        ? "Microphone Access Blocked"
                        : micPermissionError === "unsupported"
                        ? "Microphone Unsupported"
                        : "Microphone Access Required"}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {micPermissionError === "denied"
                        ? "Browser permission denied"
                        : micPermissionError === "unsupported"
                        ? "Secure context / Web Audio required"
                        : "Live Voice Receptionist"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMicPermissionModalOpen(false);
                    setMicPermissionError(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-200 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              {micPermissionError === "denied" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Your browser has blocked microphone access for this site. To speak with Megan, you need to unblock microphone permissions in your browser:
                  </p>

                  {/* iOS Safari Guide */}
                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                      <span>Apple iOS Safari</span>
                    </div>
                    <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                      <li>Tap the <span className="font-semibold text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">aA</span> icon in the address bar (bottom or top).</li>
                      <li>Tap <span className="font-semibold text-slate-100">Website Settings</span>.</li>
                      <li>Set <span className="font-semibold text-slate-100">Microphone</span> to <span className="text-emerald-400 font-semibold">Allow</span>.</li>
                      <li>Refresh this page and tap <span className="font-semibold text-cyan-300">Live Voice Call</span> again.</li>
                    </ol>
                  </div>

                  {/* Android Chrome Guide */}
                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                      <span>Google Android Chrome</span>
                    </div>
                    <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                      <li>Tap the <span className="font-semibold text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Tune / Lock</span> icon next to the address bar.</li>
                      <li>Tap <span className="font-semibold text-slate-100">Permissions</span> → <span className="font-semibold text-slate-100">Microphone</span>.</li>
                      <li>Toggle to <span className="text-emerald-400 font-semibold">Allowed</span>.</li>
                      <li>Tap <span className="font-semibold text-cyan-300">Try Again</span> below.</li>
                    </ol>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleGrantMicAndStart}
                      disabled={isLoading}
                      className="flex-1 py-3.5 px-5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
                    >
                      <Mic size={16} />
                      {isLoading ? "Requesting Mic..." : "Try Requesting Mic Again"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMicPermissionModalOpen(false);
                        setMicPermissionError(null);
                        startCall();
                      }}
                      className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-colors min-h-[48px] cursor-pointer"
                    >
                      Switch to Text Call
                    </button>
                  </div>
                </div>
              ) : micPermissionError === "unsupported" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Microphone input is unavailable in this environment. Microphone capture requires a secure context (<span className="text-emerald-400 font-mono">HTTPS</span> or <span className="text-emerald-400 font-mono">localhost</span>) and a browser supporting the HTML5 MediaDevices API.
                  </p>
                  <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-2xl text-xs text-amber-200/90 leading-relaxed">
                    You can still test and interact with the AI Receptionist at any time using the <strong>Text Call</strong> simulator mode.
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMicPermissionModalOpen(false);
                        setMicPermissionError(null);
                        startCall();
                      }}
                      className="flex-1 py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all min-h-[48px] cursor-pointer"
                    >
                      Use Text Call Instead
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMicPermissionModalOpen(false);
                        setMicPermissionError(null);
                      }}
                      className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-colors min-h-[48px] cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    To start your live call with <strong className="text-cyan-300">{activePersonaName}</strong>, your browser needs microphone permission so you can speak directly with the AI receptionist.
                  </p>
                  <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                      <Zap size={16} />
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-100 block mb-0.5">Barge-in Voice Engine</strong>
                      When prompted by your browser, tap <span className="text-emerald-400 font-bold">"Allow"</span> or <span className="text-emerald-400 font-bold">"Allow While Using App"</span>.
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleGrantMicAndStart}
                      disabled={isLoading}
                      className="flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(34,211,238,0.4)] flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      <Mic size={16} className={isLoading ? "animate-spin" : "animate-pulse"} />
                      {isLoading ? "Enabling Microphone..." : "Allow Microphone & Start Call"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMicPermissionModalOpen(false);
                        setMicPermissionError(null);
                      }}
                      className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors min-h-[48px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
