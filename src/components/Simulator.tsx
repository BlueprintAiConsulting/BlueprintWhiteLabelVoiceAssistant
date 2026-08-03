import React, { useState, useEffect, useRef } from "react";
import { createReceptionistChat, processLead, triggerMissedCallTextBack } from "../services/geminiService.ts";
import { GeminiLiveSession } from "../services/geminiLiveService.ts";
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
  const [isCalling, setIsCalling] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [userInput, setUserInput] = useState("");
  const [chat, setChat] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any[]>([]);
  const [capturedLead, setCapturedLead] = useState<Partial<Lead> | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcript]);

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

  const startVoiceCall = async () => {
    if (isCalling) endCall();

    setIsLoading(true);
    setIsVoiceMode(true);
    setTranscript([]);
    setDebugInfo([]);
    setCapturedLead(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY as string;
      const session = new GeminiLiveSession({
        apiKey,
        onTranscript: (entry) => {
          setTranscript(prev => [...prev, entry]);
        },
        onToolCall: (toolInfo) => {
          setDebugInfo(prev => [...prev, toolInfo]);
          if (toolInfo.name === "transferCall") {
            setTranscript(prev => [...prev, { role: "system", text: `[LIVE CALL TRANSFER] Initiated transfer to ${toolInfo.args.target_number || "On-Call Technician"}. Reason: ${toolInfo.args.reason}` }]);
          }
          if (toolInfo.name === "checkAppointmentSlots") {
            setTranscript(prev => [...prev, { role: "system", text: `[CALENDAR CHECK] Checked technician availability for ${toolInfo.args.service_type || "service"}.` }]);
          }
        },
        onCapturedLead: (lead) => {
          setCapturedLead(lead);
          setTranscript(prev => [...prev, { role: "system", text: "Lead details captured and saved to database." }]);
        },
        onError: (err) => {
          console.error("Voice mode error:", err);
          setTranscript(prev => [...prev, { role: "system", text: "Voice connection error. Make sure your API key is valid." }]);
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
    <div className="flex flex-col h-full bg-stone-50 p-8 gap-8 overflow-hidden">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic text-stone-800">Call Simulator</h1>
          <p className="text-stone-500 mt-1">Test the AI receptionist with one-click scenarios.</p>
        </div>
        <div className="flex gap-3">
          {isCalling ? (
            <button
              onClick={endCall}
              className="flex items-center gap-2 bg-rose-600 text-white px-6 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
            >
              <PhoneOff size={16} />
              Hang Up ({isVoiceMode ? "Voice Mode" : "Text Mode"})
            </button>
          ) : (
            <>
              <button
                onClick={simulateMissedCall}
                disabled={isLoading}
                className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 disabled:opacity-50"
              >
                <MessageSquare size={16} />
                Simulate Missed-Call Text Back
              </button>
              <button
                onClick={startVoiceCall}
                disabled={isLoading}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                <Mic size={16} />
                Voice Call (Mic)
              </button>
              <button
                onClick={() => startCall()}
                disabled={isLoading}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-full font-bold uppercase tracking-wider text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
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
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Quick Launch Scenarios</h2>
            <div className="grid grid-cols-1 gap-2">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => startCall(scenario.prompt)}
                  disabled={isLoading}
                  className={cn(
                    "flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-400 hover:shadow-md transition-all text-left group disabled:opacity-50",
                    scenario.id === "emergency" && "border-rose-100 hover:border-rose-300"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl transition-colors",
                    scenario.id === "emergency" ? "bg-rose-50 text-rose-600" : "bg-stone-50 text-stone-600 group-hover:bg-stone-100"
                  )}>
                    <scenario.icon size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-stone-800">{scenario.label}</div>
                    <div className="text-[10px] text-stone-400 line-clamp-1 italic mt-0.5">"{scenario.prompt}"</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="p-5 bg-stone-800 rounded-2xl text-white space-y-4 shadow-xl">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 font-bold">Simulation Context</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Time of Day</span>
                <span className="font-bold text-emerald-400">Business Hours</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">AI Personality</span>
                <span className="font-bold">Professional Office</span>
              </div>
              <div className="pt-2 flex gap-2">
                <button className="flex-1 text-[10px] font-bold uppercase py-2 border border-stone-600 rounded-lg hover:bg-stone-700 transition-colors">Toggle Hours</button>
              </div>
            </div>
          </section>
        </div>

        {/* Center: Transcript */}
        <div className="lg:col-span-2 flex flex-col bg-white border border-stone-200 rounded-[2rem] shadow-2xl overflow-hidden relative">
          <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full", isCalling ? "bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-stone-300")} />
              <span className="text-sm font-bold text-stone-600 uppercase tracking-widest">{isCalling ? "Call in Progress" : "Line Ready"}</span>
            </div>
            {isCalling && <div className="px-3 py-1 bg-stone-200 rounded-full text-[10px] font-mono text-stone-600">00:42</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && !isCalling && (
                <div className="h-full flex flex-col items-center justify-center text-stone-300 gap-6 opacity-50">
                  <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center">
                    <Phone size={48} strokeWidth={1} />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-lg font-serif italic text-stone-400">Ready for testing</p>
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
                    <span className="text-[9px] uppercase font-bold tracking-widest text-stone-400 mb-1.5 px-1">
                      {entry.role === "assistant" ? "Receptionist" : "Caller"}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                      entry.role === "user" ? "bg-stone-800 text-white rounded-tr-none" : 
                      entry.role === "assistant" ? "bg-stone-100 text-stone-800 rounded-tl-none border border-stone-200/50" :
                      "bg-amber-50 text-amber-800 italic text-[11px] border border-amber-100 rounded-lg text-center"
                    )}
                  >
                    {entry.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex gap-1.5 items-center px-5 py-3 bg-stone-50 rounded-2xl w-fit border border-stone-100">
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <div className="p-6 bg-stone-50/50 border-t border-stone-100">
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
                className="flex-1 bg-white border border-stone-200 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 transition-all disabled:opacity-50 shadow-inner"
              />
              <button
                type="submit"
                disabled={!isCalling || isLoading || !userInput.trim()}
                className="p-3 bg-stone-800 text-white rounded-2xl hover:bg-stone-700 transition-all disabled:opacity-50 shadow-lg active:scale-95"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>

        {/* Right: Debug & Captured */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 bg-stone-900 text-stone-300 p-6 rounded-3xl border border-stone-800 overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center gap-2 mb-4 text-[10px] font-mono text-stone-500 uppercase tracking-[0.2em] font-bold">
              <Bug size={14} />
              AI Reasoning
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-3 scrollbar-hide">
              {debugInfo.length === 0 && <span className="opacity-20 italic">Awaiting AI tool calls...</span>}
              {debugInfo.map((info, i) => (
                <div key={i} className="border-l-2 border-emerald-500/30 pl-3 py-1 bg-white/5 rounded-r-lg">
                  <span className="text-emerald-400 font-bold">tool:</span> {info.name}
                  <pre className="text-stone-400 mt-2 whitespace-pre-wrap">{JSON.stringify(info.args, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>

          <div className="h-1/2 bg-white p-6 rounded-3xl border border-stone-200 overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center gap-2 mb-4 text-[10px] font-mono text-stone-400 uppercase tracking-[0.2em] font-bold">
              <AlertCircle size={14} />
              Captured Data
            </div>
            <div className="flex-1 overflow-y-auto text-xs space-y-3">
              {!capturedLead && <span className="opacity-30 italic">Lead data will appear here.</span>}
              {capturedLead && (
                <div className="space-y-2">
                  {Object.entries(capturedLead).map(([key, value]) => (
                    <div key={key} className="flex flex-col border-b border-stone-50 pb-1">
                      <span className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter">{key.replace("_", " ")}</span>
                      <span className="text-stone-800 font-medium">{String(value)}</span>
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
