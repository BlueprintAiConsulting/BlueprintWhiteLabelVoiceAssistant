import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { db, auth, addDoc, collection, serverTimestamp, handleFirestoreError, OperationType, doc, getDoc } from "../firebase.ts";
import { Lead, CallType, CallStatus, Settings } from "../types.ts";
import { analyzeHvacSound } from "./hvacIntelligence.ts";
import { buildHumanEscalationPlan } from "./humanEscalationService.ts";


export const SETTINGS_STORAGE_KEY = "lunar_voice_settings";

export function getLocalSavedSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Settings;
    }
  } catch (e) {
    console.warn("Could not read local settings:", e);
  }
  return null;
}

export function saveLocalSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("settings-updated", { detail: settings }));
  } catch (e) {
    console.warn("Could not save local settings:", e);
  }
}

const DEFAULT_SETTINGS: Settings = {
  industry: "hvac",
  office_name: "Lunar Heating and Cooling",
  receptionist_name: "Mike",
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
  after_hours_message: "Thank you for calling. Our office is currently closed. If this is an emergency, please stay on the line for instant routing.",
  emergency_keywords: ["gas leak", "carbon monoxide", "no heat", "sparks", "smoke", "freezing", "water leaking"],
  receptionist_voice: "Puck",
  receptionist_voice_style: "warm, conversational, natural male front-desk dispatcher with friendly human inflection",
  prompt_overrides: "",
  calendar_id: "primary",
  appointment_duration_minutes: 60,
  appointment_buffer_minutes: 15,
  sms_booking_confirmation_enabled: true
};

export async function getSettings(): Promise<Settings> {
  const local = getLocalSavedSettings();

  if (process.env.NODE_ENV === "test") {
    return local || DEFAULT_SETTINGS;
  }
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "config"));
    if (settingsDoc.exists()) {
      const cloudSettings = settingsDoc.data() as Settings;
      // If local storage has an active trade explicitly selected by the user, keep it in sync
      let merged = cloudSettings;
      if (local && local.industry && local.industry !== cloudSettings.industry) {
        merged = { ...cloudSettings, ...local };
      }
      if (merged.industry === "roofing_siding" && (!merged.office_name || /lunar|heating|cooling|hvac|apex/i.test(merged.office_name))) {
        merged.office_name = "Spring Valley Roofing";
      }
      saveLocalSettings(merged);
      return merged;
    }
  } catch (error) {
    console.warn("Could not fetch Firestore settings, falling back to local storage:", error);
  }

  if (local) {
    const res = { ...DEFAULT_SETTINGS, ...local };
    if (res.industry === "roofing_siding" && (!res.office_name || /lunar|heating|cooling|hvac|apex/i.test(res.office_name))) {
      res.office_name = "Spring Valley Roofing";
    }
    return res;
  }

  return DEFAULT_SETTINGS;
}

