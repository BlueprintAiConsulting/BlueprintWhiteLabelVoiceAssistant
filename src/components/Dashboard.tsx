import React, { useState, useEffect } from "react";
import { db, collection, query, orderBy, onSnapshot, updateDoc, doc, handleFirestoreError, OperationType, addDoc, serverTimestamp, auth, onAuthStateChanged } from "../firebase.ts";
import { Lead, CallType, CallStatus } from "../types.ts";
import { Search, Filter, AlertCircle, Clock, CheckCircle, XCircle, Trash2, ExternalLink, Phone, MapPin, Calendar, MessageSquare, ShieldAlert, User, Wrench, ThermometerSun } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_COLORS: Record<CallStatus, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  booked: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  closed: "bg-slate-800 text-slate-400 border-slate-700",
  spam: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  emergency_follow_up: "bg-rose-600/20 text-rose-400 border-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.5)] animate-pulse",
  after_hours_follow_up: "bg-purple-500/10 text-purple-400 border-purple-500/20"
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
      if (selectedLead?.id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, call_status: status } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "leads");
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
      { caller_name: "Patricia Taylor", callback_number: "555-0110", call_type: "emergency", emergency_flag: true, emergency_type: "Carbon Monoxide", property_address: "369 Poplar Ave, Brooklyn, NY", call_status: "emergency_follow_up", ai_summary: "CO detectors are going off in the house.", transcript: [] },
      { caller_name: "Christopher Anderson", callback_number: "555-0111", call_type: "spam", call_status: "spam", ai_summary: "Robocall about credit card debt.", transcript: [] },
      { caller_name: "Barbara Thomas", callback_number: "555-0112", call_type: "general_office", call_status: "closed", ai_summary: "Asking about pricing for annual maintenance agreements.", transcript: [] }
    ];

    for (const lead of sampleLeads) {
      await addDoc(collection(db, "leads"), {
        ...lead,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    }
  };

  const bookedCount = leads.filter(l => l.call_status === "booked").length;
  const emergencyCount = leads.filter(l => l.emergency_flag).length;
  const textBackCount = leads.filter(l => l.text_back_sent).length;

  return (
    <div className="flex h-full bg-transparent overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="bg-slate-900/40 backdrop-blur-md border-b border-slate-800 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono text-[10px] uppercase font-bold px-2.5 py-0.5 rounded shadow-[0_0_8px_rgba(34,211,238,0.2)]">System Active</span>
                <h1 className="text-2xl font-serif italic text-slate-100">Lead Engine Dashboard</h1>
              </div>
              <p className="text-sm text-slate-400 mt-1">Goal: Never miss another lead for Lunar Heating and Cooling.</p>
            </div>
            <div className="flex gap-2">
              {leads.length === 0 && (
                <button
                  onClick={seedData}
                  className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  Seed Demo Data
                </button>
              )}
            </div>
          </div>

          {/* Stage 1 Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>Total Inbound</span>
              <p className="text-3xl font-light text-slate-200 mt-1">{leads.length}</p>
            </div>
            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-full blur-xl -mr-8 -mt-8 group-hover:bg-amber-500/20 transition-all"></div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Missed-Call Texts</span>
              <p className="text-3xl font-light text-amber-100 mt-1">{textBackCount}</p>
            </div>
            <div className="bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl -mr-8 -mt-8 group-hover:bg-rose-500/20 transition-all"></div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-500 font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.8)]"></span>Emergency Routed</span>
              <p className="text-3xl font-light text-rose-100 mt-1">{emergencyCount}</p>
            </div>
            <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl -mr-8 -mt-8 group-hover:bg-emerald-500/20 transition-all"></div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span>Appointments</span>
              <p className="text-3xl font-light text-emerald-100 mt-1">{bookedCount}</p>
            </div>
          </div>
        </header>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 px-4 py-2 rounded-lg backdrop-blur-sm">
              <Filter size={14} className="text-cyan-500" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="text-sm bg-transparent focus:outline-none text-slate-300 font-medium"
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
            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 px-4 py-2 rounded-lg backdrop-blur-sm">
              <Clock size={14} className="text-cyan-500" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-sm bg-transparent focus:outline-none text-slate-300 font-medium"
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

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/50 border-b border-slate-800">
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">Type</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">Caller</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">Summary & Preview</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">Status</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-500 font-mono text-sm">LOADING LEADS...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-500 font-mono text-sm">NO LEADS MATCHING CRITERIA</td>
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
                          "border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors cursor-pointer group",
                          selectedLead?.id === lead.id && "bg-slate-800/60 border-l-2 border-l-cyan-500",
                          isEmergency && "bg-rose-900/10 border-l-2 border-l-rose-500"
                        )}
                      >
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-2 rounded-lg shadow-inner", isEmergency ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-slate-800 text-cyan-400 border border-slate-700")}>
                              <Icon size={16} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-medium text-slate-200">{lead.caller_name || "Unknown"}</div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">{lead.callback_number}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-slate-300 font-medium line-clamp-1">{lead.ai_summary || "No summary"}</div>
                          {lastMessage && (
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                              "{lastMessage}"
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={cn("text-[9px] uppercase font-bold px-2 py-1 rounded-md tracking-wider border", STATUS_COLORS[lead.call_status])}>
                            {lead.call_status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-stone-500">
                          {lead.created_at?.toDate ? format(lead.created_at.toDate(), "h:mm a") : "Now"}
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

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedLead && (
            <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="w-[450px] bg-slate-900/90 backdrop-blur-xl border-l border-slate-700 shadow-2xl flex flex-col z-20"
          >
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg shadow-inner", selectedLead.call_status === "emergency_follow_up" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-slate-800 text-cyan-400 border border-slate-700")}>
                  {React.createElement(TYPE_ICONS[selectedLead.call_type], { size: 20 })}
                </div>
                <div>
                  <h2 className="text-lg font-serif italic text-slate-100">Lead Detail</h2>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold font-mono mt-0.5">
                    ID: {selectedLead.id?.slice(-6)}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XCircle size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Header Info */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-2xl font-medium text-slate-100">{selectedLead.caller_name || "Unknown Caller"}</h3>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone size={14} className="text-cyan-500" />
                    <span className="text-base font-mono text-cyan-400">{selectedLead.callback_number}</span>
                  </div>
                </div>
                <span className={cn("text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-widest border shadow-sm", STATUS_COLORS[selectedLead.call_status])}>
                  {selectedLead.call_status.replace("_", " ")}
                </span>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => updateStatus(selectedLead.id!, "contacted")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 py-3 rounded-xl hover:bg-slate-700 transition-all shadow-sm">
                  <Phone size={14} />
                  Contacted
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "booked")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 py-3 rounded-xl hover:bg-cyan-600/30 transition-all shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                  <Calendar size={14} />
                  Book Appointment
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "closed")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-slate-900/50 text-slate-500 border border-slate-800 py-3 rounded-xl hover:bg-slate-800 transition-all">
                  <CheckCircle size={14} />
                  Archive
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "spam")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 py-3 rounded-xl hover:bg-rose-500/20 transition-all">
                  <XCircle size={14} />
                  Spam
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 gap-6 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-inner">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Property Address</div>
                  <div className="text-sm text-slate-300 flex items-center gap-2">
                    <MapPin size={14} className="text-cyan-500/70" />
                    {selectedLead.property_address || "Not provided"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Equipment</div>
                  <div className="text-sm text-slate-300 flex items-center gap-2">
                    <Wrench size={14} className="text-cyan-500/70" />
                    {selectedLead.equipment_type || "Unknown"}
                    {selectedLead.maintenance_agreement && (
                      <span className="ml-2 text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_5px_rgba(34,211,238,0.2)]">Maintenance Plan</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Appointment Request</div>
                  <div className="text-sm text-slate-300 flex items-center gap-2">
                    <Calendar size={14} className="text-cyan-500/70" />
                    {selectedLead.preferred_appointment_date ? (
                      <span className="font-medium text-cyan-100">
                        {selectedLead.preferred_appointment_date}
                        {selectedLead.preferred_time_window && ` @ ${selectedLead.preferred_time_window}`}
                      </span>
                    ) : "No specific time requested"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">AI Summary</div>
                  <div className="text-sm text-slate-400 leading-relaxed italic border-l-2 border-slate-700 pl-3">
                    "{selectedLead.ai_summary || "No summary available."}"
                  </div>
                </div>
              </div>

              {/* Transcript */}
              {selectedLead.transcript && selectedLead.transcript.length > 0 && (
                <div className="space-y-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                    Conversation Terminal
                  </div>
                  <div className="space-y-4 font-mono text-xs">
                    {selectedLead.transcript.map((entry, i) => (
                      <div key={i} className={cn(
                        "flex flex-col gap-1",
                        entry.role === "user" ? "items-end" : "items-start"
                      )}>
                        <span className="text-[9px] uppercase tracking-tighter text-slate-500 font-bold">
                          {entry.role === "assistant" ? "AI Receptionist" : "Caller"}
                        </span>
                        <div className={cn(
                          "px-4 py-2.5 rounded-lg max-w-[90%] border backdrop-blur-sm",
                          entry.role === "user" ? "bg-slate-800/80 text-cyan-100 border-slate-700" : "bg-cyan-900/20 text-cyan-300 border-cyan-500/20"
                        )}>
                          {entry.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
