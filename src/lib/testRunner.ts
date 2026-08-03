import { createReceptionistChat } from "../services/geminiService.ts";
import { TestScenario } from "./testScenarios.ts";
import { Lead, TranscriptEntry } from "../types.ts";

export type TestErrorType = "CLASSIFICATION" | "EMERGENCY" | "STATUS" | "REQUIRED_FIELD" | "APPOINTMENT" | "FORBIDDEN_FIELD" | "FORBIDDEN_KEYWORD" | "RUNTIME";

export interface TestError {
  type: TestErrorType;
  message: string;
  expected?: string;
  actual?: string;
  snippet?: string;
}

export interface TestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  capturedData: Partial<Lead> | null;
  transcript: TranscriptEntry[];
  errors: string[]; // Simple messages for logs
  detailedErrors: TestError[];
  aiResponse: string;
}

export async function runScenario(scenario: TestScenario): Promise<TestResult> {
  const errors: string[] = [];
  const detailedErrors: TestError[] = [];
  let capturedData: Partial<Lead> | null = null;
  const transcript: TranscriptEntry[] = [];
  let aiResponse = "";

  try {
    const chat = await createReceptionistChat();
    
    // Initial greeting
    const greeting = await chat.sendMessage({ message: "Hello, I'm calling Lunar Heating and Cooling." });
    transcript.push({ role: "assistant", text: greeting.text });
    
    // Send scenario turns
    for (const turn of scenario.turns) {
      transcript.push({ role: "user", text: turn });
      const response = await chat.sendMessage({ message: turn });
      aiResponse = response.text;
      transcript.push({ role: "assistant", text: response.text });

      // Check for tool calls in each turn
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === "saveLead") {
            capturedData = call.args as Partial<Lead>;
          }
        }
      }
    }

    // Validation
    if (!capturedData) {
      const msg = "No lead data was captured (saveLead tool not called).";
      errors.push(msg);
      detailedErrors.push({ type: "RUNTIME", message: msg });
    } else {
      // Correct call classification
      if (capturedData.call_type !== scenario.expected.call_type) {
        const msg = `Incorrect call_type: expected ${scenario.expected.call_type}, got ${capturedData.call_type}`;
        errors.push(msg);
        
        // Find the turn that most likely defined the call type
        const typeKeywords: Record<string, string[]> = {
          "estimate_request": ["estimate", "quote", "new furnace", "ac replacement", "heat pump", "replacement"],
          "emergency": ["leak", "emergency", "gas", "no heat", "sparks", "fire", "carbon monoxide", "urgent"],
          "repair_request": ["repair", "fix", "ac", "furnace", "blowing warm", "blowing cold", "not working"],
          "maintenance_request": ["tune-up", "tuneup", "maintenance", "service plan", "spring"],
          "general_office": ["question", "info", "hours", "harrisburg", "estimates", "cover"]
        };
        const keywords = typeKeywords[scenario.expected.call_type] || [];
        const relevantTurn = transcript.find(t => 
          t.role === "user" && keywords.some(k => t.text.toLowerCase().includes(k))
        ) || transcript.find(t => t.role === "user");

        detailedErrors.push({
          type: "CLASSIFICATION",
          message: "Incorrect call classification",
          expected: scenario.expected.call_type,
          actual: capturedData.call_type,
          snippet: relevantTurn?.text
        });
      }

      // Correct emergency handling
      if (scenario.expected.emergency_flag !== undefined) {
        if (capturedData.emergency_flag !== scenario.expected.emergency_flag) {
          const msg = `Incorrect emergency_flag: expected ${scenario.expected.emergency_flag}, got ${capturedData.emergency_flag}`;
          errors.push(msg);
          
          const emergencyTurn = transcript.find(t => 
            t.role === "user" && (t.text.toLowerCase().includes("leak") || t.text.toLowerCase().includes("storm") || t.text.toLowerCase().includes("urgent"))
          ) || transcript.find(t => t.role === "user");

          detailedErrors.push({
            type: "EMERGENCY",
            message: "Incorrect emergency flag",
            expected: String(scenario.expected.emergency_flag),
            actual: String(capturedData.emergency_flag),
            snippet: emergencyTurn?.text
          });
        }
      }

      // Correct status
      if (scenario.expected.status && capturedData.call_status !== scenario.expected.status) {
        const msg = `Incorrect call_status: expected ${scenario.expected.status}, got ${capturedData.call_status}`;
        errors.push(msg);
        detailedErrors.push({
          type: "STATUS",
          message: "Incorrect call status",
          expected: scenario.expected.status,
          actual: capturedData.call_status
        });
      }

      // Correct required field capture
      for (const field of scenario.expected.requiredFields) {
        const value = capturedData[field];
        if (value === undefined || value === null || value === "") {
          const msg = `Missing required field: ${String(field)}`;
          errors.push(msg);
          
          // Try to find where the user mentioned something related to this field
          const fieldKeywords: Record<string, string[]> = {
            "caller_name": ["name", "is", "called"],
            "callback_number": ["number", "phone", "call me"],
            "property_address": ["address", "street", "live at", "location"],
            "emergency_type": ["leak", "storm", "damage"],
            "preferred_appointment_date": ["date", "day", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "tomorrow", "next week"],
            "preferred_time_window": ["morning", "afternoon", "evening", "time", "clock"]
          };
          const keywords = fieldKeywords[String(field)] || [String(field).split('_')[0]];
          const relevantTurn = transcript.find(t => 
            t.role === "user" && keywords.some(k => t.text.toLowerCase().includes(k))
          );

          detailedErrors.push({
            type: "REQUIRED_FIELD",
            message: `Missing required field: ${String(field)}`,
            expected: "Present",
            actual: "Missing",
            snippet: relevantTurn?.text
          });
        }
      }

      // Appointment request validation
      if (scenario.expected.appointmentRequestSaved === true) {
        if (!capturedData.preferred_appointment_date && !capturedData.preferred_time_window) {
          const msg = "Expected an appointment request to be saved, but no appointment details were captured.";
          errors.push(msg);
          
          const apptTurn = transcript.find(t => 
            t.role === "user" && (t.text.toLowerCase().includes("next") || t.text.toLowerCase().includes("day") || t.text.toLowerCase().includes("time") || t.text.toLowerCase().includes("schedule"))
          );

          detailedErrors.push({
            type: "APPOINTMENT",
            message: "Missing appointment details",
            expected: "Appointment Saved",
            actual: "No Appointment",
            snippet: apptTurn?.text
          });
        }
      } else if (scenario.expected.appointmentRequestSaved === false) {
        if (capturedData.preferred_appointment_date || capturedData.preferred_time_window) {
          const msg = "An appointment request was saved incorrectly for this scenario.";
          errors.push(msg);
          detailedErrors.push({
            type: "APPOINTMENT",
            message: "Incorrect appointment booking",
            expected: "No Appointment",
            actual: "Appointment Saved",
            snippet: transcript.find(t => t.role === "assistant" && (t.text.toLowerCase().includes("schedule") || t.text.toLowerCase().includes("appointment")))?.text
          });
        }
      }

      // Forbidden fields
      if (scenario.expected.forbiddenFields) {
        for (const field of scenario.expected.forbiddenFields) {
          const value = capturedData[field];
          if (value !== undefined && value !== null && value !== "") {
            const msg = `Unnecessary field captured: ${String(field)}`;
            errors.push(msg);
            detailedErrors.push({
              type: "FORBIDDEN_FIELD",
              message: "Forbidden field captured",
              expected: "Empty",
              actual: "Value Present"
            });
          }
        }
      }
    }

    // Forbidden keywords in AI responses
    if (scenario.expected.forbiddenKeywords) {
      for (const keyword of scenario.expected.forbiddenKeywords) {
        const offendingTurn = transcript.find(t => t.role === "assistant" && t.text.toLowerCase().includes(keyword.toLowerCase()));
        if (offendingTurn) {
          const msg = `AI used forbidden keyword: "${keyword}"`;
          errors.push(msg);
          detailedErrors.push({
            type: "FORBIDDEN_KEYWORD",
            message: `Forbidden keyword used: "${keyword}"`,
            expected: "Keyword absent",
            actual: `Found "${keyword}"`,
            snippet: offendingTurn.text
          });
        }
      }
    }

  } catch (error) {
    const msg = `Runtime error: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(msg);
    detailedErrors.push({ type: "RUNTIME", message: msg });
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed: errors.length === 0,
    capturedData,
    transcript,
    errors,
    detailedErrors,
    aiResponse
  };
}