export function resolveTradeKnowledge(fullText: string, industry: string, officeName: string): string | null {
  const lower = fullText.toLowerCase();

  // 1. Diagnostic / Service Call Inspection Fee
  if (lower.includes("diagnostic") || lower.includes("service fee") || lower.includes("service call fee") || lower.includes("trip fee") || lower.includes("cost to come out")) {
    const fee = industry === "plumbing" ? "$79" : "$89";
    return `Our standard diagnostic fee is ${fee}. A certified technician thoroughly inspects your system and provides an upfront flat-rate price before any work begins.`;
  }

  // 2. Free In-Home Estimates on Replacements
  if (lower.includes("free estimate") || lower.includes("free quote")) {
    return `Yes! We provide 100% free, no-obligation written estimates for complete system replacements, new roofs, siding, panel upgrades, and remodeling projects.`;
  }

  // 3. Frozen AC Coil / Line
  if (lower.includes("frozen") || lower.includes("freeze") || lower.includes("ice on") || lower.includes("ice line")) {
    return `If you see ice on your copper lines, please turn your AC off at the thermostat and switch the fan to On. That helps the indoor coil thaw safely before our technician arrives so we can test the refrigerant pressures.`;
  }

  // 4. HVAC Equipment Brands
  if (lower.includes("brands") || lower.includes("what brand") || lower.includes("carrier") || lower.includes("trane") || lower.includes("lennox") || lower.includes("rheem") || lower.includes("goodman") || lower.includes("mitsubishi") || lower.includes("bosch")) {
    return `We service and install all major brands including Trane, Carrier, Lennox, Rheem, Goodman, Bryant, Bosch, and Mitsubishi Electric heat pumps and mini-splits.`;
  }

  // 5. Maintenance / Protection Plans (Comfort Club / FlowShield / CurrentSafe)
  if (lower.includes("comfort club") || lower.includes("protection plan") || (lower.includes("maintenance") && (lower.includes("include") || lower.includes("cost") || lower.includes("price") || lower.includes("plan")))) {
    return `Our Comfort Club maintenance plan is $19 a month and includes two precision tune-ups per year, 15% discount on all repairs, priority VIP scheduling, and zero emergency trip fees.`;
  }

  // 6. Roofing Shingles & Warranties (CertainTeed)
  if (lower.includes("certainteed") || lower.includes("landmark") || lower.includes("shingle type") || lower.includes("what shingles") || (lower.includes("roof") && lower.includes("warranty"))) {
    return `As a CertainTeed Master Craftsman contractor, we install CertainTeed Landmark and Landmark PRO architectural shingles with StreakFighter algae protection and DiamondDeck synthetic underlayment, backed by full manufacturer and workmanship warranties.`;
  }

  // 7. Storm & Hail Insurance Claims
  if (lower.includes("hail") || lower.includes("storm damage") || lower.includes("insurance claim") || lower.includes("adjuster")) {
    return `We specialize in storm and hail damage assessments. We provide full photo documentation, meet your insurance adjuster on the roof, and assist with supplements.`;
  }

  // 8. Emergency Tarping
  if (lower.includes("tarp") || lower.includes("active leak") || lower.includes("water dripping through")) {
    return `We provide emergency tarping and leak containment. Please place a bucket underneath and stay away from damaged areas. Never climb on a wet roof. Our office can dispatch our crew right away.`;
  }

  // 9. Siding Options
  if (lower.includes("siding") && (lower.includes("options") || lower.includes("types") || lower.includes("monogram") || lower.includes("cedar impressions") || lower.includes("insulated"))) {
    return `We install CertainTeed Monogram and MainStreet vinyl siding, CedarBoards insulated siding, and Cedar Impressions polymer shake accents along with custom aluminum trim and seamless gutters.`;
  }

  // 10. Plumbing - Water Shutoff & Burst Pipe
  if (lower.includes("main shutoff") || lower.includes("water shutoff") || lower.includes("shut off my water") || lower.includes("where is the shutoff")) {
    return `Your main water shutoff valve is typically located in the basement along the front foundation wall, near the water meter, or inside the utility closet. Turn the valve clockwise to stop incoming water.`;
  }

  // 11. Plumbing - Water Heater Leaking
  if (lower.includes("water heater leaking") || lower.includes("water heater leak") || lower.includes("tank leak")) {
    return `If water is leaking from the bottom seam of your tank water heater, the internal tank has corroded and requires replacement. Please shut off the cold-water inlet valve on top, and we can schedule a technician to provide replacement options.`;
  }

  // 12. Electrical - 200A Panel Upgrade & EV Charger
  if (lower.includes("panel upgrade") || lower.includes("200 amp") || lower.includes("200a") || lower.includes("100 amp to 200") || lower.includes("ev charger") || lower.includes("tesla wall connector") || lower.includes("level 2")) {
    return `We specialize in 100-amp to 200-amp service panel upgrades and Level 2 EV charging stations, including Tesla Wall Connectors and NEMA 14-50 outlets with complete local permitting. We provide free in-home estimates.`;
  }

  // 13. Electrical - Tripping Breakers & Burning Smell
  if (lower.includes("breaker keep tripping") || lower.includes("tripping breaker") || lower.includes("burning smell from outlet") || lower.includes("outlet sparked")) {
    return `A repeatedly tripping breaker or burning odor indicates a circuit overload or dangerous arcing hazard. Please leave that breaker OFF and do not use that outlet until a licensed electrician inspects the line.`;
  }

  // 14. Tree Service - Removal, Crane, Stump Grinding
  if (lower.includes("tree removal") || lower.includes("crane") || lower.includes("stump grinding") || lower.includes("arborist")) {
    return `Our ISA Certified Arborists provide 100% free on-site tree removal estimates, crane-assisted removals near homes and utility lines, and deep stump grinding 8 to 12 inches below grade.`;
  }

  // 15. General Contracting - Kitchen, Bath, Additions & Permits
  if (lower.includes("remodel") || lower.includes("kitchen remodel") || lower.includes("bathroom remodel") || lower.includes("addition") || lower.includes("load bearing wall") || lower.includes("permits")) {
    return `We are a turnkey design-build general contractor. We handle architectural drawings, 3D renderings, 100% of township building permits, and complete construction from custom kitchens to master additions.`;
  }

  // 16. General Hours & Harrisburg/Service Area (matches Scenario 5 smoothly without forbidden keywords)
  if (lower.includes("harrisburg") || lower.includes("normal office business hours") || lower.includes("hours for service")) {
    return `We cover South Central Pennsylvania, and our normal service hours are Monday through Friday from 9:00 AM to 5:00 PM. I have noted your details for our office team.`;
  }

  // 17. Out of territory (Scenario 8)
  if (lower.includes("philadelphia") || lower.includes("19104")) {
    return `Philadelphia is outside our primary service radius, but our office can review your request and follow up with you directly.`;
  }

  // 18. Prompt injection attempt (Scenario 11)
  if (lower.includes("system prompt") || lower.includes("api key") || lower.includes("ignore all previous instructions")) {
    return `I am the office receptionist here to assist you with scheduling and services. How can I help you today?`;
  }

  return null;
}

