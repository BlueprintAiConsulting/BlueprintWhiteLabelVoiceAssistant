import React, { useState } from "react";
import { TEST_SCENARIOS, TestScenario } from "../lib/testScenarios.ts";
import { runScenario, TestResult } from "../lib/testRunner.ts";
import { Play, CheckCircle, XCircle, AlertCircle, Clock, Search, Filter, Bug, MessageSquare, Database, RotateCcw, Copy, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function QATests() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [highlightedSnippet, setHighlightedSnippet] = useState<string | null>(null);

  const runAllTests = async () => {
    setIsRunning(true);
    const newResults: Record<string, TestResult> = { ...results };
    
    for (const scenario of TEST_SCENARIOS) {
      const result = await runScenario(scenario);
      newResults[scenario.id] = result;
      setResults({ ...newResults });
    }
    
    setIsRunning(false);
  };

  const runSingleTest = async (scenario: TestScenario) => {
    setIsRunning(true);
    const result = await runScenario(scenario);
    setResults(prev => ({ ...prev, [scenario.id]: result }));
    setIsRunning(false);
  };

  const clearResults = () => {
    setResults({});
    setSelectedScenarioId(null);
  };

  const copyTranscript = (transcript: any[]) => {
    const text = transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  const scrollToSnippet = (snippet: string) => {
    if (!snippet) return;
    setHighlightedSnippet(snippet);
    const element = document.getElementById(`transcript-turn-${snippet.slice(0, 20)}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Clear highlight after a few seconds
    setTimeout(() => setHighlightedSnippet(null), 3000);
  };

  const selectedResult = selectedScenarioId ? results[selectedScenarioId] : null;

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Sidebar: Scenarios List */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none border-b md:border-b-0 md:border-r border-slate-800/80 bg-slate-900/60 backdrop-blur-xl flex flex-col shrink-0">
        <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-lg sm:text-xl font-serif italic text-slate-100">QA Tests</h1>
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono font-bold">Automated Scenarios</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearResults}
              className="p-2 text-slate-400 hover:text-rose-400 transition-all rounded-lg hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Clear All Results"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="px-3 py-2 bg-cyan-500 text-cyan-950 rounded-xl hover:bg-cyan-400 transition-all font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(34,211,238,0.3)] min-h-[44px] flex items-center gap-1.5 text-xs uppercase tracking-wider"
              title="Run All Tests"
            >
              <Play size={14} fill="currentColor" />
              <span>Run All</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {TEST_SCENARIOS.map((scenario) => {
            const result = results[scenario.id];
            const isSelected = selectedScenarioId === scenario.id;
            
            return (
              <div key={scenario.id} className="group relative">
                <button
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                    isSelected ? "bg-slate-800/80 border-cyan-500/40 shadow-inner text-white" : "bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300"
                  )}
                >
                  <div className="flex flex-col gap-1 pr-8">
                    <span className="text-sm font-bold">{scenario.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tighter font-mono">{scenario.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result && (
                      result.passed ? (
                        <CheckCircle size={18} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                      ) : (
                        <XCircle size={18} className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.4)]" />
                      )
                    )}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    runSingleTest(scenario);
                  }}
                  disabled={isRunning}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0",
                    isRunning && "cursor-not-allowed"
                  )}
                  title="Rerun this test"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content: Test Details */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-8 py-6 flex justify-between items-center z-10 shadow-lg">
          <div>
            <h2 className="text-xl font-serif italic text-slate-100">Scenario Execution</h2>
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono font-bold">Automated Quality Assurance</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedScenarioId && (
              <button
                onClick={() => runSingleTest(TEST_SCENARIOS.find(s => s.id === selectedScenarioId)!)}
                disabled={isRunning}
                className="flex items-center gap-2 bg-slate-800 text-slate-200 px-4 py-2 rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-slate-700 transition-all border border-slate-700 disabled:opacity-50"
              >
                <Play size={12} fill="currentColor" />
                Run Current
              </button>
            )}
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="flex items-center gap-2 bg-cyan-500 text-cyan-950 px-6 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[11px] hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:opacity-50"
            >
              <Play size={14} fill="currentColor" />
              Run All Tests
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {selectedScenarioId ? (
            <motion.div
              key={selectedScenarioId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="bg-slate-900/40 border-b border-slate-800 p-8">
                <h3 className="text-3xl font-serif italic text-slate-100">{TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.name}</h3>
                <p className="text-slate-400 mt-1">Scenario validation and AI reasoning details.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Result Summary */}
                {selectedResult ? (
                  <div className={cn(
                    "p-6 rounded-3xl border flex items-center gap-4 shadow-lg backdrop-blur-md",
                    selectedResult.passed ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.1)]" : "bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.1)]"
                  )}>
                    {selectedResult.passed ? <CheckCircle size={32} /> : <XCircle size={32} />}
                    <div>
                      <h3 className="text-xl font-bold">{selectedResult.passed ? "Scenario Passed" : "Scenario Failed"}</h3>
                      <p className="text-sm opacity-80">
                        {selectedResult.passed ? "All validation rules met for this scenario." : `${selectedResult.errors.length} validation errors found.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 italic border-2 border-dashed border-slate-800 rounded-3xl">
                    Run the test to see results.
                  </div>
                )}

                {selectedResult && selectedResult.detailedErrors && selectedResult.detailedErrors.length > 0 && (
                  <div className="bg-rose-500/5 border border-rose-500/20 p-6 rounded-2xl space-y-6">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-rose-400 font-bold flex items-center gap-2">
                      <AlertCircle size={14} />
                      Validation Errors
                    </h4>
                    <div className="space-y-4">
                      {selectedResult.detailedErrors.map((err, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "bg-slate-900/80 border border-rose-500/20 rounded-xl p-4 shadow-sm space-y-3 transition-all",
                            err.snippet && "cursor-pointer hover:border-rose-400/50 hover:shadow-md"
                          )}
                          onClick={() => err.snippet && scrollToSnippet(err.snippet)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 p-1 bg-rose-500/20 rounded-full">
                                <XCircle size={12} className="text-rose-400" />
                              </div>
                              <div className="space-y-1">
                                <h5 className="text-sm font-bold text-rose-300">{err.message}</h5>
                                <span className="inline-block px-1.5 py-0.5 bg-rose-500/10 text-rose-300 text-[8px] font-mono font-bold rounded border border-rose-500/20 uppercase tracking-tighter">
                                  {err.type}
                                </span>
                              </div>
                            </div>
                            {err.snippet && (
                              <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <Search size={10} />
                                Click to view context
                              </div>
                            )}
                          </div>
                          
                          {(err.expected || err.actual) && (
                            <div className="grid grid-cols-2 gap-4 ml-7">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Expected</span>
                                <div className="text-xs font-mono bg-slate-950 p-2 rounded border border-slate-800 text-slate-300">
                                  {err.expected || "N/A"}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Actual</span>
                                <div className="text-xs font-mono bg-rose-500/10 p-2 rounded border border-rose-500/20 text-rose-300">
                                  {err.actual || "N/A"}
                                </div>
                              </div>
                            </div>
                          )}

                          {err.snippet && (
                            <div className="ml-7 space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Context Snippet</span>
                              <div className="text-xs italic text-rose-200 bg-rose-950/20 p-3 rounded-xl border border-rose-900/50 truncate shadow-inner">
                                "{err.snippet}"
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Input & Transcript */}
                  <div className="space-y-6">
                    <section className="space-y-3">
                      <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 font-bold flex items-center gap-2">
                        <MessageSquare size={14} />
                        Scenario Turns
                      </h4>
                      <div className="space-y-2">
                        {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.turns.map((turn, i) => (
                          <div key={i} className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-xs italic text-slate-300 leading-relaxed shadow-inner">
                            "{turn}"
                          </div>
                        ))}
                      </div>
                    </section>

                    {selectedResult && (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 font-bold flex items-center gap-2">
                            <Clock size={14} />
                            Full Conversation Transcript
                          </h4>
                          <button
                            onClick={() => copyTranscript(selectedResult.transcript)}
                            className="text-[9px] uppercase tracking-widest text-slate-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Copy size={10} />
                            Copy
                          </button>
                        </div>
                        <div className="space-y-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800">
                          {selectedResult.transcript.map((entry, i) => {
                            const isErrorSnippet = selectedResult.detailedErrors?.some(err => err.snippet === entry.text);
                            const isCurrentlyHighlighted = highlightedSnippet === entry.text;
                            
                            return (
                              <div 
                                key={i} 
                                id={`transcript-turn-${(entry.text || "").slice(0, 20)}`}
                                className={cn(
                                  "flex flex-col gap-1 transition-all duration-500",
                                  entry.role === "user" ? "items-end" : "items-start"
                                )}
                              >
                                <span className="text-[9px] uppercase tracking-tighter text-slate-500 font-bold font-mono">
                                  {entry.role === "assistant" ? "Receptionist" : "Caller"}
                                </span>
                                <div className={cn(
                                  "px-4 py-2.5 rounded-2xl text-xs max-w-[90%] transition-all duration-500 shadow-md",
                                  entry.role === "user" ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 rounded-tr-none" : "bg-slate-900 text-slate-200 border border-slate-700/80 rounded-tl-none",
                                  isErrorSnippet && "border-rose-500/40 bg-rose-500/10",
                                  isCurrentlyHighlighted && "ring-4 ring-cyan-400 ring-offset-4 ring-offset-slate-950 scale-[1.05] shadow-2xl z-20"
                                )}>
                                  {entry.text}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Captured Data & Validation */}
                  <div className="space-y-6">
                    <section className="space-y-3">
                      <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 font-bold flex items-center gap-2">
                        <Database size={14} />
                        Final Extracted Fields
                      </h4>
                      <div className="bg-slate-950 border border-slate-800 text-cyan-400 p-6 rounded-3xl font-mono text-[11px] min-h-[200px] shadow-inner overflow-x-auto">
                        {selectedResult?.capturedData ? (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(selectedResult.capturedData, null, 2)}</pre>
                        ) : (
                          <span className="opacity-30 italic">No data captured yet.</span>
                        )}
                      </div>
                    </section>

                    {selectedResult && (
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 font-bold flex items-center gap-2">
                          <Bug size={14} />
                          Validation Summary
                        </h4>
                        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 space-y-6">
                          {/* Call Type & Emergency Comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <span className="text-slate-400 uppercase font-bold text-[9px] tracking-widest font-mono">Call Classification</span>
                              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-slate-500 uppercase">Expected</span>
                                  <span className="text-xs font-bold text-slate-300 font-mono">{TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.call_type}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-slate-500 uppercase">Actual</span>
                                  <span className={cn(
                                    "text-xs font-bold font-mono",
                                    selectedResult.capturedData?.call_type === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.call_type 
                                      ? "text-emerald-400" 
                                      : "text-rose-400"
                                  )}>
                                    {selectedResult.capturedData?.call_type || "N/A"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <span className="text-slate-400 uppercase font-bold text-[9px] tracking-widest font-mono">Emergency Flag</span>
                              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-slate-500 uppercase">Expected</span>
                                  <span className="text-xs font-bold text-slate-300 font-mono">
                                    {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.emergency_flag ? "YES" : "NO"}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-slate-500 uppercase">Actual</span>
                                  <span className={cn(
                                    "text-xs font-bold font-mono",
                                    selectedResult.capturedData?.emergency_flag === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.emergency_flag 
                                      ? "text-emerald-400" 
                                      : "text-rose-400"
                                  )}>
                                    {selectedResult.capturedData?.emergency_flag ? "YES" : "NO"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Required Fields Checklist */}
                          <div className="pt-4 border-t border-slate-800">
                            <span className="text-slate-400 uppercase font-bold text-[9px] tracking-widest font-mono">Required Fields Verification</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.requiredFields.map(field => {
                                const value = selectedResult.capturedData?.[field];
                                const captured = value !== undefined && value !== null && value !== "";
                                return (
                                  <div key={field as string} className={cn(
                                    "flex items-center justify-between p-2.5 rounded-xl border text-[10px]",
                                    captured ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                  )}>
                                    <span className="font-mono">{field as string}</span>
                                    {captured ? <CheckCircle size={12} className="text-emerald-400" /> : <XCircle size={12} className="text-rose-400" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Appointment Request Verification */}
                          {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved !== undefined && (
                            <div className="pt-4 border-t border-slate-800">
                              <span className="text-slate-400 uppercase font-bold text-[9px] tracking-widest font-mono">Appointment Booking</span>
                              <div className="flex items-center justify-between p-3 mt-2 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-slate-500 uppercase">Should Save</span>
                                  <span className="text-xs font-bold text-slate-300 font-mono">
                                    {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved ? "YES" : "NO"}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-slate-500 uppercase">Actually Saved</span>
                                  <span className={cn(
                                    "text-xs font-bold font-mono",
                                    (!!selectedResult.capturedData?.preferred_appointment_date || !!selectedResult.capturedData?.preferred_time_window) === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved
                                      ? "text-emerald-400" 
                                      : "text-rose-400"
                                  )}>
                                    {(!!selectedResult.capturedData?.preferred_appointment_date || !!selectedResult.capturedData?.preferred_time_window) ? "YES" : "NO"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-6">
              <div className="w-24 h-24 bg-slate-900/60 rounded-full flex items-center justify-center border border-slate-800 shadow-xl">
                <Play size={48} strokeWidth={1} className="text-slate-600 ml-1" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-serif italic text-slate-300">Select a scenario to start testing</p>
                <p className="text-xs text-slate-500 font-mono">Automated validation of AI receptionist logic.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
