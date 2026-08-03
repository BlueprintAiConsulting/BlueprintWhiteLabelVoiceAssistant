import React, { useState, useEffect } from "react";
import { db, doc, getDoc, setDoc, handleFirestoreError, OperationType, auth, onAuthStateChanged } from "../firebase.ts";
import { Settings } from "../types.ts";
import { Save, Clock, Phone, Building2, Bot, CheckCircle, AlertCircle, Globe, ShieldAlert, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils.ts";

const DEFAULT_SETTINGS: Settings = {
  office_name: "Blueprint AI HVAC",
  business_hours: {
    start: "09:00",
    end: "17:00",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
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
  after_hours_message: "Thank you for calling Blueprint AI HVAC. Our office is currently closed. If this is an emergency gas leak or no heat call, please stay on the line for instant routing.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"],
  receptionist_voice_style: "professional, warm, and helpful",
  prompt_overrides: ""
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);

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
    try {
      await setDoc(doc(db, "settings", "config"), settings);
      setMessage({ type: "success", text: "Settings saved successfully." });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "settings/config");
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-stone-400 italic font-serif">Loading settings...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-stone-50 p-8 gap-8 overflow-y-auto">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic text-stone-800">Business Profile</h1>
          <p className="text-stone-500 mt-1">Configure how your AI receptionist represents your company.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 bg-stone-800 text-white px-8 py-3 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-stone-700 transition-all shadow-xl shadow-stone-200 disabled:opacity-50 active:scale-95"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            "p-4 rounded-2xl text-sm font-bold flex items-center gap-3 shadow-lg",
            message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
          )}
        >
          {message.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </motion.div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
        {/* Company Identity */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-xl space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-stone-100 rounded-xl text-stone-600">
              <Building2 size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-stone-800">Company Identity</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Company Name</label>
              <input
                type="text"
                value={settings.office_name}
                onChange={(e) => setSettings({ ...settings, office_name: e.target.value })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
                placeholder="e.g. Blueprint HVAC"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all appearance-none"
              >
                <option value="America/New_York">Eastern Time (EST)</option>
                <option value="America/Chicago">Central Time (CST)</option>
                <option value="America/Denver">Mountain Time (MST)</option>
                <option value="America/Los_Angeles">Pacific Time (PST)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Business Hours */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-xl space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-stone-100 rounded-xl text-stone-600">
              <Clock size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-stone-800">Office Hours</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Open Time</label>
              <input
                type="time"
                value={settings.business_hours.start}
                onChange={(e) => setSettings({ ...settings, business_hours: { ...settings.business_hours, start: e.target.value } })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Close Time</label>
              <input
                type="time"
                value={settings.business_hours.end}
                onChange={(e) => setSettings({ ...settings, business_hours: { ...settings.business_hours, end: e.target.value } })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Active Days</label>
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
                      ? "bg-stone-800 text-white border-stone-800 shadow-md" 
                      : "bg-white text-stone-400 border-stone-200 hover:border-stone-400"
                  )}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Emergency Routing & Webhook Dispatch */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-rose-100 shadow-xl space-y-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-lg font-serif italic text-stone-800">Emergency Routing & Dispatch Settings</h2>
                <p className="text-xs text-stone-400">Configure live call transfers and automated emergency alerts for gas leaks & freeze calls.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">On-Call Tech Transfer Phone</label>
              <input
                type="text"
                value={settings.on_call_technician_phone || ""}
                onChange={(e) => setSettings({ ...settings, on_call_technician_phone: e.target.value })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-all"
                placeholder="e.g. +1 (717) 555-0999"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Emergency Dispatch Webhook URL</label>
              <input
                type="url"
                value={settings.emergency_dispatch_webhook || ""}
                onChange={(e) => setSettings({ ...settings, emergency_dispatch_webhook: e.target.value })}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-all font-mono"
                placeholder="https://api.blueprint.ai/webhooks/hvac-emergency"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
              <div>
                <span className="font-bold text-sm text-stone-800">Auto-Transfer Emergencies</span>
                <p className="text-xs text-stone-400">AI automatically transfers call when gas leak or freeze risk detected</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_transfer_emergencies !== false}
                onChange={(e) => setSettings({ ...settings, auto_transfer_emergencies: e.target.checked })}
                className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200">
              <div>
                <span className="font-bold text-sm text-stone-800">SMS / Pager Notifications</span>
                <p className="text-xs text-stone-400">Dispatch instant SMS text alert on emergency lead capture</p>
              </div>
              <input
                type="checkbox"
                checked={settings.sms_alerts_enabled !== false}
                onChange={(e) => setSettings({ ...settings, sms_alerts_enabled: e.target.checked })}
                className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* AI Personality */}
        <section className="bg-stone-900 p-8 rounded-[2.5rem] text-white shadow-2xl space-y-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-stone-800 rounded-xl text-stone-400">
              <Bot size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-stone-100">Receptionist Personality</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 font-bold">Voice & Tone Style</label>
                <input
                  type="text"
                  value={settings.receptionist_voice_style}
                  onChange={(e) => setSettings({ ...settings, receptionist_voice_style: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-2xl px-5 py-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 transition-all"
                  placeholder="e.g. Professional, warm, and helpful"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 font-bold">After Hours Message</label>
                <textarea
                  value={settings.after_hours_message}
                  onChange={(e) => setSettings({ ...settings, after_hours_message: e.target.value })}
                  rows={3}
                  className="w-full bg-stone-800 border border-stone-700 rounded-2xl px-5 py-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 transition-all resize-none"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 font-bold">Custom AI Instructions (Advanced)</label>
              <textarea
                value={settings.prompt_overrides}
                onChange={(e) => setSettings({ ...settings, prompt_overrides: e.target.value })}
                placeholder="Add specific instructions for the AI, like 'Always mention our 10-year warranty'..."
                rows={7}
                className="w-full bg-stone-800 border border-stone-700 rounded-2xl px-5 py-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 transition-all resize-none"
              />
            </div>
          </div>
        </section>

        {/* Emergency & Transfer */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-xl space-y-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
              <ShieldAlert size={20} />
            </div>
            <h2 className="text-lg font-serif italic text-stone-800">Emergency & Escalation</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 bg-stone-50 rounded-2xl border border-stone-100">
                <div>
                  <div className="text-sm font-bold text-stone-800">Live Transfer</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">Forward urgent calls</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, transfer_enabled: !settings.transfer_enabled })}
                  className={cn(
                    "w-14 h-7 rounded-full transition-all relative p-1",
                    settings.transfer_enabled ? "bg-emerald-500" : "bg-stone-300"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-white rounded-full shadow-sm transition-all",
                    settings.transfer_enabled ? "translate-x-7" : "translate-x-0"
                  )} />
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Escalation Phone Number</label>
                <input
                  type="text"
                  value={settings.transfer_phone_number}
                  onChange={(e) => setSettings({ ...settings, transfer_phone_number: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">Emergency Keywords</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="keyword-input"
                  placeholder="Type a keyword (e.g. 'gas leak') and press Enter"
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
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
                  className="px-6 py-3 bg-stone-100 text-stone-600 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 p-4 bg-stone-50/50 rounded-2xl border border-stone-100 min-h-[60px]">
                {settings.emergency_keywords.length === 0 ? (
                  <span className="text-[10px] text-stone-400 italic uppercase tracking-wider m-auto">No keywords added</span>
                ) : (
                  settings.emergency_keywords.map((keyword, i) => (
                    <motion.span 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={keyword} 
                      className="px-3 py-1.5 bg-white border border-stone-200 rounded-full text-[10px] font-bold text-stone-600 uppercase tracking-wider flex items-center gap-2 shadow-sm"
                    >
                      {keyword}
                      <button 
                        type="button"
                        onClick={() => setSettings({ ...settings, emergency_keywords: settings.emergency_keywords.filter((_, idx) => idx !== i) })}
                        className="hover:text-rose-500 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </motion.span>
                  ))
                )}
              </div>
              <p className="text-[10px] text-stone-400 italic">If a caller mentions these, the call is flagged as an emergency.</p>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
