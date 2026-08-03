import React, { useState, useMemo } from "react";
import { CallOutcome, computeQAMetrics, evaluateQAFlags, checkRequiredDetailsCaptured } from "../services/qaService.ts";
import { ShieldCheck, PhoneCall, AlertTriangle, CheckCircle2, UserCheck, Clock, Filter, MessageSquare, AlertCircle, FileText, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mock dataset for initial QA Dashboard demonstration
const MOCK_CALL_OUTCOMES: CallOutcome[] = [
  {
    id: "qa_call_101",
    call_sid: "CA_998811",
    start_time: "2026-08-03T10:15:00Z",
    end_time: "2026-08-03T10:18:30Z",
    duration_seconds: 210,
    source: "phone",
    call_type: "estimate_request",
    lead_id: "lead_101",
    emergency_flag: false,
    appointment_booked: true,
    transfer_attempted: false,
    transfer_success: false,
    final_disposition: "booked",
    transcript: [
      { role: "assistant", text: "Thanks for calling Lunar Heating and Cooling. How can I help you today?" },
      { role: "user", text: "Hi, I need a quote for replacing my 15 year old AC unit in East York." },
      { role: "assistant", text: "I'd be happy to schedule an estimator! May I have your name and callback number?" },
      { role: "user", text: "Sure, my name is Dave Miller at 717-555-0199." }
    ],
    tool_errors: [],
    captured_details: {
      name: "Dave Miller",
      callback_number: "+17175550199",
      address: "124 Market St, East York, PA",
      service_need: "AC Replacement",
      timing: "2026-08-10 10:00"
    },
    qa_flags: [],
    coaching_notes: "Excellent greeting and smooth appointment booking."
  },
  {
    id: "qa_call_102",
    call_sid: "CA_998812",
    start_time: "2026-08-03T11:05:00Z",
    end_time: "2026-08-03T11:06:10Z",
    duration_seconds: 70,
    source: "phone",
    call_type: "emergency",
    lead_id: "lead_102",
    emergency_flag: true,
    appointment_booked: false,
    transfer_attempted: true,
    transfer_success: true,
    final_disposition: "emergency_escalated",
    transcript: [
      { role: "assistant", text: "Thanks for calling Lunar Heating and Cooling. How can I help?" },
      { role: "user", text: "I smell gas near my furnace in Hanover!" },
      { role: "assistant", text: "LIFE SAFETY ALERT: Please evacuate immediately and call 911 or the gas utility!" }
    ],
    tool_errors: [],
    captured_details: {
      callback_number: "+17175550200",
      address: "55 Main St, Hanover, PA",
      service_need: "Gas smell emergency"
    },
    qa_flags: []
  },
  {
    id: "qa_call_103",
    start_time: "2026-08-03T12:00:00Z",
    end_time: "2026-08-03T12:00:12Z",
    duration_seconds: 12,
    source: "simulator",
    call_type: "repair_request",
    emergency_flag: false,
    appointment_booked: false,
    transfer_attempted: false,
    transfer_success: false,
    final_disposition: "abandoned",
    transcript: [
      { role: "user", text: "How much do you charge for diagnostic?" }
    ],
    tool_errors: ["CALENDAR_NOT_CONFIGURED"],
    captured_details: {},
    qa_flags: ["EARLY_CALL_ABANDONMENT", "MISSING_REQUIRED_DETAILS: (name, callback_number, address, service_need, preferred_timing)", "TOOL_EXECUTION_FAILURE"]
  }
];

export default function QADashboard() {
  const [calls, setCalls] = useState<CallOutcome[]>(MOCK_CALL_OUTCOMES);
  const [selectedCall, setSelectedCall] = useState<CallOutcome | null>(null);
  const [coachingInput, setCoachingInput] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFlaggedOnly, setFilterFlaggedOnly] = useState<boolean>(false);

  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      if (filterType !== "all" && c.call_type !== filterType) return false;
      if (filterFlaggedOnly && evaluateQAFlags(c).length === 0) return false;
      return true;
    });
  }, [calls, filterType, filterFlaggedOnly]);

  const metrics = useMemo(() => computeQAMetrics(filteredCalls), [filteredCalls]);

  const handleSaveCoachingNotes = () => {
    if (!selectedCall) return;
    setCalls(prev => prev.map(c => c.id === selectedCall.id ? { ...c, coaching_notes: coachingInput } : c));
    setSelectedCall(prev => prev ? { ...prev, coaching_notes: coachingInput } : null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 sm:p-6 lg:p-8 gap-6 sm:gap-8 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end border-b border-slate-800 pb-5 gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20 shrink-0">
              <ShieldCheck size={22} />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-serif italic text-slate-100">QA Receptionist Performance Dashboard</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">Audit AI receptionist calls, review problem flags, and measure conversion quality.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-full font-mono text-[10px] sm:text-xs font-bold">
            ADMIN AUTHORIZED ACCESS
          </span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 backdrop-blur-md space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">Abandonment Rate</span>
          <div className="text-2xl font-bold text-slate-100 font-mono">{metrics.abandonment_rate_pct}%</div>
          <p className="text-[10px] text-slate-500">Calls ending before resolution</p>
        </div>

        <div className="bg-slate-900/60 p-5 rounded-2xl border border-cyan-500/30 backdrop-blur-md space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400">Booking Conversion</span>
          <div className="text-2xl font-bold text-cyan-300 font-mono">{metrics.booking_conversion_rate_pct}% ({metrics.booked_jobs_count} Jobs)</div>
          <p className="text-[10px] text-slate-500">Confirmed appointment bookings</p>
        </div>

        <div className="bg-slate-900/60 p-5 rounded-2xl border border-emerald-500/30 backdrop-blur-md space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">Detail Capture Rate</span>
          <div className="text-2xl font-bold text-emerald-300 font-mono">{metrics.required_detail_capture_rate_pct}%</div>
          <p className="text-[10px] text-slate-500">Complete required lead info</p>
        </div>

        <div className="bg-slate-900/60 p-5 rounded-2xl border border-amber-500/30 backdrop-blur-md space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400">Flagged Calls</span>
          <div className="text-2xl font-bold text-amber-300 font-mono">{metrics.flagged_calls_count} Calls</div>
          <p className="text-[10px] text-slate-500">Auto-flagged for admin review</p>
        </div>
      </div>

      {/* Objections & Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">Top Caller Objections</h2>
          <div className="space-y-3">
            {metrics.objection_themes.map((ob, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs p-2.5 bg-slate-800/40 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-medium">{ob.theme}</span>
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-mono text-[10px] font-bold">{ob.count} calls</span>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">Call Review Log</h2>
            <div className="flex items-center gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Call Types</option>
                <option value="estimate_request">Estimate Request</option>
                <option value="emergency">Emergency</option>
                <option value="repair_request">Repair Request</option>
              </select>

              <button
                type="button"
                onClick={() => setFilterFlaggedOnly(!filterFlaggedOnly)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                  filterFlaggedOnly ? "bg-amber-500/20 text-amber-300 border-amber-500/50" : "bg-slate-800 text-slate-400 border-slate-700"
                )}
              >
                Flagged Only ({metrics.flagged_calls_count})
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredCalls.map(c => {
              const flags = evaluateQAFlags(c);
              return (
                <div
                  key={c.id}
                  onClick={() => { setSelectedCall(c); setCoachingInput(c.coaching_notes || ""); }}
                  className={cn(
                    "p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center hover:border-cyan-500/50",
                    flags.length > 0 ? "bg-amber-500/5 border-amber-500/30" : "bg-slate-800/40 border-slate-800"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-200">{c.captured_details.name || "Caller"}</span>
                      <span className="text-xs text-slate-400 font-mono">({c.captured_details.callback_number || "No number"})</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase font-mono">{c.source}</span>
                    </div>
                    <p className="text-xs text-slate-400">{c.call_type} • Duration: {c.duration_seconds}s • Disposition: {c.final_disposition}</p>
                    {flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {flags.map((f, i) => (
                          <span key={i} className="text-[9px] px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono font-bold">
                            ⚠️ {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="button" className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold">
                    Review Call
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Call Review Modal */}
      <AnimatePresence>
        {selectedCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 space-y-6 shadow-2xl">
              <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-100">QA Call Inspection</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedCall.id} • Source: {selectedCall.source}</p>
                </div>
                <button type="button" onClick={() => setSelectedCall(null)} className="p-2 text-slate-400 hover:text-slate-200">
                  <X size={20} />
                </button>
              </div>

              {/* Transcript */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-slate-400 font-bold">Call Transcript</h4>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 max-h-60 overflow-y-auto">
                  {selectedCall.transcript.map((t, idx) => (
                    <div key={idx} className={cn("text-xs leading-relaxed p-2 rounded-xl", t.role === "assistant" ? "bg-cyan-950/30 text-cyan-200" : "bg-slate-800 text-slate-200")}>
                      <span className="font-bold uppercase text-[10px] block opacity-60 font-mono">{t.role}</span>
                      {t.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Coaching Notes */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-slate-400 font-bold">Admin Coaching Notes</h4>
                <textarea
                  value={coachingInput}
                  onChange={(e) => setCoachingInput(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 shadow-inner"
                  placeholder="Enter feedback for AI receptionist tuning..."
                />
                <button
                  type="button"
                  onClick={handleSaveCoachingNotes}
                  className="px-4 py-2 bg-cyan-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg hover:bg-cyan-500 transition-all"
                >
                  Save Coaching Feedback
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
