import React, { useState, useEffect } from "react";
import { db, doc, getDoc, setDoc, handleFirestoreError, OperationType, auth, onAuthStateChanged } from "../firebase.ts";
import { Settings } from "../types.ts";
import { Save, Clock, Phone, Building2, Bot, CheckCircle, AlertCircle, Globe, ShieldAlert, X, Calendar } from "lucide-react";
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
  service_areas: ["New York City", "Brooklyn", "Queens", "Bronx", "Staten Island"],
  transfer_enabled: true,
  transfer_phone_number: "+17175770668",
  on_call_technician_phone: "+17175770668",
  auto_transfer_emergencies: true,
  emergency_dispatch_webhook: "https://api.blueprint.ai/webhooks/hvac-emergency",
  sms_alerts_enabled: true,
  escalation_timeout_minutes: 15,
  after_hours_message: "Thank you for calling Lunar Heating and Cooling. Our office is currently closed. If this is an emergency gas leak or no heat call, please stay on the line for instant routing.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"],
  receptionist_voice_style: "professional, warm, and helpful",
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
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // 1. Always save API key to local storage regardless of Firestore auth state
    if (geminiApiKey) {
      localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }

    // 2. Attempt to save global business settings to Firestore
    try {
      await setDoc(doc(db, "settings", "config"), settings);
      setMessage({ type: "success", text: "API Key and Business Settings saved successfully." });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.warn("Firestore settings save failed (requires Admin login):", error);
      setMessage({ type: "success", text: "API Key saved locally to browser! (Admin login required to save global office profile)." });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-stone-400 italic font-serif">Loading settings...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-transparent p-8 gap-8 overflow-y-auto relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic text-slate-100">Business Profile</h1>
          <p className="text-slate-400 mt-1">Configure how your AI receptionist represents your company.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-8 py-3 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-cyan-600/40 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50 active:scale-95"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? "Saving..." : "Save All Changes"}
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

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
        {/* Core Configuration & API Key */}
        <div className="space-y-8">
          <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.5)] space-y-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
                <Bot size={20} />
              </div>
              <h2 className="text-lg font-serif italic text-slate-100">AI Configuration</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">Gemini API Key</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all placeholder:text-slate-500 shadow-inner"
                />
                <p className="text-xs text-slate-500 mt-2">Required for Voice Mode. Saved securely in your browser's local storage.</p>
              </div>
            </div>
          </section>

          {/* Company Identity */}
          <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.5)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Building2 size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-slate-100">Company Identity</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Business Name</label>
              <input
                type="text"
                value={settings.office_name}
                onChange={(e) => setSettings({ ...settings, office_name: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all placeholder:text-slate-500 shadow-inner"
                placeholder="e.g. Blueprint HVAC"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none shadow-inner"
              >
                <option value="America/New_York">Eastern Time (EST)</option>
                <option value="America/Chicago">Central Time (CST)</option>
                <option value="America/Denver">Mountain Time (MST)</option>
                <option value="America/Los_Angeles">Pacific Time (PST)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Google Calendar & Appointment Booking */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="text-lg font-serif italic text-slate-100">Google Calendar & Booking Rules</h2>
              <p className="text-xs text-slate-400">Manage calendar integration, slot windows, and SMS booking confirmations.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Google Calendar ID</label>
              <input
                type="text"
                value={settings.calendar_id || ""}
                onChange={(e) => setSettings({ ...settings, calendar_id: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner placeholder:text-slate-500"
                placeholder="primary or hvac-dispatch@company.com"
              />
              <p className="text-[10px] text-slate-500">Service account credentials are strictly stored in server secrets (`GOOGLE_PRIVATE_KEY`).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Appointment Duration</label>
                <select
                  value={settings.appointment_duration_minutes || 60}
                  onChange={(e) => setSettings({ ...settings, appointment_duration_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none shadow-inner"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={90}>90 Minutes</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Buffer Between Calls</label>
                <select
                  value={settings.appointment_buffer_minutes || 15}
                  onChange={(e) => setSettings({ ...settings, appointment_buffer_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none shadow-inner"
                >
                  <option value={0}>0 Min (Back-to-back)</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">SMS Booking Confirmation</span>
                <p className="text-xs text-slate-500">Send caller instant text confirmation when event is scheduled</p>
              </div>
              <input
                type="checkbox"
                checked={settings.sms_booking_confirmation_enabled !== false}
                onChange={(e) => setSettings({ ...settings, sms_booking_confirmation_enabled: e.target.checked })}
                className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Twilio & Telephony SIP Integration */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
                <Phone size={20} />
              </div>
              <div>
                <h2 className="text-lg font-serif italic text-slate-100">Twilio Telephony & SIP Trunking</h2>
                <p className="text-xs text-slate-400">Configure production phone lines, Media Streams, and warm transfer gateways.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Telephony Enabled</span>
              <input
                type="checkbox"
                checked={settings.twilio_enabled !== false}
                onChange={(e) => setSettings({ ...settings, twilio_enabled: e.target.checked })}
                className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Inbound Phone Number</label>
              <input
                type="text"
                value={settings.twilio_phone_number || ""}
                onChange={(e) => setSettings({ ...settings, twilio_phone_number: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner placeholder:text-slate-500"
                placeholder="+1 (717) 555-0199"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">On-Call Warm Transfer Target</label>
              <input
                type="text"
                value={settings.twilio_transfer_number || ""}
                onChange={(e) => setSettings({ ...settings, twilio_transfer_number: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono shadow-inner placeholder:text-slate-500"
                placeholder="+1 (717) 555-0999"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 italic">Twilio Auth Tokens and Webhook Signing Keys are strictly managed via server secrets (`TWILIO_AUTH_TOKEN`).</p>
        </section>

        {/* Operational Safeguards & Privacy */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-lg font-serif italic text-slate-100">Operational Safeguards & Consent</h2>
              <p className="text-xs text-slate-400">Configure emergency dispatch protocols, call recording consent, and data retention.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">Require Call Recording Consent</span>
                <p className="text-xs text-slate-500">Prompt caller for recording consent before initializing audio recording</p>
              </div>
              <input
                type="checkbox"
                checked={settings.recording_consent_required !== false}
                onChange={(e) => setSettings({ ...settings, recording_consent_required: e.target.checked })}
                className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Transcript Retention (Days)</label>
                <select
                  value={settings.recording_retention_days || 90}
                  onChange={(e) => setSettings({ ...settings, recording_retention_days: Number(e.target.value) })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none shadow-inner"
                >
                  <option value={30}>30 Days</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days (Standard)</option>
                  <option value={365}>1 Year</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Auto Emergency Escalation</label>
                <select
                  value={settings.auto_transfer_emergencies !== false ? "enabled" : "disabled"}
                  onChange={(e) => setSettings({ ...settings, auto_transfer_emergencies: e.target.value === "enabled" })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none shadow-inner"
                >
                  <option value="enabled">Enabled (Auto Transfer)</option>
                  <option value="disabled">Disabled (Callback Task Only)</option>
                </select>
              </div>
            </div>
          </div>
        </section>
        </div>

        {/* Business Hours */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.5)] space-y-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Clock size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-slate-100">Office Hours</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Open Time</label>
              <input
                type="time"
                value={settings.business_hours.start}
                onChange={(e) => setSettings({ ...settings, business_hours: { ...settings.business_hours, start: e.target.value } })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Close Time</label>
              <input
                type="time"
                value={settings.business_hours.end}
                onChange={(e) => setSettings({ ...settings, business_hours: { ...settings.business_hours, end: e.target.value } })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner [color-scheme:dark]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const days = settings.business_hours.days.includes(day)
                      ? settings.business_hours.days.filter(d => d !== day)
                      : [...settings.business_hours.days, day];
                    setSettings({ ...settings, business_hours: { ...settings.business_hours, days } });
                  }}
                  className={cn(
                    "text-[10px] px-3 py-1.5 rounded-full border transition-all font-bold uppercase tracking-wider",
                    settings.business_hours.days.includes(day) 
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]" 
                      : "bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-600"
                  )}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Emergency Routing & Webhook Dispatch */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.05)] space-y-6 lg:col-span-2 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 blur-[100px] rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-lg font-serif italic text-slate-100">Emergency Routing & Dispatch Settings</h2>
                <p className="text-xs text-slate-400">Configure live call transfers and automated emergency alerts for gas leaks & freeze calls.</p>
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
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-all shadow-inner placeholder:text-slate-500"
                placeholder="e.g. +1 (717) 555-0999"
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

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">Auto-Transfer Emergencies</span>
                <p className="text-xs text-slate-500">AI automatically transfers call when gas leak or freeze risk detected</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_transfer_emergencies !== false}
                onChange={(e) => setSettings({ ...settings, auto_transfer_emergencies: e.target.checked })}
                className="w-5 h-5 accent-rose-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <div>
                <span className="font-bold text-sm text-slate-200">SMS / Pager Notifications</span>
                <p className="text-xs text-slate-500">Dispatch instant SMS text alert on emergency lead capture</p>
              </div>
              <input
                type="checkbox"
                checked={settings.sms_alerts_enabled !== false}
                onChange={(e) => setSettings({ ...settings, sms_alerts_enabled: e.target.checked })}
                className="w-5 h-5 accent-rose-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Missed-Call Text Back */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.05)] space-y-6 lg:col-span-2 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
                <Phone size={20} />
              </div>
              <div>
                <h2 className="text-lg font-serif italic text-slate-100">Missed-Call Text Back Settings</h2>
                <p className="text-xs text-slate-400">Never lose an unanswered call. Automatically text back dropped or missed callers immediately.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Auto Text-Back Enabled</span>
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
              placeholder="Hi! This is Lunar Heating and Cooling. Sorry we missed your call..."
            />
            <p className="text-[11px] text-slate-500">Use <code className="bg-slate-800 px-1 py-0.5 rounded font-mono text-cyan-400">{"{{name}}"}</code> to insert customer's name if available.</p>
          </div>
        </section>

        {/* AI Personality */}
        <section className="bg-slate-800/80 p-8 rounded-[2.5rem] border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.05)] space-y-6 lg:col-span-2 relative overflow-hidden backdrop-blur-md">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className="p-2 bg-cyan-500/20 rounded-xl text-cyan-400 border border-cyan-500/30">
              <Bot size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-slate-100">Receptionist Personality</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Voice & Tone Style</label>
                <input
                  type="text"
                  value={settings.receptionist_voice_style}
                  onChange={(e) => setSettings({ ...settings, receptionist_voice_style: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all placeholder:text-slate-500 shadow-inner"
                  placeholder="e.g. Professional, warm, and helpful"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">After Hours Message</label>
                <textarea
                  value={settings.after_hours_message}
                  onChange={(e) => setSettings({ ...settings, after_hours_message: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none shadow-inner"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Custom AI Instructions (Advanced)</label>
              <textarea
                value={settings.prompt_overrides}
                onChange={(e) => setSettings({ ...settings, prompt_overrides: e.target.value })}
                placeholder="Add specific instructions for the AI, like 'Always mention our 10-year warranty'..."
                rows={7}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none placeholder:text-slate-500 font-mono text-xs shadow-inner"
              />
            </div>
          </div>
        </section>

        {/* Emergency & Transfer */}
        <section className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.5)] space-y-6 lg:col-span-2 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <Phone size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-slate-100">Escalation & Routing</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 bg-slate-800/30 rounded-2xl border border-slate-700/50">
                <div>
                  <div className="text-sm font-bold text-slate-200">Live Transfer</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Forward urgent calls</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, transfer_enabled: !settings.transfer_enabled })}
                  className={cn(
                    "w-14 h-7 rounded-full transition-all relative p-1 shadow-inner",
                    settings.transfer_enabled ? "bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-slate-700"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-white rounded-full shadow-sm transition-all",
                    settings.transfer_enabled ? "translate-x-7" : "translate-x-0"
                  )} />
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Escalation Phone Number</label>
                <input
                  type="text"
                  value={settings.transfer_phone_number}
                  onChange={(e) => setSettings({ ...settings, transfer_phone_number: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner text-slate-200 placeholder:text-slate-500"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 font-bold">Emergency Keywords</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="keyword-input"
                  placeholder="e.g. 'gas leak' then Enter"
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner text-slate-200 placeholder:text-slate-500"
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
                  className="px-6 py-3 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-600/40 transition-all shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50 min-h-[60px]">
                {settings.emergency_keywords.length === 0 ? (
                  <span className="text-[10px] text-slate-500 italic uppercase tracking-wider m-auto">No keywords added</span>
                ) : (
                  settings.emergency_keywords.map((keyword, i) => (
                    <motion.span 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={keyword} 
                      className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-full text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 shadow-sm"
                    >
                      {keyword}
                      <button 
                        type="button"
                        onClick={() => setSettings({ ...settings, emergency_keywords: settings.emergency_keywords.filter((_, idx) => idx !== i) })}
                        className="hover:text-rose-400 transition-colors text-slate-500"
                      >
                        <X size={12} />
                      </button>
                    </motion.span>
                  ))
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic">If a caller mentions these, the call is flagged as an emergency.</p>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