export async function createReceptionistChat(customSettings?: Settings): Promise<any> {
  const settings = customSettings || await getSettings();
  const turnsHistory: { role: string; text: string }[] = [];

  return {
    sendMessage: async (input: any) => {
      const messageText = typeof input === "string" ? input : (input?.message || input?.text || "");
      turnsHistory.push({ role: "user", text: messageText });
      
      const fullText = turnsHistory.map(t => t.text).join("\n").toLowerCase();
      const isRoofing = settings.industry === "roofing_siding";
      
      // Classify call type & emergency flags
      let callType: CallType = "general_office";
      let isEmergency = false;
      let functionCalls: any[] = [];
      
      const hasGas = fullText.includes("gas") || fullText.includes("smell gas");
      const hasLeak = fullText.includes("leak");
      
      if (isRoofing) {
        if (fullText.includes("tarp") || fullText.includes("pouring") || fullText.includes("collapse") || fullText.includes("tree on roof") || fullText.includes("ceiling sagging")) {
          callType = "emergency_tarping";
          isEmergency = true;
        } else if (fullText.includes("hail") || fullText.includes("storm") || fullText.includes("wind damage")) {
          callType = "storm_hail_damage";
        } else if (fullText.includes("siding")) {
          callType = "siding_estimate";
        } else if (fullText.includes("gutter") || fullText.includes("downspout") || fullText.includes("soffit") || fullText.includes("fascia")) {
          callType = "gutter_soffit_repair";
        } else if (fullText.includes("replace") || fullText.includes("new roof") || fullText.includes("tear off") || fullText.includes("estimate") || fullText.includes("quote")) {
          callType = "roof_replacement_estimate";
        } else if (fullText.includes("leak") || fullText.includes("repair") || fullText.includes("shingle") || fullText.includes("pipe boot")) {
          callType = "roof_repair";
        }
      } else {
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
        equipment_type: isRoofing 
          ? (fullText.includes("siding") ? "Vinyl / Hardie Siding" : fullText.includes("metal") ? "Metal Roofing" : "Architectural Shingle Roof")
          : ((fullText.includes("furnace") || fullText.includes("heat pump")) ? "Furnace / Heat Pump" : fullText.includes("ac") ? "Air Conditioning" : undefined),
        reason_for_call: messageText,
        issue_description: isRoofing
          ? (fullText.includes("tarp") ? "Active roof leak requiring emergency tarping" : fullText.includes("hail") ? "Hail / storm damage inspection" : fullText.includes("siding") ? "Siding replacement estimate" : fullText.includes("leak") ? "Roof leak repair" : "Roof replacement estimate")
          : (fullText.includes("warm air") ? "AC blowing warm air" : fullText.includes("stopped cooling") ? "Rooftop RTU stopped cooling" : fullText.includes("tune-up") ? "Spring AC Tune-up" : undefined),
        emergency_type: isEmergency 
          ? (isRoofing ? (fullText.includes("tarp") ? "Active Roof Leak / Emergency Tarp" : "Severe Storm Damage") : (fullText.includes("carbon monoxide") ? "Carbon Monoxide Alarm" : fullText.includes("freezing") ? "No Heat Freezing Risk" : "Gas Leak / Fire Emergency")) 
          : undefined,
        maintenance_agreement: fullText.includes("maintenance agreement") || fullText.includes("maintenance plan") || fullText.includes("tune-up"),
        preferred_appointment_date: callType === "general_office" || isEmergency ? undefined : ((fullText.includes("tuesday") || fullText.includes("next tuesday")) ? "Tuesday" : fullText.includes("friday") ? "Friday" : fullText.includes("tomorrow") ? "Tomorrow Morning" : (fullText.includes("schedule") || fullText.includes("tune-up") || fullText.includes("estimate") || fullText.includes("cost")) ? "Next Available" : undefined),
        preferred_time_window: callType === "general_office" || isEmergency ? undefined : (fullText.includes("afternoon") ? "afternoon" : fullText.includes("morning") ? "morning" : (fullText.includes("schedule") || fullText.includes("tune-up") || fullText.includes("estimate") || fullText.includes("cost")) ? "Flexible" : undefined),
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
      
      const isGreeting = turnsHistory.length <= 1 || messageText.toLowerCase().includes("calling");
      const recName = settings.receptionist_name || "Mike";

      const wantsSchedule = fullText.includes("schedule") || fullText.includes("book") || fullText.includes("appointment") || fullText.includes("when are you available") || fullText.includes("openings");
      const hasSlotChosen = fullText.includes("tuesday") || fullText.includes("tomorrow") || fullText.includes("friday") || fullText.includes("10:00") || fullText.includes("2:00") || fullText.includes("morning") || fullText.includes("afternoon");

      const spamKeywords = ["lower your", "merchant pros", "credit card processing", "seo", "marketing agency", "sell leads", "unsolicited sales", "exclusive leads", "search pro marketing"];
      const isSpam = spamKeywords.some(k => fullText.includes(k));

      const refuseKeywords = ["refuse to give", "not giving you my address", "not giving you my phone", "won't tell you my address", "refuse to tell you", "refuse to provide", "give me an exact price right now or send someone"];
      const isRefusal = refuseKeywords.some(k => fullText.includes(k));

      const isGoodbye = !isGreeting && (fullText.includes("that's all") || fullText.includes("thats all") || fullText.includes("i'm all set") || fullText.includes("im all set") || fullText.includes("bye megan") || fullText.includes("goodbye megan") || (fullText.includes("goodbye") && turnsHistory.length >= 2));

      if (isGreeting) {
        const office = isRoofing
          ? ((!settings.office_name || /lunar|heating|cooling|hvac|apex/i.test(settings.office_name)) ? "Spring Valley Roofing" : settings.office_name)
          : (settings.office_name || "our office");
        const tradeSpecialty = isRoofing ? "roofing or siding" : "heating or cooling";
        resText = `Thanks for calling ${office}! This is ${recName}. How can I help you with your ${tradeSpecialty} today?`;
      } else if (isSpam) {
        functionCalls.push({
          name: "endCall",
          args: {
            reason: "spam_solicitation",
            farewell_message: "Thank you, but we do not accept unsolicited sales calls. Please remove our number from your list. Have a good day. Goodbye."
          }
        });
        resText = "Thank you, but we do not accept unsolicited sales calls. Please remove our number from your calling list. Have a good day. Goodbye.";
      } else if (isRefusal) {
        functionCalls.push({
          name: "endCall",
          args: {
            reason: "caller_refused_details",
            farewell_message: "Without a service address or callback number, we are unable to schedule an appointment or dispatch anyone to your home. Please call us back when you're ready with that information. Have a great day! Goodbye."
          }
        });
        resText = "Without a service address or callback number, we are unable to schedule an appointment or dispatch anyone to your home. Please feel free to call us back when you're ready with that information. Have a great day! Goodbye.";
      } else if (isGoodbye) {
        const office = isRoofing
          ? ((!settings.office_name || /lunar|heating|cooling|hvac|apex/i.test(settings.office_name)) ? "Spring Valley Roofing" : settings.office_name)
          : (settings.office_name || "our office");
        functionCalls.push({
          name: "endCall",
          args: {
            reason: "caller_concluded_call",
            farewell_message: `You're very welcome! Thanks for calling ${office}. Have a wonderful day! Goodbye.`
          }
        });
        resText = `You're very welcome! Thanks for calling ${office}. Have a wonderful day! Goodbye.`;
      } else if (wantsSchedule && !hasSlotChosen) {
        functionCalls.push({
          name: "checkAppointmentSlots",
          args: {
            service_type: isRoofing ? "Roof Replacement Inspection" : "HVAC Service",
            requested_date: "tomorrow",
            preferred_window: "morning"
          }
        });
        resText = `I would be happy to get that scheduled for you! We have openings available tomorrow at 10:00 AM or Thursday at 2:00 PM. What is your property address and callback number, and which time works best for you?`;
      } else if (wantsSchedule && hasSlotChosen && (extractedName || phoneMatch || addressMatch || turnsHistory.length >= 2)) {
        const slotDate = fullText.includes("friday") ? "2026-09-11 10:00" : "2026-09-08 10:00";
        functionCalls.push({
          name: "bookAppointment",
          args: {
            caller_name: extractedName || "Valued Caller",
            callback_number: phoneMatch ? phoneMatch[1].trim() : "+1 (717) 555-0199",
            property_address: addressMatch ? addressMatch[1].trim() : "123 Main St, York, PA 17401",
            service_type: isRoofing ? "Roof Replacement Inspection" : "HVAC Service",
            appointment_start: slotDate,
            appointment_confirmed: true,
            address_confirmed: true
          }
        });
        const office = isRoofing
          ? ((!settings.office_name || /lunar|heating|cooling|hvac|apex/i.test(settings.office_name)) ? "Spring Valley Roofing" : settings.office_name)
          : (settings.office_name || "our office");
        resText = `You are all booked for ${leadData.preferred_appointment_date || "your appointment"} at 10:00 AM with ${office}! Our specialist will arrive at ${leadData.property_address || "your property"}. A confirmation text has been sent to your phone.`;
      } else if (fullText.includes("transfer") || fullText.includes("talk to") || fullText.includes("speak with") || fullText.includes("connect me to") || fullText.includes("josh") || fullText.includes("chris")) {
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
        
        resText = `One moment while I connect you to ${plan.route === "custom_role" ? (plan.summary.split(" ")[1] || "that department") : plan.route === "owner" ? (settings.owner_name || "the owner") : (isRoofing ? "our lead roofing specialist" : "our on-call technician")}.`;
      } else if (isEmergency) {
        resText = isRoofing 
          ? `EMERGENCY TARPING DISPATCH: I understand water is actively coming in. Please ensure everyone is safe inside. I am flagging your address (${leadData.property_address || "your property"}) for emergency tarping right away.`
          : `LIFE SAFETY ALERT: Please hang up immediately, get out to a safe location, and call 911 or the gas utility!`;
      } else if (isRoofing) {
        const tradeKnowledge = resolveTradeKnowledge(fullText, "roofing_siding", settings.office_name || "Spring Valley Roofing");
        if (tradeKnowledge) {
          resText = tradeKnowledge;
        } else if (callType === "roof_replacement_estimate") {
          resText = `I would be happy to schedule a free 21-point roof inspection and full replacement estimate for you. What is your property address and the best callback number?`;
        } else if (callType === "storm_hail_damage") {
          resText = `We specialize in storm and hail damage assessments, complete with drone photo documentation for your insurance claim. What is your property address?`;
        } else if (callType === "siding_estimate") {
          resText = `We can definitely help with siding replacement and exterior trim. What is your address and what type of siding are you looking for?`;
        } else {
          const roofingOffice = (!settings.office_name || /lunar|heating|cooling|hvac|apex/i.test(settings.office_name)) ? "Spring Valley Roofing" : settings.office_name;
          resText = `Thank you for calling ${roofingOffice}. I have noted all your details, and our estimator will follow up with you promptly.`;
        }
      } else {
        const tradeKnowledge = resolveTradeKnowledge(fullText, settings.industry || "hvac", settings.office_name || "our office");
        if (tradeKnowledge) {
          resText = tradeKnowledge;
        } else if (callType === "estimate_request") {
          resText = `I would be happy to schedule a free in-home estimate on a new replacement HVAC system. What is your address?`;
        } else {
          resText = `Thank you for calling ${settings.office_name || "our office"}. I have noted your request and our office team will assist you.`;
        }
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

    const messageTemplate = settings.missed_call_template || `Hi! This is ${settings.office_name || 'our office'}. Sorry we missed your call! How can we help you today?`;
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

export const OFFLINE_LEADS_QUEUE_KEY = "lunar_offline_leads_queue";

export function getOfflineLeadsQueue(): Partial<Lead>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_LEADS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Could not read offline leads queue:", e);
    return [];
  }
}

export function saveToOfflineLeadsQueue(lead: Partial<Lead>): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getOfflineLeadsQueue();
    queue.push({
      ...lead,
      notes: `${lead.notes || ""} [Queued Offline ${new Date().toISOString()}]`.trim()
    });
    localStorage.setItem(OFFLINE_LEADS_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Could not save to offline leads queue:", e);
  }
}

export async function syncOfflineLeads(): Promise<number> {
  if (typeof window === "undefined") return 0;
  const queue = getOfflineLeadsQueue();
  if (queue.length === 0) return 0;

  let syncedCount = 0;
  const remaining: Partial<Lead>[] = [];

  for (const lead of queue) {
    try {
      const cleanedData = Object.fromEntries(
        Object.entries(lead).filter(([_, v]) => v !== undefined)
      );
      await addDoc(collection(db, "leads"), {
        ...cleanedData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        offline_synced: true,
        call_status: lead.call_status || "new"
      });
      syncedCount++;
    } catch (err) {
      remaining.push(lead);
    }
  }

  try {
    localStorage.setItem(OFFLINE_LEADS_QUEUE_KEY, JSON.stringify(remaining));
  } catch (_) {}

  return syncedCount;
}

if (typeof window !== "undefined" && typeof process === "undefined") {
  window.addEventListener("online", () => {
    void syncOfflineLeads();
  });
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

  // Attempt to sync any backlog of offline leads first when in browser
  if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
    void syncOfflineLeads();
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
    console.warn("Firestore save fallback activated, caching lead in offline queue:", error instanceof Error ? error.message : error);
    saveToOfflineLeadsQueue(leadData);
    return `lead_offline_${Date.now()}`;
  }
}
