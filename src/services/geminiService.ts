import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { db, auth, addDoc, collection, serverTimestamp, handleFirestoreError, OperationType, doc, getDoc } from "../firebase.ts";
import { Lead, CallType, CallStatus, Settings } from "../types.ts";


const DEFAULT_SETTINGS: Settings = {
  office_name: "Lunar Heating and Cooling",
  business_hours: {
    start: "09:00",
    end: "17:00",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  },
  timezone: "America/New_York",
  service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
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

import { proxyTextCallRequest } from "./ephemeralTokenService.ts";

export async function createReceptionistChat(): Promise<any> {
  const settings = await getSettings();

  return {
    sendMessage: async (messageText: string) => {
      const res = await proxyTextCallRequest(messageText, settings);
      return {
        text: res.text,
        functionCalls: []
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
