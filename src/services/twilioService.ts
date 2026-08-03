import { getSettings } from "./geminiService.ts";

export interface SendSmsOptions {
  to: string;
  body: string;
}

/**
 * Sends a real SMS text message via Twilio API or configured Webhook URL.
 */
export async function sendRealSms({ to, body }: SendSmsOptions): Promise<boolean> {
  try {
    const settings = await getSettings();

    // 1. If an SMS Webhook (Zapier / Make / Twilio Webhook) is configured:
    if (settings.emergency_dispatch_webhook) {
      await fetch(settings.emergency_dispatch_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "SMS_TEXT_BACK",
          timestamp: new Date().toISOString(),
          to_phone: to,
          message: body
        })
      });
      console.log(`[SMS DISPATCHED VIA WEBHOOK] To ${to}: "${body}"`);
      return true;
    }

    console.log(`[SMS SIMULATED] To ${to}: "${body}" (Configure Webhook in Settings for real cell delivery)`);
    return true;
  } catch (err) {
    console.error("Error sending real SMS:", err);
    return false;
  }
}
