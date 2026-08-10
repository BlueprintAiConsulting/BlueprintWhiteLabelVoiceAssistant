import React, { useState, useEffect } from "react";
import { db, collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, writeBatch, handleFirestoreError, OperationType, addDoc, serverTimestamp, auth, onAuthStateChanged } from "../firebase.ts";
import { Lead, CallType, CallStatus } from "../types.ts";
import { Search, Filter, Clock, CheckCircle, XCircle, Trash2, Phone, MapPin, Calendar, MessageSquare, ShieldAlert, Wrench, ThermometerSun, ChevronRight, Activity, Volume2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_COLORS: Record<CallStatus, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.15)]",
  contacted: "bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]",
  booked: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]",
  closed: "bg-slate-800/80 text-slate-400 border-slate-700/80",
  spam: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  emergency_follow_up: "bg-rose-600/25 text-rose-300 border-rose-500 shadow-glow-rose animate-pulse",
  after_hours_follow_up: "bg-purple-500/15 text-purple-400 border-purple-500/30"
};

const TYPE_ICONS: Record<CallType, any> = {
  estimate_request: Calendar,
  emergency: ShieldAlert,
  repair_request: Wrench,
  maintenance_request: ThermometerSun,
  existing_customer: Clock,
  general_office: MessageSquare,
  spam: XCircle
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<CallType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CallStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const q = query(collection(db, "leads"), orderBy("created_at", "desc"));
        const unsubscribeLeads = onSnapshot(q, (snapshot) => {
          const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
          setLeads(leadsData);
          setSelectedLead(prev => prev ? leadsData.find(l => l.id === prev.id) || null : null);
          setIsLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, "leads");
        });
        return () => unsubscribeLeads();
      } else {
        setLeads([]);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const updateStatus = async (leadId: string, status: CallStatus) => {
    try {
      await updateDoc(doc(db, "leads", leadId), { call_status: status, updated_at: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "leads");
    }
  };

  const deleteLead = async (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteDoc(doc(db, "leads", leadId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "leads");
    }
  };

  const clearAllLeads = async () => {
    if (!window.confirm("Are you sure you want to clear all lead entries from the dashboard?")) return;
    try {
      const batch = writeBatch(db);
      leads.forEach(lead => batch.delete(doc(db, "leads", lead.id)));
      await batch.commit();
      setSelectedLead(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "leads");
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      (lead.caller_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      lead.callback_number.includes(searchTerm) ||
      (lead.property_address?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (lead.ai_summary?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    
    const matchesType = filterType === "all" || lead.call_type === filterType;
    const matchesStatus = filterStatus === "all" || lead.call_status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const seedData = async () => {
    const sampleLeads: Partial<Lead>[] = [
      { caller_name: "John Doe", callback_number: "555-0101", call_type: "estimate_request", equipment_type: "Furnace & AC", property_address: "123 Maple St, Brooklyn, NY", call_status: "new", ai_summary: "Wants an estimate for a completely new HVAC system.", transcript: [{ role: "user", text: "I need an estimate for a new furnace." }, { role: "assistant", text: "I can help with that. What's your address?" }] },
      { caller_name: "Jane Smith", callback_number: "555-0102", call_type: "emergency", equipment_type: "Furnace", emergency_flag: true, emergency_type: "No Heat", property_address: "456 Oak Ave, Queens, NY", call_status: "emergency_follow_up", ai_summary: "Furnace stopped working, no heat and it is 15 degrees outside.", transcript: [{ role: "user", text: "My heat stopped working and we are freezing!" }, { role: "assistant", text: "I'm sorry to hear that. What is your phone number so we can call you back immediately?" }] },
      { caller_name: "Mike Johnson", callback_number: "555-0103", call_type: "repair_request", equipment_type: "Central AC", property_address: "789 Pine Rd, Bronx, NY", call_status: "contacted", ai_summary: "AC blowing warm air, wants someone to take a look.", transcript: [] },
      { caller_name: "Sarah Williams", callback_number: "555-0104", call_type: "maintenance_request", equipment_type: "Heat Pump", maintenance_agreement: true, property_address: "321 Birch Ln, Staten Island, NY", call_status: "booked", ai_summary: "Calling to schedule her routine spring tune-up on her maintenance plan.", transcript: [] },
      { caller_name: "Robert Brown", callback_number: "555-0105", call_type: "estimate_request", equipment_type: "Boiler", property_address: "654 Cedar Ct, Manhattan, NY", call_status: "new", ai_summary: "Commercial building owner looking for boiler replacement quote.", transcript: [] },
      { caller_name: "Emily Davis", callback_number: "555-0106", call_type: "emergency", emergency_flag: true, emergency_type: "Gas Leak", property_address: "987 Elm St, Brooklyn, NY", call_status: "emergency_follow_up", ai_summary: "Smells gas near the furnace in the basement.", transcript: [] },
      { caller_name: "David Miller", callback_number: "555-0107", call_type: "repair_request", equipment_type: "Mini-split", property_address: "159 Willow Dr, Queens, NY", call_status: "new", ai_summary: "Mini-split unit in bedroom is leaking water down the wall.", transcript: [] },
      { caller_name: "Linda Wilson", callback_number: "555-0108", call_type: "existing_customer", property_address: "753 Cherry Ln, Bronx, NY", call_status: "contacted", ai_summary: "Checking on the status of the part ordered for her compressor.", transcript: [] },
      { caller_name: "James Moore", callback_number: "555-0109", call_type: "maintenance_request", equipment_type: "Furnace", maintenance_agreement: false, property_address: "852 Spruce St, Staten Island, NY", call_status: "new", ai_summary: "New homeowner wants a general furnace inspection before winter.", transcript: [] },
      { caller_name: "Patricia Taylor", callback_number: "555-0110", call_type: "emergency", emergency_flag: true, emergency_type: "Carbon Monoxide", property_address: "369 Poplar Ave, Brooklyn, NY", call_status: "emergency_follow_up", ai_summary: "CO detectors are going off in the house.", transcript: [] }
    ];

    try {
      const batch = writeBatch(db);
      for (const lead of sampleLeads) {
        const newRef = doc(collection(db, "leads"));
        batch.set(newRef, {
          ...lead,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "leads");
    }
  };

  const bookedCount = leads.filter(l => l.call_status === "booked").length;
  const emergencyCount = leads.filter(l => l.emergency_flag).length;
  const textBackCount = leads.filter(l => l.text_back_sent).length;

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-950 overflow-hidden relative font-sans text-slate-100">
      {/* Background radial glow spots */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        {/* Top Header */}
        <header className="bg-slate-900  border-b border-slate-800/80 p-4 sm:p-6 flex flex-col gap-5 shrink-0 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono text-[10px] uppercase font-bold px-2.5 py-1 rounded-full shadow-glow-cyan-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  System Active
                </span>
                <h1 className="text-xl sm:text-2xl font-serif italic text-slate-100 tracking-tight">Lead Engine Dashboard</h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">Real-time caller telemetry & AI receptionist dispatch log.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {leads.length > 0 ? (
                <button
                  onClick={clearAllLeads}
                  className="text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl transition-all font-medium min-h-[44px] flex items-center gap-2 justify-center shadow-sm hover:shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                  title="Clear all lead logs from Firestore"
                >
                  <Trash2 size={15} />
                  Clear All Leads
                </button>
              ) : (
                <button
                  onClick={seedData}
                  className="text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl transition-all font-medium min-h-[44px] flex items-center gap-2 justify-center shadow-sm"
                >
                  <Activity size={15} className="text-cyan-400" />
                  Seed Demo Data
                </button>
              )}
            </div>
          </div>

          {/* High-Tech Telemetry Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Inbound Card */}
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800/80  relative overflow-hidden shadow-lg hover:border-slate-700/90 transition-all group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-slate-600 via-slate-400 to-slate-600 opacity-60" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Total Inbound
                </span>
                <span className="text-[10px] font-mono text-slate-500">100% AI Automated</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-3xl font-light text-slate-100 tracking-tight">{leads.length}</p>
                <span className="text-[11px] font-mono text-slate-500">calls logged</span>
              </div>
            </div>

            {/* Missed-Call Texts Card */}
            <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20  relative overflow-hidden shadow-lg hover:border-amber-500/40 transition-all group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-300 opacity-80" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Missed-Call Texts
                </span>
                <span className="text-[10px] font-mono text-amber-500/80">Auto SMS</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-3xl font-light text-amber-200 tracking-tight">{textBackCount}</p>
                <span className="text-[11px] font-mono text-amber-400/80">dispatched</span>
              </div>
            </div>

            {/* Emergency Card */}
            <div className="bg-rose-500/5 p-4 rounded-2xl border border-rose-500/20  relative overflow-hidden shadow-lg hover:border-rose-500/40 transition-all group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500 to-red-400 opacity-80" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-rose-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                  Emergency Calls
                </span>
                <span className="text-[10px] font-mono text-rose-400/80">Priority Dispatch</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-3xl font-light text-rose-100 tracking-tight">{emergencyCount}</p>
                <span className="text-[11px] font-mono text-rose-400/80">flagged</span>
              </div>
            </div>

            {/* Booked Card */}
            <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20  relative overflow-hidden shadow-lg hover:border-emerald-500/40 transition-all group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  Booked Appointments
                </span>
                <span className="text-[10px] font-mono text-emerald-400/80">Calendar Synced</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-3xl font-light text-emerald-100 tracking-tight">{bookedCount}</p>
                <span className="text-[11px] font-mono text-emerald-400/80">scheduled</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body & Filters */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto min-w-0 space-y-4">
          {/* Glass Search & Filter Control Bar */}
          <div className="bg-slate-900  p-2 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row gap-2 shadow-lg">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                aria-label="Search leads"
                placeholder="Search leads by name, phone number, address, or summary..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/80 min-h-[44px] transition-all"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 sm:flex-none flex items-center gap-2 bg-slate-950 border border-slate-800/80 px-3 py-2 rounded-xl backdrop-blur-sm min-h-[44px]">
                <Filter size={14} className="text-cyan-400 shrink-0" />
                <select
                  aria-label="Filter by lead type"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="text-xs sm:text-sm bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/80 text-slate-300 font-medium w-full cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Types</option>
                  <option value="estimate_request" className="bg-slate-900">Estimate Request</option>
                  <option value="emergency" className="bg-slate-900">Emergency</option>
                  <option value="repair_request" className="bg-slate-900">Repair Request</option>
                  <option value="maintenance_request" className="bg-slate-900">Maintenance</option>
                  <option value="existing_customer" className="bg-slate-900">Existing Customer</option>
                  <option value="general_office" className="bg-slate-900">General Office</option>
                  <option value="spam" className="bg-slate-900">Spam</option>
                </select>
              </div>
              <div className="flex-1 sm:flex-none flex items-center gap-2 bg-slate-950 border border-slate-800/80 px-3 py-2 rounded-xl backdrop-blur-sm min-h-[44px]">
                <Clock size={14} className="text-cyan-400 shrink-0" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="text-xs sm:text-sm bg-transparent focus:outline-none text-slate-300 font-medium w-full cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Statuses</option>
                  <option value="new" className="bg-slate-900">New</option>
                  <option value="contacted" className="bg-slate-900">Contacted</option>
                  <option value="booked" className="bg-slate-900">Booked</option>
                  <option value="closed" className="bg-slate-900">Closed</option>
                  <option value="spam" className="bg-slate-900">Spam</option>
                  <option value="emergency_follow_up" className="bg-slate-900">Emergency</option>
                  <option value="after_hours_follow_up" className="bg-slate-900">After Hours</option>
                </select>
              </div>
            </div>
          </div>

          {/* Mobile Card List View (< md screen) */}
          <div className="block md:hidden space-y-3">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs bg-slate-900 rounded-2xl border border-slate-800/80">LOADING LEADS TELEMETRY...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs bg-slate-900 rounded-2xl border border-slate-800/80">NO LEADS MATCHING CRITERIA</div>
            ) : (
              filteredLeads.map((lead) => {
                const Icon = TYPE_ICONS[lead.call_type];
                const isEmergency = lead.call_status === "emergency_follow_up";

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer space-y-3 bg-slate-900  active:scale-[0.99] shadow-md relative overflow-hidden",
                      selectedLead?.id === lead.id ? "border-cyan-500 ring-1 ring-cyan-500/50" : "border-slate-800/80 hover:border-slate-700",
                      isEmergency && "bg-rose-950/20 border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2.5 rounded-xl shrink-0 border shadow-inner", isEmergency ? "bg-rose-500/20 text-rose-400 border-rose-500/40" : "bg-slate-800 text-cyan-400 border-slate-700")}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{lead.caller_name || "Unknown Caller"}</div>
                          <div className="text-xs font-mono text-cyan-400/90">{lead.callback_number}</div>
                        </div>
                      </div>
                      <span className={cn("text-[9px] uppercase font-bold px-2.5 py-1 rounded-full tracking-wider border shrink-0", STATUS_COLORS[lead.call_status])}>
                        {lead.call_status.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-2 bg-slate-950 p-3 rounded-xl border border-slate-800/60 font-light">
                      {lead.ai_summary || "No summary captured."}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 font-mono pt-3 border-t border-slate-800/60 gap-3">
                      <span className="truncate max-w-[200px] bg-slate-900/50 px-2 py-1 rounded-md border border-slate-800">{lead.property_address || "No address"}</span>
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                        <span className="text-slate-500 bg-slate-900/50 px-2 py-1 rounded-md border border-slate-800">{lead.created_at?.toDate ? format(lead.created_at.toDate(), "h:mm a") : "Now"}</span>
                        <button
                          onClick={(e) => deleteLead(lead.id!, e)}
                          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg min-h-[44px] bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition-all font-bold tracking-wide shadow-glow-rose-sm hover:shadow-glow-rose"
                          title="Delete Lead"
                        >
                          <Trash2 size={13} />
                          <span className="uppercase text-[9px]">Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View (>= md screen) */}
          <div className="hidden md:block bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden  shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800/80 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  <th className="p-4 pl-6">Type</th>
                  <th className="p-4">Caller</th>
                  <th className="p-4">Summary & Preview</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Time</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-mono text-xs">LOADING LEADS TELEMETRY...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-mono text-xs">NO LEADS MATCHING CRITERIA</td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const Icon = TYPE_ICONS[lead.call_type];
                    const isEmergency = lead.call_status === "emergency_follow_up";
                    const lastMessage = lead.transcript?.[lead.transcript.length - 1]?.text;

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={cn(
                          "hover:bg-slate-800/40 transition-all cursor-pointer group",
                          selectedLead?.id === lead.id && "bg-slate-800 border-slate-700 shadow-[0_0_15px_rgba(34,211,238,0.1)]",
                          isEmergency && "bg-rose-950/30 border-rose-900/50"
                        )}
                      >
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-2.5 rounded-xl border shadow-inner transition-transform group-hover:scale-105", isEmergency ? "bg-rose-500/20 text-rose-400 border-rose-500/40" : "bg-slate-800 text-cyan-400 border-slate-700")}>
                              <Icon size={16} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">{lead.caller_name || "Unknown Caller"}</div>
                          <div className="text-xs font-mono text-cyan-400/90 mt-0.5">{lead.callback_number}</div>
                        </td>
                        <td className="p-4 max-w-xs lg:max-w-md">
                          <div className="text-slate-200 font-light line-clamp-1">{lead.ai_summary || "No summary captured."}</div>
                          {lastMessage && (
                            <div className="text-xs text-slate-400 line-clamp-1 mt-1 font-mono italic">
                              "{lastMessage}"
                            </div>
                          )}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={cn("text-[10px] uppercase font-bold px-2.5 py-1 rounded-full tracking-wider border", STATUS_COLORS[lead.call_status])}>
                            {lead.call_status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                          {lead.created_at?.toDate ? format(lead.created_at.toDate(), "h:mm a") : "Now"}
                        </td>
                        <td className="p-4 pr-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={(e) => deleteLead(lead.id!, e)}
                              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg min-h-[44px] bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition-all font-bold tracking-wide shadow-glow-rose-sm hover:shadow-glow-rose"
                              title="Delete Lead"
                            >
                              <Trash2 size={14} />
                              <span className="uppercase text-[10px]">Delete</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}
                              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg min-h-[44px] bg-slate-800/80 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 border border-slate-700/60 hover:border-cyan-500/40 transition-all shadow-sm font-bold tracking-wide uppercase text-[10px]"
                              title="Inspect Details"
                            >
                              Details <ChevronRight size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Responsive Slide-Over Lead Detail Panel */}
      <AnimatePresence>
        {selectedLead && (
          <>
            {/* Mobile backdrop */}
            <div
              onClick={() => setSelectedLead(null)}
              className="fixed inset-0 bg-slate-950  z-30 md:hidden transition-opacity"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] lg:w-[560px] bg-slate-900  border-l border-slate-800/90 shadow-2xl flex flex-col"
            >
              <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 rounded-xl border shadow-inner shrink-0", selectedLead.call_status === "emergency_follow_up" ? "bg-rose-500/20 text-rose-400 border-rose-500/40" : "bg-slate-800 text-cyan-400 border-slate-700")}>
                    {React.createElement(TYPE_ICONS[selectedLead.call_type], { size: 20 })}
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-serif italic text-slate-100">Lead Inspector</h2>
                    <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold font-mono mt-0.5">
                      ID: {selectedLead.id?.slice(-8)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-2 rounded-xl hover:bg-slate-800/80 min-h-[44px] min-w-[44px] flex items-center justify-center border border-transparent hover:border-slate-700"
                  aria-label="Close detail panel"
                >
                  <XCircle size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Header Info */}
                <div className="flex justify-between items-start bg-slate-950 p-5 rounded-2xl border border-slate-800/80">
                  <div className="space-y-1">
                    <h3 className="text-xl font-medium text-slate-100">{selectedLead.caller_name || "Unknown Caller"}</h3>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone size={14} className="text-cyan-400" />
                      <span className="text-base font-mono text-cyan-400 font-semibold">{selectedLead.callback_number}</span>
                    </div>
                  </div>
                  <span className={cn("text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-widest border shadow-sm", STATUS_COLORS[selectedLead.call_status])}>
                    {selectedLead.call_status.replace("_", " ")}
                  </span>
                </div>

                {/* Quick Action Pills */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => updateStatus(selectedLead.id!, "contacted")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 py-3 rounded-xl hover:bg-amber-500/20 transition-all min-h-[44px]">
                    <Clock size={14} />
                    Mark Contacted
                  </button>
                  <button onClick={() => updateStatus(selectedLead.id!, "booked")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 py-3 rounded-xl hover:bg-emerald-500/20 transition-all min-h-[44px]">
                    <Calendar size={14} />
                    Book Appointment
                  </button>
                  <button onClick={() => updateStatus(selectedLead.id!, "closed")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-slate-800/80 text-slate-400 border border-slate-700 py-3 rounded-xl hover:bg-slate-800 transition-all min-h-[44px]">
                    <CheckCircle size={14} />
                    Archive
                  </button>
                  <button onClick={() => deleteLead(selectedLead.id!)} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 py-3 rounded-xl hover:bg-rose-500/25 transition-all min-h-[44px]">
                    <Trash2 size={14} />
                    Delete Lead
                  </button>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 gap-4 bg-slate-950 p-5 rounded-2xl border border-slate-800/80">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Property Address</div>
                    <div className="text-sm text-slate-200 flex items-center gap-2">
                      <MapPin size={14} className="text-cyan-400" />
                      {selectedLead.property_address || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Equipment</div>
                    <div className="text-sm text-slate-200 flex items-center gap-2">
                      <Wrench size={14} className="text-cyan-400" />
                      {selectedLead.equipment_type || "Unknown"}
                      {selectedLead.maintenance_agreement && (
                        <span className="ml-2 text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Maintenance Plan</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Appointment Request</div>
                    <div className="text-sm text-slate-200 flex items-center gap-2">
                      <Calendar size={14} className="text-cyan-400" />
                      {selectedLead.preferred_appointment_date ? (
                        <span className="font-medium text-cyan-200">
                          {selectedLead.preferred_appointment_date}
                          {selectedLead.preferred_time_window && ` @ ${selectedLead.preferred_time_window}`}
                        </span>
                      ) : "No specific time requested"}
                    </div>
                  </div>

                  {selectedLead.sound_diagnosis && (
                    <div className="space-y-1.5 p-3.5 bg-amber-950/20 rounded-xl border border-amber-500/30">
                      <div className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
                        <Volume2 size={14} />
                        Acoustic Sound Diagnosis
                      </div>
                      <div className="text-sm font-semibold text-slate-100 capitalize">
                        {selectedLead.sound_diagnosis.sound_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-400 font-mono">Probable Cause:</span> {selectedLead.sound_diagnosis.probable_cause}
                      </div>
                      <div className="text-xs text-amber-300/90 italic pt-1 border-t border-amber-500/20">
                        <span className="font-mono not-italic font-bold">Tech Action:</span> {selectedLead.sound_diagnosis.recommended_action}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">AI Triage Summary</div>
                    <div className="text-sm text-cyan-50 leading-relaxed italic border border-cyan-900/30 px-4 py-3 bg-cyan-950/20 rounded-xl shadow-inner">
                      "{selectedLead.ai_summary || "No summary available."}"
                    </div>
                  </div>
                </div>

                {/* Call Transcript */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                    <span>Call Transcript</span>
                    <span className="text-[10px] text-cyan-400 font-normal">{selectedLead.transcript?.length || 0} turns</span>
                  </h4>
                  
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {selectedLead.transcript && selectedLead.transcript.length > 0 ? (
                      selectedLead.transcript.map((t, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "p-3 rounded-xl text-xs leading-relaxed max-w-[90%]",
                            t.role === "user" 
                              ? "bg-slate-800/80 text-slate-200 ml-auto border border-slate-700/60 rounded-br-none" 
                              : "bg-cyan-950/30 text-cyan-100 mr-auto border border-cyan-800/40 rounded-bl-none"
                          )}
                        >
                          <div className="text-[9px] font-mono text-slate-400 mb-1 font-semibold uppercase">
                            {t.role === "user" ? "Caller" : "AI Receptionist"}
                          </div>
                          {t.text}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic p-4 text-center bg-slate-950/40 rounded-xl border border-slate-800/60">
                        No transcript recorded for this call.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
