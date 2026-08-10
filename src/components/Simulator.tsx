import React, { useState, useEffect, useRef } from "react";
import { createReceptionistChat, processLead, triggerMissedCallTextBack, getSettings } from "../services/geminiService.ts";
import { GeminiLiveSession } from "../services/geminiLiveService.ts";
import { requestGeminiEphemeralToken } from "../services/ephemeralTokenService.ts";
import { auth } from "../firebase.ts";
import { TranscriptEntry, Lead } from "../types.ts";
import { buildHumanEscalationPlan } from "../services/humanEscalationService.ts";
import { callTransferAudioFX } from "../lib/callTransferAudioFX.ts";
import { Phone, PhoneOff, Send, AlertCircle, Clock, User, Home, HelpCircle, ShieldAlert, Mic, MessageSquare, Sparkles, Activity, Zap, Cpu, Volume2, UserCheck, PhoneCall, Radio } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SCENARIOS = [
  { id: "estimate", label: "New Estimate Request", icon: Home, prompt: "Hi, I'm looking to get a quote for a new AC unit." },
  { id: "emergency", label: "Emergency No Heat", icon: ShieldAlert, prompt: "Help! My furnace stopped working and it's freezing in here!" },
  { id: "noise_diag", label: "Furnace Sound Diagnostic", icon: Volume2, prompt: "Listen to my furnace! It's making a high-pitched screeching sound when the heat turns on." },
  { id: "repair", label: "Repair Request", icon: AlertCircle, prompt: "My AC is blowing warm air." },
  { id: "maintenance", label: "Maintenance Plan", icon: Clock, prompt: "I'd like to schedule my spring tune-up." },
  { id: "general", label: "General Office Question", icon: HelpCircle, prompt: "What are your office hours today?" },
  { id: "spam", label: "Spam Call", icon: User, prompt: "We've been trying to reach you about your car's extended warranty." }
];

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
  const [smsToast, setSmsToast] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const timerRef = useRef<any>(null);

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
    
    setIsLoading(true);
    try {
      const newChat = await createReceptionistChat();
      setChat(newChat);
      setIsCalling(true);
      setTranscript([]);
      setDebugInfo([]);
      setCapturedLead(null);
      setTransferDetails(null);

      const response = await newChat.sendMessage({ message: "Hello, I'm calling Lunar Heating and Cooling." });
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

  const startVoiceCall = async () => {
    if (isCalling) endCall();

    setIsLoading(true);
    setIsVoiceMode(true);
    setTranscript([]);
    setDebugInfo([]);
    setCapturedLead(null);
    setTransferDetails(null);
    setTurnState("listening");

    if (!auth.currentUser) {
      setTranscript(prev => [...prev, { role: "system", text: "[SECURITY ERROR] You must be logged in as an authorized admin to start Voice Call mode. Please log in using the Admin Login button." }]);
      setIsLoading(false);
      setIsVoiceMode(false);
      return;
    }

    try {
      let activeSettings;
      try {
        activeSettings = await getSettings();
        const loadedVoice = activeSettings.receptionist_voice || "Aoede";
        const loadedName = activeSettings.receptionist_name || "Sarah";
        setActiveVoiceName(loadedVoice);
        setActivePersonaName(loadedName);
        setTranscript(prev => [...prev, { role: "system", text: `[SETTINGS CONTEXT] Loaded Firestore business profile: "${activeSettings.office_name}". Active Voice: ${loadedVoice} (${loadedName})` }]);
      } catch (sErr) {
        setTranscript(prev => [...prev, { role: "system", text: "[SETTINGS WARNING] Could not fetch Firestore config. Operating on fallback system settings." }]);
      }

      let tokenRes;
      try {
        tokenRes = await requestGeminiEphemeralToken();
        setTranscript(prev => [...prev, { role: "system", text: "[SECURITY] Server-issued Gemini 2.0 Live WebSocket token received." }]);
      } catch (tErr: any) {
        setTranscript(prev => [...prev, { role: "system", text: `[SECURITY ERROR] ${tErr.message || "Failed to obtain Gemini Live ephemeral token from server."}` }]);
        setIsLoading(false);
        setIsVoiceMode(false);
        return;
      }

      const loadedVoice = activeSettings?.receptionist_voice || "Aoede";
      const loadedName = activeSettings?.receptionist_name || "Sarah";
      
      const session = new GeminiLiveSession({
        accessToken: tokenRes.access_token,
        voiceName: loadedVoice,
        personaName: loadedName,
        settings: activeSettings,
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
          if (toolInfo.name === "diagnoseHvacSound") {
            setTranscript(prev => [...prev, { role: "system", text: `[ACOUSTIC DIAGNOSTIC ENGINE] Analyzed unit audio: ${toolInfo.args.sound_characteristics || "Mechanical noise"}. Probable cause identified.` }]);
          }
          if (toolInfo.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${toolInfo.args.service_type || "service"}.` }]);
          }
          if (toolInfo.name === "bookAppointment") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR BOOKING] Scheduled appointment slot: ${toolInfo.args.appointment_start}.` }]);
            const callerName = toolInfo.args.customer_name || "there";
            const dateStr = new Date(toolInfo.args.appointment_start).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
            setSmsToast(`Hi ${callerName}, your ${toolInfo.args.service_type || "service"} is confirmed for ${dateStr} with ${activeSettings?.office_name || "Lunar Heating & Cooling"}.`);
            setTimeout(() => setSmsToast(null), 8000);
          }
        },
        onCapturedLead: (lead) => {
          setCapturedLead(prev => ({ ...prev, ...lead }));
          setTranscript(prev => [...prev, { role: "system", text: "Lead telemetry captured and saved to database." }]);
          
          if (lead.caller_name && (lead as any).service_type) {
             setSmsToast(`Hi ${lead.caller_name}, thanks for calling ${activeSettings?.office_name || "Lunar Heating & Cooling"}. We've received your request for ${(lead as any).service_type}. Our team will review and get back to you shortly.`);
             setTimeout(() => setSmsToast(null), 8000);
          }
        },
        onError: (err: any) => {
          console.error("Voice mode error:", err);
          const detail = err?.message || (typeof err === "string" ? err : "");
          setTranscript(prev => [...prev, { role: "system", text: `Voice connection error ${detail ? `: ${detail}` : "(Check API key or microphone permissions)"}` }]);
        },
        onClose: () => {
          callTransferAudioFX.stopRingback();
          setIsCalling(false);
          setIsVoiceMode(false);
        }
      });

      liveSessionRef.current = session;
      await session.start();
      setIsCalling(true);
    } catch (err: any) {
      console.error("Error starting live voice call:", err);
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
               setSmsToast(`Hi ${call.args.caller_name}, thanks for calling. We've received your request for ${call.args.service_type}. Our team will review and get back to you shortly.`);
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
          if (call.name === "diagnoseHvacSound") {
            setTranscript(prev => [...prev, { role: "system", text: `[ACOUSTIC DIAGNOSTIC ENGINE] Analyzed unit noise: ${call.args.probable_cause || "Mechanical Fault"}.` }]);
          }
          if (call.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${call.args.service_type || "service"}.` }]);
          }
          if (call.name === "bookAppointment") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR BOOKING] Scheduled appointment slot: ${call.args.appointment_start}.` }]);
            const callerName = call.args.customer_name || "there";
            const dateStr = new Date(call.args.appointment_start).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
            setSmsToast(`Hi ${callerName}, your ${call.args.service_type || "service"} is confirmed for ${dateStr} with Lunar Heating & Cooling.`);
            setTimeout(() => setSmsToast(null), 8000);
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
    <div className="flex flex-col h-full bg-slate-950 p-4 sm:p-6 lg:p-8 gap-4 sm:gap-6 overflow-y-auto lg:overflow-hidden relative text-slate-100 font-sans">
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif italic text-slate-100 tracking-tight">Call Simulator</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px] sm:text-[11px] font-mono font-bold shadow-glow-cyan-sm">
              <Zap size={13} className="text-cyan-400 animate-pulse" />
              GEMINI 2.0 MULTIMODAL
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Simulate live inbound caller conversations with ultra-low latency voice & barge-in AI receptionist technology.</p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          {isCalling ? (
            <button
              onClick={endCall}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-500/20 text-rose-300 border border-rose-500/50 px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-rose-500/30 transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)] min-h-[44px]"
            >
              <PhoneOff size={16} />
              Hang Up ({isVoiceMode ? "Voice Mode" : "Text Mode"})
            </button>
          ) : (
            <>
              <button
                onClick={simulateMissedCall}
                disabled={isLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[11px] sm:text-xs hover:bg-amber-500/20 transition-all shadow-sm disabled:opacity-50 min-h-[44px]"
              >
                <MessageSquare size={16} />
                Missed Text
              </button>
              <button
                onClick={startVoiceCall}
                disabled={isLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[11px] sm:text-xs hover:bg-cyan-500/30 transition-all shadow-[0_0_15px_rgba(34,211,238,0.25)] disabled:opacity-50 relative overflow-hidden group min-h-[44px]"
              >
                <Mic size={16} className="text-cyan-400" />
                Live Voice Call (Mic)
              </button>
              <button
                onClick={() => startCall()}
                disabled={isLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[11px] sm:text-xs hover:bg-emerald-500/20 transition-all shadow-sm disabled:opacity-50 min-h-[44px]"
              >
                <Phone size={16} />
                Text Call
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 overflow-hidden relative z-10">
        {/* Left Column: Persona & Quick Launch Scenarios */}
          <div className="flex flex-col gap-5 overflow-y-auto pr-1">
          {/* Receptionist Settings Display */}
          <section className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl  shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
                <UserCheck size={14} />
                Receptionist Persona
              </h3>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                Voice: {activeVoiceName}
              </span>
            </div>
            <div className="w-full text-left p-3 rounded-xl border bg-slate-950/40 border-slate-800/80 text-slate-400 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-slate-200">{activePersonaName}</div>
                <div className="text-[10px] text-slate-500 mt-1">Configured in Dashboard Settings</div>
              </div>
              <Sparkles size={14} className="text-cyan-400/50" />
            </div>
          </section>

          {/* Quick Launch Scenarios */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Quick Launch Scenarios</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => startCall(scenario.prompt)}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800/80 rounded-2xl hover:bg-slate-800/60 hover:border-cyan-500/40 hover:shadow-[0_0_12px_rgba(34,211,238,0.1)] transition-all text-left group disabled:opacity-50  shadow-md",
                    scenario.id === "emergency" && "border-rose-500/30 hover:border-rose-500/50 hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] bg-rose-950/10",
                    scenario.id === "noise_diag" && "border-amber-500/30 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] bg-amber-950/10"
                  )}
                >
                  <div className={cn(
                    "p-2.5 rounded-xl transition-colors shadow-inner shrink-0",
                    scenario.id === "emergency" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" : 
                    scenario.id === "noise_diag" ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-slate-800 text-cyan-400 border border-slate-700 group-hover:border-cyan-500/50"
                  )}>
                    <scenario.icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-slate-200 truncate">{scenario.label}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1 italic mt-0.5">"{scenario.prompt}"</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Center: Live Call Workspace & Transcript */}
        <div className="lg:col-span-2 flex flex-col bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden relative ">
          {/* Call Status Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full", isCalling ? "bg-cyan-400 animate-pulse shadow-glow-cyan-strong" : "bg-slate-600")} />
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono">
                  {isCalling ? `LIVE CALL IN PROGRESS (${isVoiceMode ? "Voice Mode" : "Text Mode"})` : "VOICE LINE READY"}
                </span>
                {isCalling && (
                  <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                    Receptionist: {activePersonaName}
                  </div>
                )}
              </div>
            </div>
            {isCalling && (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full text-xs font-mono text-cyan-300 shadow-inner">
                <Clock size={13} className="text-cyan-400" />
                {formatDuration(callDuration)}
              </div>
            )}
          </div>

          {/* Interactive Live Audio Waveform Visualizer Bar */}
          {isCalling && isVoiceMode && (
            <div className="bg-slate-950 border-b border-slate-800/80 p-3 px-6 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <Volume2 size={15} className={turnState === "receptionist_speaking" ? "text-cyan-400 animate-pulse" : "text-slate-500"} />
                <span className="uppercase text-[11px] font-bold tracking-wider">
                  {turnState === "receptionist_speaking" ? `${activePersonaName} Speaking...` : turnState === "caller_speaking" ? "Caller Speaking..." : turnState === "interrupted" ? "Barge-In Interrupted!" : "Listening for Voice..."}
                </span>
              </div>
              
              {/* Dynamic Animated Equalizer Bars */}
              <div className="flex items-center gap-1.5 h-6">
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
          )}

          {/* Transcript Scroll Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isCalling && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-5 opacity-60 my-12">
                  <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 shadow-inner">
                    <Phone size={36} strokeWidth={1.5} className="text-cyan-400/60" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-mono tracking-widest text-slate-300">SYSTEM.READY</p>
                    <p className="text-xs text-slate-500">Select a scenario on the left or click "Live Voice Call" to test the AI Receptionist.</p>
                  </div>
                </div>
              )}

              {transcript.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    entry.role === "user" ? "ml-auto items-end" : "mr-auto items-start",
                    entry.role === "system" && "mx-auto items-center w-full max-w-full"
                  )}
                >
                  {entry.role !== "system" && (
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-1 px-1 font-mono">
                      {entry.role === "assistant" ? `AI Receptionist (${activePersonaName})` : "Caller"}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md backdrop-blur-sm border",
                      entry.role === "user" ? "bg-slate-800/90 text-slate-100 rounded-tr-none border-slate-700/80" : 
                      entry.role === "assistant" ? "bg-cyan-950/40 text-cyan-100 rounded-tl-none border-cyan-800/50 shadow-[0_0_12px_rgba(34,211,238,0.05)]" :
                      "bg-amber-500/10 text-amber-300 italic text-[11px] border border-amber-500/20 rounded-xl text-center font-mono py-2"
                    )}
                  >
                    {entry.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <div className="flex gap-1.5 items-center px-4 py-2.5 bg-slate-800/60 rounded-2xl w-fit border border-slate-700/60">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.3s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.15s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Text Input / VAD Status Bar */}
          <div className="p-4 bg-slate-900 border-t border-slate-800/80">
            {isVoiceMode ? (
              <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs shadow-inner">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    turnState === "receptionist_speaking" && "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]",
                    turnState === "caller_speaking" && "bg-emerald-400 animate-ping shadow-[0_0_10px_rgba(52,211,153,0.8)]",
                    turnState === "interrupted" && "bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.8)]",
                    turnState === "listening" && "bg-slate-500",
                    turnState === "waiting_for_turn" && "bg-indigo-400 animate-pulse"
                  )} />
                  <span className="font-bold uppercase tracking-wider text-slate-200">
                    VAD STATUS: {turnState.replace("_", " ")}
                  </span>
                </div>
                <span className="text-slate-400 italic text-[11px]">Barge-In Interrupt & Auto Voice Detection Active</span>
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
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all disabled:opacity-50 text-slate-100 placeholder:text-slate-500"
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
        <div className="flex flex-col gap-5 overflow-y-auto pl-1">
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
          <section className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl  shadow-lg space-y-3">
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
    </div>
  );
}
