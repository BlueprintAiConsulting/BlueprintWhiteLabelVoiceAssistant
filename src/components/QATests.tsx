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
    <div className="flex h-full bg-stone-50 overflow-hidden">
      {/* Sidebar: Scenarios List */}
      <div className="w-80 border-r border-stone-200 bg-white flex flex-col">
        <div className="p-6 border-b border-stone-100 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-serif italic text-stone-800">QA Tests</h1>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Automated Scenarios</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearResults}
              className="p-2 text-stone-400 hover:text-rose-500 transition-all"
              title="Clear All Results"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="p-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-all disabled:opacity-50"
              title="Run All Tests"
            >
              <Play size={16} fill="currentColor" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {TEST_SCENARIOS.map((scenario) => {
            const result = results[scenario.id];
            const isSelected = selectedScenarioId === scenario.id;
            
            return (
              <div key={scenario.id} className="group relative">
                <button
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                    isSelected ? "bg-stone-50 border-stone-300 shadow-sm" : "bg-white border-stone-100 hover:border-stone-200"
                  )}
                >
                  <div className="flex flex-col gap-1 pr-8">
                    <span className="text-sm font-bold text-stone-800">{scenario.name}</span>
                    <span className="text-[10px] text-stone-400 uppercase tracking-tighter font-mono">{scenario.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result && (
                      result.passed ? (
                        <CheckCircle size={18} className="text-emerald-500" />
                      ) : (
                        <XCircle size={18} className="text-rose-500" />
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
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0",
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
        <header className="bg-white border-b border-stone-200 px-8 py-6 flex justify-between items-center z-10 shadow-sm">
          <div>
            <h2 className="text-xl font-serif italic text-stone-800">Scenario Execution</h2>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Automated Quality Assurance</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedScenarioId && (
              <button
                onClick={() => runSingleTest(TEST_SCENARIOS.find(s => s.id === selectedScenarioId)!)}
                disabled={isRunning}
                className="flex items-center gap-2 bg-stone-100 text-stone-600 px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-[10px] hover:bg-stone-200 transition-all disabled:opacity-50"
              >
                <Play size={12} fill="currentColor" />
                Run Current
              </button>
            )}
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="flex items-center gap-2 bg-stone-800 text-white px-6 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[11px] hover:bg-stone-700 transition-all shadow-lg shadow-stone-200 disabled:opacity-50"
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
              <div className="bg-stone-50/50 border-b border-stone-200 p-8">
                <h3 className="text-3xl font-serif italic text-stone-800">{TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.name}</h3>
                <p className="text-stone-500 mt-1">Scenario validation and AI reasoning details.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Result Summary */}
                {selectedResult ? (
                  <div className={cn(
                    "p-6 rounded-3xl border flex items-center gap-4 shadow-sm",
                    selectedResult.passed ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"
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
                  <div className="p-12 text-center text-stone-300 italic border-2 border-dashed border-stone-200 rounded-3xl">
                    Run the test to see results.
                  </div>
                )}

                {selectedResult && selectedResult.detailedErrors && selectedResult.detailedErrors.length > 0 && (
                  <div className="bg-rose-900/5 border border-rose-200 p-6 rounded-2xl space-y-6">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-rose-600 font-bold flex items-center gap-2">
                      <AlertCircle size={14} />
                      Validation Errors
                    </h4>
                    <div className="space-y-4">
                      {selectedResult.detailedErrors.map((err, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "bg-white border border-rose-100 rounded-xl p-4 shadow-sm space-y-3 transition-all",
                            err.snippet && "cursor-pointer hover:border-rose-300 hover:shadow-md"
                          )}
                          onClick={() => err.snippet && scrollToSnippet(err.snippet)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 p-1 bg-rose-100 rounded-full">
                                <XCircle size={12} className="text-rose-600" />
                              </div>
                              <div className="space-y-1">
                                <h5 className="text-sm font-bold text-rose-900">{err.message}</h5>
                                <span className="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-600 text-[8px] font-mono font-bold rounded border border-rose-100 uppercase tracking-tighter">
                                  {err.type}
                                </span>
                              </div>
                            </div>
                            {err.snippet && (
                              <div className="text-[8px] text-stone-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <Search size={10} />
                                Click to view context
                              </div>
                            )}
                          </div>
                          
                          {(err.expected || err.actual) && (
                            <div className="grid grid-cols-2 gap-4 ml-7">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-stone-400 font-bold">Expected</span>
                                <div className="text-xs font-mono bg-stone-50 p-2 rounded border border-stone-100 text-stone-600">
                                  {err.expected || "N/A"}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-stone-400 font-bold">Actual</span>
                                <div className="text-xs font-mono bg-rose-50 p-2 rounded border border-rose-100 text-rose-700">
                                  {err.actual || "N/A"}
                                </div>
                              </div>
                            </div>
                          )}

                          {err.snippet && (
                            <div className="ml-7 space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-stone-400 font-bold">Context Snippet</span>
                              <div className="text-xs italic text-stone-500 bg-stone-50 p-3 rounded-lg border-l-2 border-rose-300 truncate">
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
                      <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold flex items-center gap-2">
                        <MessageSquare size={14} />
                        Scenario Turns
                      </h4>
                      <div className="space-y-2">
                        {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.turns.map((turn, i) => (
                          <div key={i} className="bg-white p-3 rounded-xl border border-stone-200 text-xs italic text-stone-600 leading-relaxed">
                            "{turn}"
                          </div>
                        ))}
                      </div>
                    </section>

                    {selectedResult && (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold flex items-center gap-2">
                            <Clock size={14} />
                            Full Conversation Transcript
                          </h4>
                          <button
                            onClick={() => copyTranscript(selectedResult.transcript)}
                            className="text-[9px] uppercase tracking-widest text-stone-400 hover:text-stone-600 font-bold flex items-center gap-1"
                          >
                            <Copy size={10} />
                            Copy
                          </button>
                        </div>
                        <div className="space-y-4 bg-stone-50 p-6 rounded-2xl border border-stone-100">
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
                                <span className="text-[9px] uppercase tracking-tighter text-stone-400 font-bold">
                                  {entry.role === "assistant" ? "Receptionist" : "Caller"}
                                </span>
                                <div className={cn(
                                  "px-4 py-2 rounded-2xl text-xs max-w-[90%] transition-all duration-500",
                                  entry.role === "user" ? "bg-stone-800 text-white rounded-tr-none" : "bg-white text-stone-700 border border-stone-200 rounded-tl-none",
                                  isErrorSnippet && "border-rose-200 bg-rose-50/30",
                                  isCurrentlyHighlighted && "ring-4 ring-rose-400 ring-offset-4 scale-[1.05] shadow-2xl z-20"
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
                      <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold flex items-center gap-2">
                        <Database size={14} />
                        Final Extracted Fields
                      </h4>
                      <div className="bg-stone-900 text-emerald-400 p-6 rounded-3xl font-mono text-[11px] min-h-[200px] shadow-xl overflow-x-auto">
                        {selectedResult?.capturedData ? (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(selectedResult.capturedData, null, 2)}</pre>
                        ) : (
                          <span className="opacity-30 italic">No data captured yet.</span>
                        )}
                      </div>
                    </section>

                    {selectedResult && (
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold flex items-center gap-2">
                          <Bug size={14} />
                          Validation Summary
                        </h4>
                        <div className="bg-white p-6 rounded-2xl border border-stone-200 space-y-6">
                          {/* Call Type & Emergency Comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <span className="text-stone-400 uppercase font-bold text-[9px] tracking-widest">Call Classification</span>
                              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-stone-400 uppercase">Expected</span>
                                  <span className="text-xs font-bold text-stone-600">{TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.call_type}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-stone-400 uppercase">Actual</span>
                                  <span className={cn(
                                    "text-xs font-bold",
                                    selectedResult.capturedData?.call_type === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.call_type 
                                      ? "text-emerald-600" 
                                      : "text-rose-600"
                                  )}>
                                    {selectedResult.capturedData?.call_type || "N/A"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <span className="text-stone-400 uppercase font-bold text-[9px] tracking-widest">Emergency Flag</span>
                              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-stone-400 uppercase">Expected</span>
                                  <span className="text-xs font-bold text-stone-600">
                                    {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.emergency_flag ? "YES" : "NO"}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-stone-400 uppercase">Actual</span>
                                  <span className={cn(
                                    "text-xs font-bold",
                                    selectedResult.capturedData?.emergency_flag === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.emergency_flag 
                                      ? "text-emerald-600" 
                                      : "text-rose-600"
                                  )}>
                                    {selectedResult.capturedData?.emergency_flag ? "YES" : "NO"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Required Fields Checklist */}
                          <div className="pt-4 border-t border-stone-100">
                            <span className="text-stone-400 uppercase font-bold text-[9px] tracking-widest">Required Fields Verification</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.requiredFields.map(field => {
                                const value = selectedResult.capturedData?.[field];
                                const captured = value !== undefined && value !== null && value !== "";
                                return (
                                  <div key={field as string} className={cn(
                                    "flex items-center justify-between p-2 rounded-lg border text-[10px]",
                                    captured ? "bg-emerald-50/50 border-emerald-100 text-emerald-800" : "bg-rose-50/50 border-rose-100 text-rose-800"
                                  )}>
                                    <span className="font-mono">{field as string}</span>
                                    {captured ? <CheckCircle size={12} className="text-emerald-500" /> : <XCircle size={12} className="text-rose-500" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Appointment Request Verification */}
                          {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved !== undefined && (
                            <div className="pt-4 border-t border-stone-100">
                              <span className="text-stone-400 uppercase font-bold text-[9px] tracking-widest">Appointment Booking</span>
                              <div className="flex items-center justify-between p-3 mt-2 bg-stone-50 rounded-xl border border-stone-100">
                                <div className="flex flex-col">
                                  <span className="text-[8px] text-stone-400 uppercase">Should Save</span>
                                  <span className="text-xs font-bold text-stone-600">
                                    {TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved ? "YES" : "NO"}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[8px] text-stone-400 uppercase">Actually Saved</span>
                                  <span className={cn(
                                    "text-xs font-bold",
                                    (!!selectedResult.capturedData?.preferred_appointment_date || !!selectedResult.capturedData?.preferred_time_window) === TEST_SCENARIOS.find(s => s.id === selectedScenarioId)?.expected.appointmentRequestSaved
                                      ? "text-emerald-600" 
                                      : "text-rose-600"
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
            <div className="flex-1 flex flex-col items-center justify-center text-stone-300 gap-6">
              <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center">
                <Play size={48} strokeWidth={1} className="text-stone-200" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-serif italic text-stone-400">Select a scenario to start testing</p>
                <p className="text-xs">Automated validation of AI receptionist logic.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
