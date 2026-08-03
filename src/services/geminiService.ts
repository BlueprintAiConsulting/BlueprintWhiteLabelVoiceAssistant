import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { db, auth, addDoc, collection, serverTimestamp, handleFirestoreError, OperationType, doc, getDoc } from "../firebase.ts";
import { Lead, CallType, CallStatus, Settings } from "../types.ts";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const DEFAULT_SETTINGS: Settings = {
  office_name: "Lunar Heating and Cooling",
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
  after_hours_message: "Thank you for calling Lunar Heating and Cooling. Our office is currently closed. If this is an emergency gas leak or no heat call, please stay on the line for instant routing.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"],
  receptionist_voice_style: "professional office staff",
  prompt_overrides: ""
};

export async function getSettings(): Promise<Settings> {
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "config"));
    if (settingsDoc.exists()) {
      return settingsDoc.data() as Settings;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function createReceptionistChat(): Promise<Chat> {
  const settings = await getSettings();
  
  const systemInstruction = `
    You are the front desk receptionist for ${settings.office_name}.
    Your goal is to handle inbound calls efficiently, identify the reason for the call, and collect ONLY the essential details needed for follow-up.
    
    TONE & STYLE:
    - Professional, warm, and helpful office staff.
    - Be concise. Don't use filler phrases like "I understand" or "I'm sorry to hear that" every single time.
    - Sound like a human, not a script. Vary your greetings and acknowledgments.
    - Ask ONE question at a time. Never double-barrel questions.
    
    INTAKE LOGIC (STRICT MINIMALISM):
    - Identify the call type immediately.
    - Collect ONLY what is necessary for that type.
    - NEW ESTIMATE: Name, Phone, Address, Equipment Type (e.g., Furnace, AC), Preferred Date/Time. (Set call_type to 'estimate_request' and emergency_flag to false).
    - EMERGENCY: Phone FIRST, then Address, then what's happening. (Set call_type to 'emergency' and emergency_flag to true).
    - REPAIR: Name, Phone, Address, Issue, Equipment Type, Preferred Date/Time. (Set call_type to 'repair_request' and emergency_flag to false).
    - MAINTENANCE/TUNE-UP: Name, Phone, Address, Equipment Type. (Set call_type to 'maintenance_request' and maintenance_agreement to true if they are on a plan).
    - EXISTING CUSTOMER: Name, Phone, what update they need. (Set call_type to 'existing_customer' and emergency_flag to false).
    - GENERAL/SPAM: Name, Phone, Reason. If spam, end quickly. (Set call_type to 'general_office' or 'spam' and emergency_flag to false).
    
    EMERGENCY CRITERIA:
    - Gas leaks, carbon monoxide alarms, no heat in freezing weather, sparks/smoke from unit, or major water leaks.
    - Keywords that signal an emergency: ${settings.emergency_keywords.join(", ")}.
    - If it's an emergency, prioritize getting the callback number and address immediately so we don't lose them if the call drops.
    
    BUSINESS RULES:
    - Business hours: ${settings.business_hours.days.join(", ")} from ${settings.business_hours.start} to ${settings.business_hours.end}.
    - If transfer is enabled (${settings.transfer_enabled}) and it's an emergency during business hours, tell them you're connecting them to a specialist now.
    
    ENDING:
    - Confirm the next steps clearly (e.g., "Someone will call you back within 30 minutes").
    - Call 'saveLead' as soon as you have the core info. Don't wait for a "perfect" transcript.
    - IMPORTANT: Always set 'emergency_flag' to false unless the call explicitly meets the emergency criteria.
    
    ${settings.prompt_overrides}
  `;

  const saveLeadTool = {
    name: "saveLead",
    description: "Saves the captured lead details to the database.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        caller_name: { type: Type.STRING, description: "The name of the caller." },
        callback_number: { type: Type.STRING, description: "The phone number to call back." },
        reason_for_call: { type: Type.STRING, description: "A brief description of why they are calling." },
        call_type: { 
          type: Type.STRING, 
          enum: ["estimate_request", "emergency", "repair_request", "maintenance_request", "existing_customer", "general_office", "spam"],
          description: "The category of the call."
        },
        emergency_flag: { 
          type: Type.BOOLEAN, 
          description: "Set to true ONLY if the call is an emergency (gas leak, no heat in freezing weather, etc.). Set to false for all other calls." 
        },
        emergency_type: { type: Type.STRING, description: "If emergency, the type of emergency (e.g., 'gas leak', 'no heat')." },
        property_address: { type: Type.STRING, description: "The address of the property in question." },
        customer_type: { type: Type.STRING, description: "e.g., 'residential' or 'commercial'." },
        equipment_type: { type: Type.STRING, description: "The type of HVAC equipment (e.g., 'Furnace', 'Heat Pump', 'Central AC', 'Boiler', 'Mini-split')." },
        issue_description: { type: Type.STRING, description: "Detailed description of the problem or request." },
        preferred_appointment_date: { type: Type.STRING, description: "Date the customer prefers for an appointment." },
        preferred_time_window: { type: Type.STRING, description: "Time of day the customer prefers (e.g., 'morning')." },
        maintenance_agreement: { type: Type.BOOLEAN, description: "Whether this is for a routine maintenance agreement/tune-up." },
        ai_summary: { type: Type.STRING, description: "A concise summary of the entire conversation." },
        call_status: { 
          type: Type.STRING, 
          enum: ["new", "contacted", "booked", "closed", "spam", "emergency_follow_up", "after_hours_follow_up"],
          description: "The initial status of the lead."
        },
        transfer_attempted: { type: Type.BOOLEAN },
        transfer_result: { type: Type.STRING }
      },
      required: ["callback_number", "call_type", "emergency_flag"]
    }
  };

  const transferCallTool = {
    name: "transferCall",
    description: "Initiates an immediate live call transfer to an on-call technician or phone extension when an emergency is detected or caller requests live specialist.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target_number: { type: Type.STRING, description: "Phone number to transfer the call to." },
        reason: { type: Type.STRING, description: "Reason for the transfer (e.g. 'Emergency Gas Leak', 'Customer Request')." },
        caller_callback_number: { type: Type.STRING, description: "The caller's callback number." },
        emergency_context: { type: Type.STRING, description: "Key details for the receiving technician." }
      },
      required: ["reason", "caller_callback_number"]
    }
  };

  const checkAppointmentSlotsTool = {
    name: "checkAppointmentSlots",
    description: "Queries available technician time slots for estimates, repairs, or seasonal tune-ups.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        service_type: { type: Type.STRING, description: "e.g. 'estimate', 'repair', 'tune_up'" },
        requested_date: { type: Type.STRING, description: "Requested date (YYYY-MM-DD or day name)." },
        preferred_window: { type: Type.STRING, description: "'morning' or 'afternoon'" }
      },
      required: ["service_type"]
    }
  };

  const bookAppointmentTool = {
    name: "bookAppointment",
    description: "Finalizes an HVAC service appointment booking with date, time window, and address, locking it into the schedule.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        caller_name: { type: Type.STRING, description: "Customer name." },
        callback_number: { type: Type.STRING, description: "Phone number." },
        appointment_date: { type: Type.STRING, description: "Confirmed appointment date." },
        time_window: { type: Type.STRING, description: "Time window (e.g. '8:00 AM - 12:00 PM', 'Morning', 'Afternoon')." },
        service_type: { type: Type.STRING, description: "Type of service (e.g. 'AC Repair', 'Furnace Estimate', 'Tune-Up')." },
        property_address: { type: Type.STRING, description: "Service property address." }
      },
      required: ["callback_number", "appointment_date", "time_window", "service_type"]
    }
  };

  return ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [saveLeadTool, transferCallTool, checkAppointmentSlotsTool, bookAppointmentTool] }]
    }
  });
}

