import React, { useState, useEffect, useRef } from "react";
import { createReceptionistChat, processLead, triggerMissedCallTextBack, getSettings } from "../services/geminiService.ts";
import { GeminiLiveSession } from "../services/geminiLiveService.ts";
import { generateGeminiEphemeralToken } from "../services/ephemeralTokenService.ts";
import { TranscriptEntry, Lead } from "../types.ts";
import { Phone, PhoneOff, Send, AlertCircle, Clock, User, Home, HelpCircle, ShieldAlert, Bug, Mic, MicOff, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SCENARIOS = [
  { id: "estimate", label: "New Estimate Request", icon: Home, prompt: "Hi, I'm looking to get a quote for a new AC unit." },
  { id: "emergency", label: "Emergency No Heat", icon: ShieldAlert, prompt: "Help! My furnace stopped working and it's freezing in here!" },
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

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);

  const scrollToBottom = () => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcript]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
    };
  }, []);

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

      const response = await newChat.sendMessage({ message: "Hello, I'm calling the roofing company." });
      setTranscript([{ role: "assistant", text: response.text }]);
      
      if (initialPrompt) {
        // Wait a small bit for the greeting to settle
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
    setTurnState("listening");

    try {
      let activeSettings;
      try {
        activeSettings = await getSettings();
        setTranscript(prev => [...prev, { role: "system", text: `[SETTINGS CONTEXT] Loaded Firestore business profile: "${activeSettings.office_name}".` }]);
      } catch (sErr) {
        setTranscript(prev => [...prev, { role: "system", text: "[SETTINGS WARNING] Could not fetch Firestore config. Operating on fallback system settings." }]);
      }

      // Request short-lived ephemeral access token from backend endpoint
      const tokenRes = await generateGeminiEphemeralToken("user_auth_101", activeSettings || {} as any);
      setTranscript(prev => [...prev, { role: "system", text: `[SECURITY ENCRYPTED] Issued short-lived Live ephemeral token (Model: ${tokenRes.model}, Expires: ${tokenRes.expires_in_seconds}s).` }]);

      const session = new GeminiLiveSession({
        accessToken: tokenRes.access_token,
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
            setTranscript(prev => [...prev, { role: "system", text: `[LIVE CALL TRANSFER] Initiated transfer to ${toolInfo.args.target_number || "On-Call Technician"}. Reason: ${toolInfo.args.reason}` }]);
          }
          if (toolInfo.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${toolInfo.args.service_type || "service"}.` }]);
          }
          if (toolInfo.name === "bookAppointment") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR BOOKING] Scheduled appointment slot: ${toolInfo.args.appointment_start}.` }]);
          }
        },
        onCapturedLead: (lead) => {
          setCapturedLead(lead);
          setTranscript(prev => [...prev, { role: "system", text: "Lead details captured and saved to database." }]);
        },
        onError: (err: any) => {
          console.error("Voice mode error:", err);
          const detail = err?.message || (typeof err === "string" ? err : "");
          setTranscript(prev => [...prev, { role: "system", text: `Voice connection error ${detail ? `: ${detail}` : "(Check API key or microphone permissions)"}` }]);
        },
        onClose: () => {
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
    setTranscript(prev => [...prev, { role: "system", text: `[AUTOMATED SMS SENT] Text-back message successfully dispatched to ${mockNumber}. Lead recorded on Dashboard.` }]);
    setIsLoading(false);
  };

  const endCall = () => {
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
            setCapturedLead(call.args);
            await processLead({ ...call.args, transcript: [...transcript, { role: "user", text }, { role: "assistant", text: response.text }] });
            setTranscript(prev => [...prev, { role: "system", text: "Lead details captured and saved to database." }]);
          }
          if (call.name === "transferCall") {
            setTranscript(prev => [...prev, { role: "system", text: `[LIVE CALL TRANSFER] Initiated transfer to ${call.args.target_number || "On-Call Technician"}. Reason: ${call.args.reason}` }]);
          }
          if (call.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${call.args.service_type || "service"}.` }]);
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
    <div className="flex flex-col h-full bg-transparent p-8 gap-8 overflow-hidden relative z-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic text-slate-100">Call Simulator</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-400">Test the AI receptionist with live voice or text scenarios.</p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[11px] font-mono font-bold shadow-[0_0_8px_rgba(34,211,238,0.2)]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
              VOICE SERVICE READY (EPHEMERAL TOKENS ENCRYPTED)
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          {isCalling ? (
            <button
              onClick={endCall}
              className="flex items-center gap-2 bg-rose-500/20 text-rose-400 border border-rose-500/50 px-6 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-rose-500/30 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)]"
            >
              <PhoneOff size={16} />
              Hang Up ({isVoiceMode ? "Voice Mode" : "Text Mode"})
            </button>
          ) : (
            <>
              <button
                onClick={simulateMissedCall}
                disabled={isLoading}
                className="flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-amber-500/20 transition-all shadow-[0_0_10px_rgba(245,158,11,0.1)] disabled:opacity-50"
              >
                <MessageSquare size={16} />
                Simulate Missed-Call Text Back
              </button>
              <button
                onClick={startVoiceCall}
                disabled={isLoading}
                className="flex items-center gap-2 bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-cyan-500/30 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/30 to-cyan-500/0 translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]"></div>
                <Mic size={16} />
                Voice Call (Mic)
              </button>
              <button
                onClick={() => startCall()}
                disabled={isLoading}
                className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-6 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-emerald-500/20 transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)] disabled:opacity-50"
              >
                <Phone size={16} />
                Text Call
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-1 overflow-hidden">
        {/* Left: Scenarios */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2">
          <section className="space-y-3">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 font-bold">Quick Launch Scenarios</h2>
            <div className="grid grid-cols-1 gap-2">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => startCall(scenario.prompt)}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center gap-3 p-4 bg-slate-900/40 border border-slate-700/50 rounded-2xl hover:bg-slate-800/60 hover:border-cyan-500/30 hover:shadow-[0_0_10px_rgba(34,211,238,0.1)] transition-all text-left group disabled:opacity-50 backdrop-blur-sm",
                    scenario.id === "emergency" && "border-rose-500/20 hover:border-rose-500/40 hover:shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl transition-colors shadow-inner",
                    scenario.id === "emergency" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-slate-800 text-cyan-400 border border-slate-700 group-hover:border-cyan-500/50"
                  )}>
                    <scenario.icon size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-200">{scenario.label}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1 italic mt-0.5">"{scenario.prompt}"</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="p-5 bg-slate-900/60 border border-slate-700 rounded-2xl text-slate-200 space-y-4 shadow-xl backdrop-blur-sm">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-500 font-bold">Simulation Context</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Time of Day</span>
                <span className="font-bold text-cyan-300">Business Hours</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">AI Personality</span>
                <span className="font-bold">Professional Office</span>
              </div>
              <div className="pt-2 flex gap-2">
                <button className="flex-1 text-[10px] font-bold uppercase py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors text-slate-300">Toggle Hours</button>
              </div>
            </div>
          </section>
        </div>

        {/* Center: Transcript */}
        <div className="lg:col-span-2 flex flex-col bg-slate-900/40 border border-slate-700 rounded-[2rem] shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden relative backdrop-blur-md">
          <div className="p-6 border-b border-slate-800 bg-slate-800/40 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]", isCalling ? "bg-cyan-400 animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.8)]" : "bg-slate-600")} />
              <span className="text-sm font-bold text-slate-300 uppercase tracking-widest font-mono">{isCalling ? "Call in Progress" : "Line Ready"}</span>
            </div>
            {isCalling && <div className="px-3 py-1 bg-cyan-950 border border-cyan-900 rounded-full text-[10px] font-mono text-cyan-400 shadow-inner">00:42</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isCalling && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6 opacity-50">
                  <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 shadow-inner">
                    <Phone size={48} strokeWidth={1} className="text-cyan-500/50" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-lg font-mono italic text-slate-400">SYSTEM.READY</p>
                    <p className="text-xs">Select a scenario on the left to simulate a call.</p>
                  </div>
                </div>
              )}
              {transcript.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    entry.role === "user" ? "ml-auto items-end" : "mr-auto items-start",
                    entry.role === "system" && "mx-auto items-center w-full max-w-full"
                  )}
                >
                  {entry.role !== "system" && (
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1.5 px-1 font-mono">
                      {entry.role === "assistant" ? "AI Receptionist" : "Caller"}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-md backdrop-blur-sm border",
                      entry.role === "user" ? "bg-slate-800/80 text-cyan-50 rounded-tr-none border-slate-700" : 
                      entry.role === "assistant" ? "bg-cyan-900/20 text-cyan-200 rounded-tl-none border-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.05)]" :
                      "bg-amber-500/10 text-amber-300 italic text-[11px] border border-amber-500/20 rounded-lg text-center"
                    )}
                  >
                    {entry.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex gap-1.5 items-center px-5 py-3 bg-slate-800/50 rounded-2xl w-fit border border-slate-700/50">
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <div className="p-6 bg-slate-900/60 border-t border-slate-800">
            {isVoiceMode ? (
              <div className="flex items-center justify-between px-6 py-3 bg-slate-800/80 border border-slate-700 rounded-2xl font-mono text-xs shadow-inner">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    turnState === "receptionist_speaking" && "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]",
                    turnState === "caller_speaking" && "bg-emerald-400 animate-ping shadow-[0_0_10px_rgba(52,211,153,0.8)]",
                    turnState === "interrupted" && "bg-amber-400 animate-bounce shadow-[0_0_10px_rgba(251,191,36,0.8)]",
                    turnState === "listening" && "bg-slate-500",
                    turnState === "waiting_for_turn" && "bg-indigo-400 animate-pulse"
                  )} />
                  <span className="font-bold uppercase tracking-wider text-slate-200">
                    VAD STATUS: {turnState.replace("_", " ")}
                  </span>
                </div>
                <span className="text-slate-400 italic text-[11px]">Automatic Voice Activity Detection & Barge-In Active</span>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(userInput);
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={!isCalling || isLoading}
                  placeholder={isCalling ? "Type your response..." : "Select a scenario to start"}
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-50 shadow-inner text-slate-200 placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!isCalling || isLoading || !userInput.trim()}
                  className="p-3 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-2xl hover:bg-cyan-600/40 transition-all disabled:opacity-50 shadow-[0_0_10px_rgba(34,211,238,0.1)] active:scale-95"
                >
                  <Send size={20} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right: Debug & Captured */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 bg-slate-900/60 text-slate-300 p-6 rounded-3xl border border-slate-800 overflow-hidden flex flex-col shadow-inner backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4 text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] font-bold">
              <Bug size={14} />
              AI Reasoning Terminal
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-3 scrollbar-hide">
              {debugInfo.length === 0 && <span className="opacity-40 italic text-slate-500">Awaiting AI tool calls...</span>}
              {debugInfo.map((info, i) => (
                <div key={i} className="border-l-2 border-cyan-500/50 pl-3 py-2 bg-slate-800/30 rounded-r-lg">
                  <span className="text-cyan-400 font-bold">tool:</span> {info.name}
                  <pre className="text-slate-400 mt-2 whitespace-pre-wrap leading-relaxed">{JSON.stringify(info.args, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>

          <div className="h-1/2 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 overflow-hidden flex flex-col shadow-inner backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4 text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] font-bold">
              <AlertCircle size={14} />
              Captured Payload
            </div>
            <div className="flex-1 overflow-y-auto text-xs space-y-3 font-mono">
              {!capturedLead && <span className="opacity-40 italic text-slate-500">Data payload will appear here.</span>}
              {capturedLead && (
                <div className="space-y-2">
                  {Object.entries(capturedLead).map(([key, value]) => (
                    <div key={key} className="flex flex-col border-b border-slate-800/50 pb-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{key.replace("_", " ")}</span>
                      <span className="text-slate-300 font-medium text-sm mt-0.5">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
