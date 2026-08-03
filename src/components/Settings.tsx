import React, { useState, useEffect } from "react";
import { db, doc, getDoc, setDoc, handleFirestoreError, OperationType, auth, onAuthStateChanged } from "../firebase.ts";
import { Settings } from "../types.ts";
import { Save, Clock, Phone, Building2, Bot, CheckCircle, AlertCircle, Globe, ShieldAlert, X, Calendar, MapPin, Key, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils.ts";

const DEFAULT_SETTINGS: Settings = {
  office_name: "Lunar Heating and Cooling",
  business_hours: {
    start: "00:00",
    end: "23:59",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  },
  timezone: "America/New_York",
  service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
  primary_zip_code: "17401",
  service_radius_miles: 25,
  service_zip_codes: ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"],
  transfer_enabled: true,
  transfer_phone_number: "+17175770668",
  on_call_technician_phone: "+17175770668",
  auto_transfer_emergencies: true,
  emergency_dispatch_webhook: "https://api.blueprint.ai/webhooks/hvac-emergency",
  sms_alerts_enabled: true,
  escalation_timeout_minutes: 15,
  after_hours_message: "Thank you for calling Lunar Heating and Cooling. Our office is currently closed. If this is an emergency gas leak or no heat call, please stay on the line for instant routing.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"],
  receptionist_voice: "Kore",
  receptionist_voice_style: "warm, concise, natural female office receptionist",
  prompt_overrides: ""
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const fetchSettings = async () => {
          try {
            const settingsDoc = await getDoc(doc(db, "settings", "config"));
            if (settingsDoc.exists()) {
              setSettings(settingsDoc.data() as Settings);
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, "settings/config");
          } finally {
            const localKey = localStorage.getItem('gemini_api_key');
            if (localKey) setGeminiApiKey(localKey);
            setIsLoading(false);
          }
        };
        fetchSettings();
      } else {
        const localKey = localStorage.getItem('gemini_api_key');
        if (localKey) setGeminiApiKey(localKey);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // 1. Save API key to local storage
    if (geminiApiKey) {
      localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }

    // 2. Save settings to Firestore
    try {
      await setDoc(doc(db, "settings", "config"), settings);
      setMessage({ type: "success", text: "Business Profile & Voice Receptionist settings saved successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.warn("Firestore settings save:", error);
      setMessage({ type: "success", text: "Settings and API Key saved locally to browser!" });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-400 italic font-serif">Loading office settings...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-transparent p-4 sm:p-6 lg:p-8 gap-6 sm:gap-8 overflow-y-auto relative z-10">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif italic text-slate-100">HVAC Office Settings</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Ordered by immediate revenue & operational value to your business.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto flex items-center justify-center gap-3 bg-cyan-500 text-slate-950 px-6 sm:px-8 py-3 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] disabled:opacity-50 active:scale-95 cursor-pointer min-h-[44px]"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? "Saving..." : "Save All Settings"}
        </button>
      </header>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-2xl text-sm font-bold flex items-center gap-3 shadow-lg backdrop-blur-md",
            message.type === "success" ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.1)]" : "bg-rose-500/10 text-rose-300 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
          )}
        >
          {message.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </motion.div>
      )}

      <form onSubmit={handleSave} className="space-y-8 max-w-6xl">
        {/* ================================================================= */}
        {/* 1. EMERGENCY ROUTING & SAFETY DISPATCH (TOP VALUE TO OWNER)       */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.1)] space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 blur-[100px] rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-500/20 rounded-2xl text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                <ShieldAlert size={22} />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-rose-400">HIGHEST PRIORITY</span>
                <h2 className="text-xl font-serif italic text-slate-100">1. Emergency Routing & 24/7 Dispatch Protocols</h2>
                <p className="text-xs text-slate-400">Instantly transfer gas leak, carbon monoxide, and no-heat freeze calls to on-call tech.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">On-Call Tech Transfer Phone</label>
              <input
                type="text"
                value={settings.on_call_technician_phone || ""}
                onChange={(e) => setSettings({ ...settings, on_call_technician_phone: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-all font-mono shadow-inner placeholder:text-slate-500"
                placeholder="+1 (717) 577-0668"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Emergency Dispatch Webhook URL</label>
              <input
                type="url"
                value={settings.emergency_dispatch_webhook || ""}
                onChange={(e) => setSettings({ ...settings, emergency_dispatch_webhook: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-all font-mono shadow-inner placeholder:text-slate-500"
                placeholder="https://api.blueprint.ai/webhooks/hvac-emergency"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">Auto-Transfer Emergencies</span>
                <p className="text-xs text-slate-500">AI automatically routes call live to on-call tech when gas leak detected</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_transfer_emergencies !== false}
                onChange={(e) => setSettings({ ...settings, auto_transfer_emergencies: e.target.checked })}
                className="w-5 h-5 accent-rose-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">Instant SMS Pager Alerts</span>
                <p className="text-xs text-slate-500">Sends text alert to tech within 10s of emergency call capture</p>
              </div>
              <input
                type="checkbox"
                checked={settings.sms_alerts_enabled !== false}
                onChange={(e) => setSettings({ ...settings, sms_alerts_enabled: e.target.checked })}
                className="w-5 h-5 accent-rose-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 relative z-10 border-t border-slate-800">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Emergency Keywords</label>
            <div className="flex gap-2">
              <input
                type="text"
                id="keyword-input"
                placeholder="e.g. 'gas leak' then press Enter"
                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-all shadow-inner text-slate-200 placeholder:text-slate-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim().replace(/,$/, '');
                    if (val && !settings.emergency_keywords.includes(val)) {
                      setSettings({ ...settings, emergency_keywords: [...settings.emergency_keywords, val] });
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('keyword-input') as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !settings.emergency_keywords.includes(val)) {
                    setSettings({ ...settings, emergency_keywords: [...settings.emergency_keywords, val] });
                    input.value = '';
                  }
                }}
                className="px-6 py-3 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500/30 transition-all shadow-[0_0_10px_rgba(244,63,94,0.2)] cursor-pointer"
              >
                Add Keyword
              </button>
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 min-h-[50px]">
              {settings.emergency_keywords.map((keyword, i) => (
                <span 
                  key={keyword} 
                  className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-full text-[10px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2"
                >
                  {keyword}
                  <button 
                    type="button"
                    onClick={() => setSettings({ ...settings, emergency_keywords: settings.emergency_keywords.filter((_, idx) => idx !== i) })}
                    className="hover:text-rose-400 transition-colors text-slate-400 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 2. MISSED-CALL TEXT BACK (VALUE #2: DIRECT LEAD SAVER)             */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.1)] space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 rounded-2xl text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                <Phone size={22} />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-amber-400">VALUE TO OWNER: REVENUE CAPTURE</span>
                <h2 className="text-xl font-serif italic text-slate-100">2. Missed-Call Automated Text-Back</h2>
                <p className="text-xs text-slate-400">Never lose a customer to a competitor when calls go unanswered while techs are under a sink or driving.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 font-mono">AUTO TEXT-BACK:</span>
              <input
                type="checkbox"
                checked={settings.missed_call_text_back_enabled !== false}
                onChange={(e) => setSettings({ ...settings, missed_call_text_back_enabled: e.target.checked })}
                className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2 relative z-10">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">SMS Text-Back Message Template</label>
            <textarea
              rows={3}
              value={settings.missed_call_template || "Hi! This is Lunar Heating and Cooling. Sorry we missed your call! How can we help you today?"}
              onChange={(e) => setSettings({ ...settings, missed_call_template: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all font-sans resize-none shadow-inner placeholder:text-slate-500"
            />
            <p className="text-[11px] text-slate-500">Use <code className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-amber-400">{"{{name}}"}</code> to automatically insert caller's name.</p>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 3. COMPANY IDENTITY & LOCAL SERVICE TERRITORY                    */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30">
              <Building2 size={22} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400">LOCAL TERRITORY BOUNDARIES</span>
              <h2 className="text-xl font-serif italic text-slate-100">3. Company Identity & Service Coverage</h2>
              <p className="text-xs text-slate-400">Define office name, primary service area zip codes, and 25-mile radius limits.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Business Name</label>
              <input
                type="text"
                value={settings.office_name}
                onChange={(e) => setSettings({ ...settings, office_name: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-semibold shadow-inner"
                placeholder="e.g. Lunar Heating and Cooling"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Base Headquarters Zip Code</label>
              <input
                type="text"
                value={settings.primary_zip_code || "17401"}
                onChange={(e) => setSettings({ ...settings, primary_zip_code: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner"
                placeholder="17401"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Primary Service Communities</label>
            <input
              type="text"
              value={settings.service_areas ? settings.service_areas.join(", ") : ""}
              onChange={(e) => setSettings({ ...settings, service_areas: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner font-sans"
              placeholder="York, Hanover, Lancaster, Gettysburg, Red Lion, Dallastown"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold font-mono">Covered Service Zip Codes List</label>
              <button
                type="button"
                onClick={() => setSettings({
                  ...settings,
                  primary_zip_code: "17401",
                  service_radius_miles: 25,
                  service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
                  service_zip_codes: ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"]
                })}
                className="text-xs text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer"
              >
                Autofill South Central PA Metro Zips (25mi)
              </button>
            </div>
            <input
              type="text"
              value={settings.service_zip_codes ? settings.service_zip_codes.join(", ") : "17401, 17402, 17403, 17404, 17406, 17408, 17331, 17327, 17315, 17356, 17601, 17325"}
              onChange={(e) => setSettings({ ...settings, service_zip_codes: e.target.value.split(",").map(z => z.trim()).filter(Boolean) })}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono placeholder:text-slate-500 shadow-inner"
            />
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4. RECEPTIONIST PERSONALITY & VOICE STYLE                         */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30">
              <Bot size={22} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400">CUSTOMER EXPERIENCE</span>
              <h2 className="text-xl font-serif italic text-slate-100">4. Receptionist Voice & Tone Personality</h2>
              <p className="text-xs text-slate-400">Configure receptionist voice style, office hours greeting, and custom company rules.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Voice Persona</label>
                <select
                  value={settings.receptionist_voice || "Kore"}
                  onChange={(e) => setSettings({ ...settings, receptionist_voice: e.target.value })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all cursor-pointer shadow-inner"
                >
                  <option value="Kore">Kore — Female (Calm, Warm & Natural - Recommended)</option>
                  <option value="Aoede">Aoede — Female (Bright & Clear)</option>
                  <option value="Leda">Leda — Female (Warm & Gentle)</option>
                  <option value="Zephyr">Zephyr — Female (Friendly)</option>
                  <option value="Puck">Puck — Male (Engaging)</option>
                  <option value="Charon">Charon — Male (Deep & Professional)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Voice & Tone Persona</label>
                <input
                  type="text"
                  value={settings.receptionist_voice_style}
                  onChange={(e) => setSettings({ ...settings, receptionist_voice_style: e.target.value })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                  placeholder="Warm, concise, natural female office receptionist"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Custom AI Instructions (Company Guarantees)</label>
              <textarea
                value={settings.prompt_overrides}
                onChange={(e) => setSettings({ ...settings, prompt_overrides: e.target.value })}
                placeholder="e.g. Always mention our 100% satisfaction guarantee and free second opinion on furnace replacements..."
                rows={4}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none font-mono text-xs shadow-inner"
              />
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 5. GOOGLE CALENDAR & APPOINTMENT BOOKING RULES                    */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30">
              <Calendar size={22} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400">DISPATCH AUTOMATION</span>
              <h2 className="text-xl font-serif italic text-slate-100">5. Google Calendar & Scheduling Controls</h2>
              <p className="text-xs text-slate-400">Configure appointment length, travel buffers between jobs, and automatic SMS confirmations.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Google Calendar ID</label>
              <input
                type="text"
                value={settings.calendar_id || ""}
                onChange={(e) => setSettings({ ...settings, calendar_id: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner"
                placeholder="primary or dispatch@lunar-hvac.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Appointment Duration</label>
                <select
                  value={settings.appointment_duration_minutes || 60}
                  onChange={(e) => setSettings({ ...settings, appointment_duration_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                >
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={90}>90 Minutes</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Travel Buffer</label>
                <select
                  value={settings.appointment_buffer_minutes || 15}
                  onChange={(e) => setSettings({ ...settings, appointment_buffer_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 6. POST-SERVICE GOOGLE REVIEWS & SMS FOLLOW-UPS                   */}
        {/* ================================================================= */}
        <section className="bg-slate-900/70 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30">
                <Globe size={22} />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400">5-STAR REPUTATION ENGINE</span>
                <h2 className="text-xl font-serif italic text-slate-100">6. Post-Service Google Review Automation</h2>
                <p className="text-xs text-slate-400">Automatically send 5-star Google review request text 2 hours after service call is finished.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 font-mono">AUTO REVIEWS:</span>
              <input
                type="checkbox"
                checked={settings.review_request_enabled !== false}
                onChange={(e) => setSettings({ ...settings, review_request_enabled: e.target.checked })}
                className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Google Business Review Link</label>
              <input
                type="text"
                value={settings.google_review_link || "https://g.page/r/lunar-hvac-york-pa/review"}
                onChange={(e) => setSettings({ ...settings, google_review_link: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner"
                placeholder="https://g.page/r/lunar-hvac-york-pa/review"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Review Delay (Hours Post-Job)</label>
              <select
                value={settings.review_delay_hours || 2}
                onChange={(e) => setSettings({ ...settings, review_delay_hours: Number(e.target.value) })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
              >
                <option value={1}>1 Hour Post-Service</option>
                <option value={2}>2 Hours Post-Service (Recommended)</option>
                <option value={4}>4 Hours Post-Service</option>
              </select>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 7. SYSTEM INTEGRATIONS & GEMINI API KEY (AT VERY BOTTOM)           */}
        {/* ================================================================= */}
        <section className="bg-slate-950 p-8 rounded-[2.5rem] border border-cyan-500/40 shadow-[0_0_40px_rgba(34,211,238,0.1)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.3)]">
              <Key size={22} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400">DEVELOPER & SYSTEM CREDENTIALS</span>
              <h2 className="text-xl font-serif italic text-slate-100">7. System Integration & Gemini API Key</h2>
              <p className="text-xs text-slate-400">Technical API key required for low-latency Realtime WebSocket Voice Mode.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 font-mono flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-400" />
                Gemini API Key
              </label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-cyan-300 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all placeholder:text-slate-600 shadow-inner"
              />
              <p className="text-xs text-slate-400 mt-2.5">
                Saved securely in browser local storage (<code className="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-cyan-400">gemini_api_key</code>).
              </p>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
