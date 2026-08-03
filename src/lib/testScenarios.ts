import { Lead, CallType } from "../types.ts";

export interface TestScenario {
  id: string;
  name: string;
  turns: string[];
  expected: {
    call_type: CallType;
    emergency_flag?: boolean;
    requiredFields: (keyof Lead)[];
    forbiddenFields?: (keyof Lead)[];
    status?: string;
    appointmentRequestSaved?: boolean;
    forbiddenKeywords?: string[];
  };
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: "estimate_request_conversational",
    name: "Scenario 1: Estimate Request (Conversational)",
    turns: [
      "Hey, I wanted to talk to somebody about getting a new furnace.",
      "It’s for my house in York.",
      "The address is 214 Oak Lane.",
      "My name is Mike Reynolds.",
      "You can reach me at 717-555-1010.",
      "Next Tuesday afternoon would probably work best.",
      "The old one is just blowing cold air and it's time to replace it."
    ],
    expected: {
      call_type: "estimate_request",
      emergency_flag: false,
      requiredFields: ["caller_name", "callback_number", "property_address", "equipment_type", "preferred_appointment_date", "preferred_time_window"],
      appointmentRequestSaved: true,
      forbiddenKeywords: ["emergency", "leak", "storm", "maintenance"]
    }
  },
  {
    id: "emergency_leak_conversational",
    name: "Scenario 2: Emergency Gas Leak (Conversational)",
    turns: [
      "Hi, I smell gas near my furnace in the basement.",
      "I think there might be a leak.",
      "I’m in Mechanicsburg.",
      "The address is 88 Pine Street.",
      "Please have someone call me back as soon as possible.",
      "My number is 717-555-2020.",
      "We are opening windows now."
    ],
    expected: {
      call_type: "emergency",
      emergency_flag: true,
      requiredFields: ["callback_number", "property_address", "emergency_type"],
      status: "emergency_follow_up",
      forbiddenKeywords: ["appointment", "calendar", "schedule", "next week", "estimate"]
    }
  },
  {
    id: "repair_request_conversational",
    name: "Scenario 3: Repair Request (Conversational)",
    turns: [
      "I need somebody to look at my AC unit.",
      "It's just blowing warm air.",
      "It’s not an emergency but it's getting hot.",
      "The house is in Camp Hill.",
      "The address is 52 Maple Drive.",
      "Friday morning would be best if someone can come out.",
      "My phone number is 717-555-3030.",
      "My name is Karen Foster."
    ],
    expected: {
      call_type: "repair_request",
      emergency_flag: false,
      requiredFields: ["caller_name", "callback_number", "property_address", "issue_description", "equipment_type", "preferred_appointment_date", "preferred_time_window"],
      appointmentRequestSaved: true,
      forbiddenKeywords: ["emergency", "leak", "maintenance", "status"]
    }
  },
  {
    id: "maintenance_request_conversational",
    name: "Scenario 4: Maintenance Plan Tune-Up (Conversational)",
    turns: [
      "Hi, I’m calling to schedule my spring tune-up.",
      "This is Tom.",
      "It’s the house on Cedar Road.",
      "I have a maintenance agreement with you guys.",
      "You can call me at 717-555-4040.",
      "I just want to get the AC checked before it gets too hot."
    ],
    expected: {
      call_type: "maintenance_request",
      emergency_flag: false,
      requiredFields: ["caller_name", "callback_number", "reason_for_call", "maintenance_agreement"],
      appointmentRequestSaved: true,
      forbiddenKeywords: ["emergency", "leak", "estimate"]
    }
  },
  {
    id: "general_office_question_conversational",
    name: "Scenario 5: General Office Question (Conversational)",
    turns: [
      "Hi, do you guys work in Harrisburg?",
      "And do you do free estimates for mini-splits?",
      "My name is Sarah.",
      "If somebody needs to call me back, my number is 717-555-5050.",
      "I’m just trying to see if you cover my area before I go any further."
    ],
    expected: {
      call_type: "general_office",
      emergency_flag: false,
      requiredFields: ["caller_name", "callback_number", "reason_for_call"],
      appointmentRequestSaved: false,
      forbiddenKeywords: ["emergency", "leak", "appointment", "address"]
    }
  },
  {
    id: "life_safety_fire_emergency",
    name: "Scenario 6: Life-Safety Fire Emergency (911 Protocol)",
    turns: [
      "Help! My house is on fire and active flames are coming from the furnace area!",
      "I'm at 450 Market Street in York.",
      "My phone number is 717-555-9110."
    ],
    expected: {
      call_type: "emergency",
      emergency_flag: true,
      requiredFields: ["callback_number", "property_address", "emergency_type"],
      status: "emergency_follow_up",
      forbiddenKeywords: ["appointment", "calendar", "schedule", "next week", "estimate", "pricing"]
    }
  }
];
