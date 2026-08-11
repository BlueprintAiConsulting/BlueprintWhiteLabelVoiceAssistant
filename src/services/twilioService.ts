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

    // 1. If native Twilio credentials are configured in Settings or Env:
    const sid = process.env.TWILIO_ACCOUNT_SID || settings.twilio_account_sid;
    const token = process.env.TWILIO_AUTH_TOKEN || settings.twilio_auth_token;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER || settings.twilio_phone_number;

    if (settings.twilio_enabled && sid && token && fromPhone) {
      const auth = btoa(`${sid}:${token}`);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${auth}`
        },
        body: new URLSearchParams({
          To: to,
          From: fromPhone,
          Body: body
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Twilio SMS API Error: ${res.status} - ${errorText}`);
        throw new Error(`Twilio API request failed: ${res.statusText}`);
      }
      
      console.log(`[SMS DISPATCHED VIA TWILIO] To ${to}: "${body}"`);
      return true;
    }

    // 2. Fallback: If an SMS Webhook (Zapier / Make / generic webhook) is configured:
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

    console.log(`[SMS SIMULATED] To ${to}: "${body}" (Configure Twilio or Webhook in Settings for real cell delivery)`);
    return true;
  } catch (err) {
    console.error("Error sending real SMS:", err);
    return false;
  }
}
