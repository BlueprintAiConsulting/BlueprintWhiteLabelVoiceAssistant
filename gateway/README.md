# Lunar HVAC phone gateway

This Cloud Run service is the phone-only Gemini Live gateway:

`Twilio Media Streams -> Cloud Run WebSocket -> Gemini Live -> server-side tools`

It accepts Twilio inbound webhooks at `/twilio/inbound`, upgrades media streams at `/twilio/media-stream`, converts G.711 μ-law 8 kHz to Gemini PCM 16 kHz, and converts Gemini PCM 24 kHz audio back to Twilio μ-law 8 kHz. Outbound phone audio is paced into real-time 20 ms frames so fast Gemini chunks do not sound rushed or lose syllables.

## Required runtime configuration

- `GEMINI_API_KEY`: server-side Gemini API key.
- `GATEWAY_SHARED_SECRET`: random secret added to the TwiML stream URL.
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`: Twilio REST credentials.
- `TWILIO_PHONE_NUMBER`: E.164 Twilio voice/SMS sender used for transfers, or
  `TWILIO_MESSAGING_SERVICE_SID` for SMS sender-pool delivery.
- `TWILIO_TRANSFER_NUMBER`: on-call technician destination for warm transfers.
- `TWILIO_OWNER_NUMBER`: optional Josh/owner direct line; falls back to
  `TWILIO_TRANSFER_NUMBER` when omitted.
- `TWILIO_VALIDATE_SIGNATURE=true`: validate `X-Twilio-Signature` on webhooks.
- Cloud Run default service identity with Firestore access.
- A Twilio phone number configured to POST voice calls to `https://<gateway>/twilio/inbound`.

The current Cloud Run URL is:

`https://lunar-hvac-gateway-anpvd2og3a-uc.a.run.app`

Set the Twilio voice webhook to:

`https://lunar-hvac-gateway-anpvd2og3a-uc.a.run.app/twilio/inbound`

Use HTTP `POST` and TwiML as the response type. Test the endpoint with a real
Twilio call only after the number, Gemini key, and shared secret are configured.

For missed-call text-back, configure the Twilio number's status callback as:

`https://lunar-hvac-gateway-anpvd2og3a-uc.a.run.app/twilio/status`

Use HTTP `POST`, enable status events including `no-answer`, `busy`, `failed`,
and `canceled`, and set `TWILIO_VALIDATE_SIGNATURE=true` after adding the Auth
Token to Secret Manager.

Google Calendar intentionally returns a safe “not configured” result until its
account is connected. Twilio transfer and SMS now use the REST API when the
credentials above are present; without them they return safe failures and never
claim that a transfer or text was sent.

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
