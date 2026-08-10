import { CallOutcome, evaluateQAFlags, extractObjectionThemes } from "./qaService.ts";
import { auth, db, addDoc, collection, doc, serverTimestamp, updateDoc } from "../firebase.ts";

export type LearningProposalStatus = "pending_review" | "approved" | "rejected";

export interface LearningSignal {
  key: string;
  occurrences: number;
  evidence: string;
  proposed_rule: string;
}

export interface LearningProposal {
  version: number;
  status: LearningProposalStatus;
  generated_at: string;
  source_call_ids: string[];
  signals: LearningSignal[];
  proposed_rules: string[];
}

export const DISALLOWED_RULE_LANGUAGE = /ignore\s+(all\s+)?previous|disable\s+safety|skip\s+confirmation|reveal\s+(the\s+)?prompt|bypass\s+(security|consent)|forget\s+(all\s+)?(previous|prior|above)|you\s+are\s+now|act\s+as|pretend\s+to\s+be|system\s+prompt|instructions\s+above/i;

/** Sanitizes custom prompt overrides to prevent prompt injection and bound length. */
export function sanitizePromptOverride(override: unknown): string {
  if (typeof override !== "string") return "";
  const cleaned = override.trim().replace(/\s+/g, " ");
  if (cleaned.length < 5 || cleaned.length > 300) return "";
  if (DISALLOWED_RULE_LANGUAGE.test(cleaned)) return "";
  return cleaned;
}

/** Keeps approved rules short, safe, and free of prompt-injection language. */
export function sanitizeLearningRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule): rule is string => typeof rule === "string")
    .map(rule => rule.trim().replace(/\s+/g, " "))
    .filter(rule => rule.length >= 8 && rule.length <= 240 && !DISALLOWED_RULE_LANGUAGE.test(rule))
    .slice(0, 20);
}

function flaggedCount(calls: CallOutcome[], matcher: RegExp): number {
  return calls.reduce((count, call) => count + (evaluateQAFlags(call).some(flag => matcher.test(flag)) ? 1 : 0), 0);
}

/**
 * Turns QA evidence into a reviewable proposal. This function never changes
 * Settings or the live prompt; an admin must approve the returned rules.
 */
export function generateLearningProposal(calls: CallOutcome[], version = 1): LearningProposal {
  const signals: LearningSignal[] = [];
  const sourceCallIds = calls.map(call => call.id);
  const total = calls.length || 1;

  const missingDetails = flaggedCount(calls, /MISSING_REQUIRED_DETAILS/);
  if (missingDetails > 0) {
    signals.push({
      key: "required_detail_confirmation",
      occurrences: missingDetails,
      evidence: `${Math.round((missingDetails / total) * 100)}% of reviewed calls missed at least one required detail.`,
      proposed_rule: "Ask one question at a time and repeat back the caller's phone number and complete service address before saving a service lead."
    });
  }

  const toolFailures = flaggedCount(calls, /TOOL_EXECUTION_FAILURE/);
  if (toolFailures > 0) {
    signals.push({
      key: "tool_failure_fallback",
      occurrences: toolFailures,
      evidence: `${toolFailures} reviewed calls contained a tool failure.`,
      proposed_rule: "If a tool fails, explain that the office will call back and collect the caller's name, callback number, reason, and address when service-related."
    });
  }

  const transferFailures = flaggedCount(calls, /TRANSFER_FAILED/);
  if (transferFailures > 0) {
    signals.push({
      key: "human_handoff_fallback",
      occurrences: transferFailures,
      evidence: `${transferFailures} human handoffs did not complete.`,
      proposed_rule: "Never claim a transfer succeeded unless the provider confirms it; use the callback fallback when a human is unavailable."
    });
  }

  const topObjection = extractObjectionThemes(calls).find(objection => objection.count > 0);
  if (topObjection) {
    signals.push({
      key: "objection_response",
      occurrences: topObjection.count,
      evidence: `${topObjection.count} calls included the objection theme: ${topObjection.theme}.`,
      proposed_rule: `Acknowledge ${topObjection.theme.toLowerCase()} briefly, then ask one useful next question instead of arguing or making a promise.`
    });
  }

  const proposedRules = sanitizeLearningRules(signals.map(signal => signal.proposed_rule));
  return {
    version,
    status: "pending_review",
    generated_at: new Date().toISOString(),
    source_call_ids: sourceCallIds,
    signals,
    proposed_rules: proposedRules
  };
}

export function approveLearningProposal(proposal: LearningProposal, existingRules: unknown = []): string[] {
  if (proposal.status !== "approved") return sanitizeLearningRules(existingRules);
  return sanitizeLearningRules([...sanitizeLearningRules(existingRules), ...proposal.proposed_rules]);
}

/** Stores a proposal for admin review; it does not affect live calls. */
export async function persistLearningProposal(proposal: LearningProposal): Promise<string> {
  if (!auth.currentUser) throw new Error("UNAUTHORIZED: Sign in before saving a learning proposal.");
  const proposalRef = await addDoc(collection(db, "learning_proposals"), {
    ...proposal,
    created_by: auth.currentUser.uid,
    created_at: serverTimestamp()
  });
  return proposalRef.id;
}

/** Applies only an explicitly approved proposal to the settings profile. */
export async function applyApprovedLearningProposal(
  proposalId: string,
  proposal: LearningProposal,
  existingRules: unknown = []
): Promise<string[]> {
  if (!auth.currentUser) throw new Error("UNAUTHORIZED: Sign in before approving a learning proposal.");
  const approvedRules = approveLearningProposal({ ...proposal, status: "approved" }, existingRules);
  await updateDoc(doc(db, "learning_proposals", proposalId), {
    status: "approved",
    approved_by: auth.currentUser.uid,
    approved_at: serverTimestamp(),
    approved_rules: approvedRules
  });
  await updateDoc(doc(db, "settings", "config"), {
    approved_learning_rules: approvedRules,
    learning_rules_updated_at: serverTimestamp()
  });
  return approvedRules;
}
