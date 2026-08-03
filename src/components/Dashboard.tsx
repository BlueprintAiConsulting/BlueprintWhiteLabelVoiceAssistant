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
  new: "bg-blue-50 text-blue-700 border-blue-100",
  contacted: "bg-amber-50 text-amber-700 border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border-emerald-100",
  closed: "bg-stone-50 text-stone-600 border-stone-100",
  spam: "bg-rose-50 text-rose-700 border-rose-100",
  emergency_follow_up: "bg-rose-600 text-white border-rose-700 shadow-sm animate-pulse",
  after_hours_follow_up: "bg-purple-50 text-purple-700 border-purple-100"
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

  return (
    <div className="flex h-full bg-stone-50 overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-stone-200 p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-serif italic text-stone-800">Call Logs</h1>
            <p className="text-sm text-stone-500">Real-time inbound lead tracking.</p>
          </div>
          <div className="flex gap-2">
            {leads.length === 0 && (
              <button
                onClick={seedData}
                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-3 py-1.5 rounded-md transition-colors"
              >
                Seed Demo Data
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="text"
                placeholder="Search by name, phone, address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 transition-colors w-72"
              />
            </div>
          </div>
        </header>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2 bg-white border border-stone-200 px-3 py-1.5 rounded-lg">
              <Filter size={14} className="text-stone-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="text-sm bg-transparent focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="estimate_request">Estimate Request</option>
                <option value="emergency">Emergency</option>
                <option value="repair_request">Repair Request</option>
                <option value="maintenance_request">Maintenance</option>
                <option value="existing_customer">Existing Customer</option>
                <option value="general_office">General Office</option>
                <option value="spam">Spam</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white border border-stone-200 px-3 py-1.5 rounded-lg">
              <Clock size={14} className="text-stone-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-sm bg-transparent focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="booked">Booked</option>
                <option value="closed">Closed</option>
                <option value="spam">Spam</option>
                <option value="emergency_follow_up">Emergency</option>
                <option value="after_hours_follow_up">After Hours</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Type</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Caller</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Summary & Preview</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Status</th>
                  <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-stone-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-stone-400 italic">Loading leads...</td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-stone-400 italic">No leads found matching your criteria.</td>
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
                          "border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer group",
                          selectedLead?.id === lead.id && "bg-stone-50",
                          isEmergency && "bg-rose-50/30 border-l-4 border-l-rose-600"
                        )}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-md", isEmergency ? "bg-rose-600 text-white" : "bg-stone-100 text-stone-600")}>
                              <Icon size={16} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-medium text-stone-800">{lead.caller_name || "Unknown"}</div>
                          <div className="text-xs text-stone-500">{lead.callback_number}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm text-stone-700 font-medium line-clamp-1">{lead.ai_summary || "No summary"}</div>
                          {lastMessage && (
                            <div className="text-[11px] text-stone-400 italic line-clamp-1 mt-0.5">
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
            className="w-[450px] bg-white border-l border-stone-200 shadow-2xl flex flex-col z-20"
          >
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", selectedLead.call_status === "emergency_follow_up" ? "bg-rose-600 text-white" : "bg-stone-800 text-white")}>
                  {React.createElement(TYPE_ICONS[selectedLead.call_type], { size: 20 })}
                </div>
                <div>
                  <h2 className="text-lg font-serif italic text-stone-800">Lead Detail</h2>
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                    ID: {selectedLead.id?.slice(-6)}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-stone-400 hover:text-stone-800 transition-colors">
                <XCircle size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Header Info */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-2xl font-medium text-stone-900">{selectedLead.caller_name || "Unknown Caller"}</h3>
                  <div className="flex items-center gap-2 text-stone-500">
                    <Phone size={14} />
                    <span className="text-base font-mono">{selectedLead.callback_number}</span>
                  </div>
                </div>
                <span className={cn("text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-widest border shadow-sm", STATUS_COLORS[selectedLead.call_status])}>
                  {selectedLead.call_status.replace("_", " ")}
                </span>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => updateStatus(selectedLead.id!, "contacted")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-white text-stone-700 border border-stone-200 py-3 rounded-xl hover:bg-stone-50 transition-all shadow-sm">
                  <Phone size={14} />
                  Contacted
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "booked")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white py-3 rounded-xl hover:bg-emerald-700 transition-all shadow-md">
                  <Calendar size={14} />
                  Book Appointment
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "closed")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-white text-stone-500 border border-stone-100 py-3 rounded-xl hover:bg-stone-50 transition-all">
                  <CheckCircle size={14} />
                  Archive
                </button>
                <button onClick={() => updateStatus(selectedLead.id!, "spam")} className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-white text-rose-500 border border-rose-100 py-3 rounded-xl hover:bg-rose-50 transition-all">
                  <XCircle size={14} />
                  Spam
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 gap-6 bg-stone-50 p-6 rounded-2xl border border-stone-100">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Property Address</div>
                  <div className="text-sm text-stone-800 flex items-center gap-2">
                    <MapPin size={14} className="text-stone-400" />
                    {selectedLead.property_address || "Not provided"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Equipment</div>
                  <div className="text-sm text-stone-800 flex items-center gap-2">
                    <Wrench size={14} className="text-stone-400" />
                    {selectedLead.equipment_type || "Unknown"}
                    {selectedLead.maintenance_agreement && (
                      <span className="ml-2 text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Maintenance Plan</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Appointment Request</div>
                  <div className="text-sm text-stone-800 flex items-center gap-2">
                    <Calendar size={14} className="text-stone-400" />
                    {selectedLead.preferred_appointment_date ? (
                      <span className="font-medium">
                        {selectedLead.preferred_appointment_date}
                        {selectedLead.preferred_time_window && ` @ ${selectedLead.preferred_time_window}`}
                      </span>
                    ) : "No specific time requested"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">AI Summary</div>
                  <div className="text-sm text-stone-700 leading-relaxed italic">
                    "{selectedLead.ai_summary || "No summary available."}"
                  </div>
                </div>
              </div>

              {/* Transcript */}
              {selectedLead.transcript && selectedLead.transcript.length > 0 && (
                <div className="space-y-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Conversation History</div>
                  <div className="space-y-4">
                    {selectedLead.transcript.map((entry, i) => (
                      <div key={i} className={cn(
                        "flex flex-col gap-1",
                        entry.role === "user" ? "items-end" : "items-start"
                      )}>
                        <span className="text-[9px] uppercase tracking-tighter text-stone-400 font-bold">
                          {entry.role === "assistant" ? "Receptionist" : "Caller"}
                        </span>
                        <div className={cn(
                          "px-4 py-2 rounded-2xl text-xs max-w-[90%]",
                          entry.role === "user" ? "bg-stone-800 text-white rounded-tr-none" : "bg-stone-100 text-stone-700 rounded-tl-none"
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
