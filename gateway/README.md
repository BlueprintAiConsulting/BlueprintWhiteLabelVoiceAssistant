# Lunar HVAC phone gateway

This Cloud Run service is the phone-only Gemini Live gateway:

`Twilio Media Streams -> Cloud Run WebSocket -> Gemini Live -> server-side tools`

It accepts Twilio inbound webhooks at `/twilio/inbound`, upgrades media streams at `/twilio/media-stream`, converts G.711 μ-law 8 kHz to Gemini PCM 16 kHz, and converts Gemini PCM 24 kHz audio back to Twilio μ-law 8 kHz.

## Required runtime configuration

- `GEMINI_API_KEY`: server-side Gemini API key.
- `GATEWAY_SHARED_SECRET`: random secret added to the TwiML stream URL.
- Cloud Run default service identity with Firestore access.
- A Twilio phone number configured to POST voice calls to `https://<gateway>/twilio/inbound`.

The current Cloud Run URL is:

`https://lunar-hvac-gateway-anpvd2og3a-uc.a.run.app`

Set the Twilio voice webhook to:

`https://lunar-hvac-gateway-anpvd2og3a-uc.a.run.app/twilio/inbound`

Use HTTP `POST` and TwiML as the response type. Test the endpoint with a real
Twilio call only after the number, Gemini key, and shared secret are configured.

Google Calendar, Twilio transfer, and SMS intentionally return safe “not configured” results until their provider credentials and real adapters are added. The gateway never fabricates an appointment or transfer.

The browser simulator remains on the existing direct Gemini Live path. Phone
calls use this server-side bridge so Gemini credentials and tool execution never
run in the browser.

## Local checks

```sh
npm install
npm run check
npm start
```

## Cloud Run deployment shape

Build and deploy this directory as a Cloud Run service with a long WebSocket timeout, bounded max instances, and reconnect/session-resume handling. Store secrets in Secret Manager; do not put them in the browser bundle.
