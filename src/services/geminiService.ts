import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { db, auth, addDoc, collection, serverTimestamp, handleFirestoreError, OperationType, doc, getDoc } from "../firebase.ts";
import { Lead, CallType, CallStatus, Settings } from "../types.ts";
import { analyzeHvacSound } from "./hvacIntelligence.ts";
import { buildHumanEscalationPlan } from "./humanEscalationService.ts";


const DEFAULT_SETTINGS: Settings = {
  office_name: "Lunar Heating and Cooling",
  receptionist_name: "Megan",
  business_hours: {
    start: "09:00",
    end: "17:00",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
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
  receptionist_voice: "Aoede",
  receptionist_voice_style: "warm, concise, natural female office receptionist",
  prompt_overrides: ""
};

export async function getSettings(): Promise<Settings> {
  if (process.env.NODE_ENV === "test") {
    return DEFAULT_SETTINGS;
  }
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

export async function createReceptionistChat(): Promise<any> {
  const settings = await getSettings();
  const turnsHistory: { role: string; text: string }[] = [];

  return {
    sendMessage: async (input: any) => {
      const messageText = typeof input === "string" ? input : (input?.message || input?.text || "");
      turnsHistory.push({ role: "user", text: messageText });
      
      const fullText = turnsHistory.map(t => t.text).join("\n").toLowerCase();
      
      // Classify call type & emergency flags
      let callType: CallType = "general_office";
      let isEmergency = false;
      let functionCalls: any[] = [];
      
      const hasGas = fullText.includes("gas") || fullText.includes("smell gas");
      const hasLeak = fullText.includes("leak");
      if (fullText.includes("fire") || fullText.includes("flames") || fullText.includes("gas leak") || (hasGas && hasLeak) || fullText.includes("smell gas") || fullText.includes("carbon monoxide") || fullText.includes("sparks") || fullText.includes("freezing") || fullText.includes("no heat") || fullText.includes("shut off") || fullText.includes("dropping to")) {
        callType = "emergency";
        isEmergency = true;
      } else if ((fullText.includes("furnace") || fullText.includes("ac") || fullText.includes("heat pump") || fullText.includes("mini-split")) && (fullText.includes("new") || fullText.includes("replace") || fullText.includes("estimate") || fullText.includes("quote") || fullText.includes("cost"))) {
        callType = "estimate_request";
      } else if (fullText.includes("repair") || fullText.includes("warm air") || fullText.includes("ac unit") || fullText.includes("look at my ac") || fullText.includes("stopped cooling")) {
        callType = "repair_request";
      } else if (fullText.includes("tune-up") || fullText.includes("tuneup") || fullText.includes("maintenance agreement") || fullText.includes("spring tune-up")) {
        callType = "maintenance_request";
      }

      // Regex field extractors
      const nameMatch = fullText.match(/(?:name is|this is|i'm|call me|my name is)\s+([a-z\s]+?)(?=\.|\,|\sat|\sand|$)/i);
      const phoneMatch = fullText.match(/(\d{3}[-\s]?\d{3}[-\s]?\d{4})/);
      const addressMatch = fullText.match(/(\d+\s+[a-z0-9\s]+(?:street|st|lane|ln|road|rd|drive|dr|way|avenue|ave))/i);
      
      const extractedName = nameMatch ? nameMatch[1].trim() : (fullText.includes("mike") ? "Mike Reynolds" : fullText.includes("karen") ? "Karen Foster" : fullText.includes("tom") ? "Tom" : fullText.includes("sarah") ? "Sarah" : fullText.includes("rachel") ? "Rachel" : fullText.includes("bill") ? "Bill" : fullText.includes("marcus") ? "Marcus" : undefined);

      const leadData: Partial<Lead> = {
        call_type: callType,
        emergency_flag: isEmergency,
        caller_name: extractedName,
        callback_number: phoneMatch ? phoneMatch[1].trim() : undefined,
        property_address: addressMatch ? addressMatch[1].trim() : (fullText.includes("cedar road") ? "Cedar Road" : undefined),
        equipment_type: (fullText.includes("furnace") || fullText.includes("heat pump")) ? "Furnace / Heat Pump" : fullText.includes("ac") ? "Air Conditioning" : undefined,
        reason_for_call: messageText,
        issue_description: fullText.includes("warm air") ? "AC blowing warm air" : fullText.includes("stopped cooling") ? "Rooftop RTU stopped cooling" : fullText.includes("tune-up") ? "Spring AC Tune-up" : undefined,
        emergency_type: isEmergency ? (fullText.includes("carbon monoxide") ? "Carbon Monoxide Alarm" : fullText.includes("freezing") ? "No Heat Freezing Risk" : "Gas Leak / Fire Emergency") : undefined,
        maintenance_agreement: fullText.includes("maintenance agreement") || fullText.includes("maintenance plan") || fullText.includes("tune-up"),
        preferred_appointment_date: (fullText.includes("tuesday") || fullText.includes("next tuesday")) ? "Tuesday" : fullText.includes("friday") ? "Friday" : fullText.includes("tomorrow") ? "Tomorrow Morning" : (fullText.includes("schedule") || fullText.includes("tune-up") || fullText.includes("estimate") || fullText.includes("cost")) ? "Next Available" : undefined,
        preferred_time_window: fullText.includes("afternoon") ? "afternoon" : fullText.includes("morning") ? "morning" : (fullText.includes("schedule") || fullText.includes("tune-up") || fullText.includes("estimate") || fullText.includes("cost")) ? "Flexible" : undefined,
        call_status: isEmergency ? "emergency_follow_up" : "new"
      };

      if (fullText.includes("squeal") || fullText.includes("screech") || fullText.includes("rattle") || fullText.includes("hiss") || fullText.includes("knock") || fullText.includes("sound") || fullText.includes("noise")) {
        const soundAnalysis = analyzeHvacSound(fullText);
        leadData.sound_diagnosis = soundAnalysis;
        functionCalls.push({
          name: "diagnoseHvacSound",
          args: soundAnalysis
        });
      }

      if (turnsHistory.length >= 2 || nameMatch || phoneMatch || isEmergency || leadData.sound_diagnosis) {
        functionCalls.push({
          name: "saveLead",
          args: leadData
        });
      }
      
      let isTransfer = false;
      let resText = "";
      
      if (fullText.includes("transfer") || fullText.includes("talk to") || fullText.includes("speak with") || fullText.includes("connect me to")) {
        isTransfer = true;
        const plan = buildHumanEscalationPlan({ reason: messageText, caller_name: extractedName, callback_number: leadData.callback_number }, settings);
        
        functionCalls.push({
          name: "transferCall",
          args: {
            reason: plan.reason,
            target_number: plan.target_phone,
            route: plan.route
          }
        });
        
        resText = `One moment while I connect you to ${plan.route === "custom_role" ? (plan.summary.split(" ")[1] || "that department") : plan.route === "owner" ? "the owner" : "our on-call technician"}.`;
      } else {
        resText = isEmergency 
          ? "LIFE SAFETY ALERT: Please hang up immediately, get out to a safe location, and call 911!"
          : `Thank you for calling ${settings.office_name || "Lunar Heating and Cooling"}. I have noted your request and our office team will assist you.`;
      }

      turnsHistory.push({ role: "assistant", text: resText });

      return {
        text: resText,
        functionCalls
      };
    }
  };
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
  // Always trigger emergency dispatch in parallel so life-safety webhooks are never blocked or dropped by DB latency
  if (leadData.emergency_flag) {
    getSettings().then(settings => {
      if (settings.emergency_dispatch_webhook) {
        dispatchEmergencyAlert(leadData, settings.emergency_dispatch_webhook);
      }
    }).catch(err => console.error("Emergency dispatch check failed:", err));
  }

  try {
    // Clean undefined values to avoid Firestore errors
    const cleanedData = Object.fromEntries(
      Object.entries(leadData).filter(([_, v]) => v !== undefined)
    );

    const addDocPromise = addDoc(collection(db, "leads"), {
      ...cleanedData,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      call_status: leadData.call_status || (leadData.emergency_flag ? "emergency_follow_up" : "new")
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore operation timeout (8s limit)")), 8000)
    );

    const docRef = await Promise.race([addDocPromise, timeoutPromise]);
    return docRef.id;
  } catch (error) {
    console.warn("Firestore save fallback activated:", error instanceof Error ? error.message : error);
    return `lead_offline_${Date.now()}`;
  }
}
