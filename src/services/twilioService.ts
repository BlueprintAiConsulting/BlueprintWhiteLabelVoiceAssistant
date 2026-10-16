import { getSettings } from "./geminiService.ts";
import { Settings } from "../types.ts";

export interface SendSmsOptions {
  to: string;
  body: string;
  settingsOverride?: Partial<Settings>;
  requireLiveTwilio?: boolean;
}

/**
 * Sends a real SMS text message via Twilio Cloud Function proxy, direct Twilio API, or configured Webhook URL.
 */
export async function sendRealSms({ to, body, settingsOverride, requireLiveTwilio }: SendSmsOptions): Promise<boolean> {
  try {
    const savedSettings = await getSettings();
    const settings: Settings = { ...savedSettings, ...(settingsOverride || {}) };

    const sid = (process.env.TWILIO_ACCOUNT_SID || settings.twilio_account_sid || "").trim();
    const token = (process.env.TWILIO_AUTH_TOKEN || settings.twilio_auth_token || "").trim();
    const fromPhone = (process.env.TWILIO_PHONE_NUMBER || settings.twilio_phone_number || "").trim();

    if (settings.twilio_enabled && sid && token && fromPhone) {
      // 1a. Try server-side Cloud Function proxy first (avoids browser CORS issues)
      try {
        const proxyRes = await fetch("https://us-central1-blueprint-operations.cloudfunctions.net/twilioSendSms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            body,
            accountSid: sid,
            authToken: token,
            fromPhone
          })
        });
        if (proxyRes.ok) {
          console.log(`[SMS DISPATCHED VIA CLOUD FUNCTION] To ${to}: "${body}"`);
          return true;
        }
      } catch (proxyErr) {
        console.warn("Cloud Function SMS proxy unreachable, trying direct Twilio API:", proxyErr);
      }

      // 1b. Direct Twilio REST API fallback
      const auth = btoa(`${sid}:${token}`);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
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

    if (requireLiveTwilio) {
      return false;
    }

    // 2. Fallback: If an SMS Webhook (Zapier / Make / generic webhook) is configured:
    if (settings.emergency_dispatch_webhook && !settings.emergency_dispatch_webhook.includes("api.blueprint.ai")) {
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