export async function triggerMissedCallTextBack(callbackNumber: string, callerName?: string) {
  try {
    const settings = await getSettings();
    if (settings.missed_call_text_back_enabled === false) return;

    const messageTemplate = settings.missed_call_template || "Hi! This is Lunar Heating and Cooling. Sorry we missed your call! How can we help you today?";
    const textMessage = messageTemplate.replace("{{name}}", callerName || "there");

    console.log(`[MISSED CALL TEXT BACK] Triggered SMS to ${callbackNumber}: "${textMessage}"`);

    // Dispatch real SMS payload to webhook/Twilio if configured
    if (settings.emergency_dispatch_webhook) {
      await fetch(settings.emergency_dispatch_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "MISSED_CALL_TEXT_BACK",
          timestamp: new Date().toISOString(),
          to_phone: callbackNumber,
          message: textMessage
        })
      });
    }

    // Record missed call lead in database
    await addDoc(collection(db, "leads"), {
      callback_number: callbackNumber,
      caller_name: callerName || "Missed Caller",
      reason_for_call: "Missed Call - Automated Text Back Sent",
      call_type: "general_office",
      call_status: "new",
      text_back_sent: true,
      text_back_timestamp: serverTimestamp(),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      transcript: [{ role: "system", text: `[AUTOMATED SMS SENT] "${textMessage}" to ${callbackNumber}` }]
    });

    return true;
  } catch (err) {
    console.error("Error triggering missed call text back:", err);
    return false;
  }
}

export async function dispatchEmergencyAlert(leadData: Partial<Lead>, webhookUrl?: string) {
  if (!webhookUrl) return;
  try {
    const payload = {
      event: "EMERGENCY_HVAC_DISPATCH",
      timestamp: new Date().toISOString(),
      lead: {
        caller_name: leadData.caller_name || "Unknown",
        callback_number: leadData.callback_number,
        property_address: leadData.property_address || "Not specified",
        emergency_type: leadData.emergency_type || leadData.reason_for_call || "HVAC Emergency",
        equipment_type: leadData.equipment_type || "Unknown",
        issue_description: leadData.issue_description || leadData.ai_summary || "Emergency assistance requested"
      }
    };
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("Emergency dispatch webhook triggered successfully.");
  } catch (err) {
    console.error("Failed to send emergency dispatch webhook:", err);
  }
}

export async function processLead(leadData: Partial<Lead>) {
  try {
    // Clean undefined values to avoid Firestore errors
    const cleanedData = Object.fromEntries(
      Object.entries(leadData).filter(([_, v]) => v !== undefined)
    );

    const docRef = await addDoc(collection(db, "leads"), {
      ...cleanedData,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      call_status: leadData.call_status || (leadData.emergency_flag ? "emergency_follow_up" : "new")
    });

    // If emergency, trigger dispatch webhook if configured in settings
    if (leadData.emergency_flag) {
      getSettings().then(settings => {
        if (settings.emergency_dispatch_webhook) {
          dispatchEmergencyAlert(leadData, settings.emergency_dispatch_webhook);
        }
      });
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "leads");
  }
}
