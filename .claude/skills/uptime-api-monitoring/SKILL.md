---
name: uptime-api-monitoring
description: Best practices for implementing API status monitors, latency logging, scheduled cron jobs, and Slack/Discord/Twilio alerting webhooks.
version: 1.0.0
user-invocable: true
allowed-tools:
  - Bash(*)
---
# Uptime & API Service Monitoring Guide

This skill provides code patterns, schemas, and notification workflows for building uptime monitors, calculating API performance metrics, and sending automated alerts on service outages.

---

## 1. Latency & Status Ping Implementation

An uptime monitor must accurately verify if an endpoint is functional and measure its response latency. Avoid simple network fetches without timeouts; a hanging API can block your monitoring thread.

### 1.1 Robust Ping Function with Timeout (Javascript)
```javascript
const axios = require('axios');

async function pingEndpoint(url, timeoutMs = 5000) {
  const startTime = process.hrtime();
  
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      timeout: timeoutMs,
      headers: { 'User-Agent': 'UptimeMonitor/1.0' },
      validateStatus: () => true // Resolve promise for all status codes
    });

    const diff = process.hrtime(startTime);
    const latencyMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6); // Convert nanoseconds to milliseconds

    return {
      success: response.status >= 200 && response.status < 400,
      statusCode: response.status,
      latencyMs: latencyMs,
      error: null
    };
  } catch (err) {
    const diff = process.hrtime(startTime);
    const latencyMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);

    return {
      success: false,
      statusCode: err.response ? err.response.status : 0,
      latencyMs: latencyMs,
      error: err.code || err.message
    };
  }
}
```

---

## 2. Serverless Cron & Scheduled Monitoring

Monitors must run on a consistent schedule. In a serverless stack like Firebase, use Firebase Cloud Functions v2 Scheduler.

### 2.1 Scheduled Function (Firebase Functions v2)
This function runs every 5 minutes to trigger the monitor logic.

```javascript
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");

exports.monitorScheduler = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/New_York",
    retryCount: 1,
    memory: "256MiB"
  },
  async (event) => {
    logger.info("Executing scheduled API checks...");
    
    const targets = [
      { name: "Production Web App", url: "https://yourdomain.com/health" },
      { name: "Database Proxy API", url: "https://api.yourdomain.com/v1/ping" }
    ];

    for (const target of targets) {
      const result = await pingEndpoint(target.url);
      await saveMonitorLog(target.name, result);
      
      if (!result.success) {
        await triggerOutageAlert(target.name, result);
      }
    }
  }
);
```

---

## 3. Database Schema for Uptime Logs (Firestore)

Save logs in a structured timeline format. Storing infinite raw pings will clutter your database; use aggregate models.

### 3.1 Recommended Collection Structure
- **`/monitors/{monitorId}`** (Parent Doc): Stores configuration state (name, URL, check interval, current status).
- **`/monitors/{monitorId}/logs/{logId}`** (Sub-collection): Stores raw check results (timestamp, status, latency). Auto-delete logs older than 7 days using Firestore TTL or a scheduled clean-up job.
- **`/monitors/{monitorId}/history_daily/{dayId}`** (Sub-collection): Stores daily summary aggregates (average latency, overall uptime percentage) to render status pages efficiently.

```json
// Example: /monitors/prod-web/history_daily/2026-06-21
{
  "date": "2026-06-21",
  "averageLatencyMs": 142,
  "totalPings": 288,
  "successfulPings": 287,
  "uptimePercentage": 99.65
}
```

---

## 4. Multi-Channel Alerting Webhooks

When a monitor fails, it must notify the engineering team immediately. Standardize alert payloads for Discord, Slack, and SMS (via Twilio).

### 4.1 Discord/Slack Webhook Integration
```javascript
const axios = require('axios');

async function sendChatWebhook(targetName, result, webhookUrl) {
  const isDiscord = webhookUrl.includes('discord.com');
  
  const payload = isDiscord ? {
    embeds: [{
      title: `🚨 Outage Alert: ${targetName}`,
      description: `Service is down or returning a server error.`,
      color: 15158332, // Red hex color code
      fields: [
        { name: "Status Code", value: `${result.statusCode}`, inline: true },
        { name: "Latency", value: `${result.latencyMs}ms`, inline: true },
        { name: "Error", value: result.error || "None", inline: false }
      ],
      timestamp: new Date().toISOString()
    }]
  } : {
    // Slack Payload Format
    text: `🚨 *Outage Alert: ${targetName}* is down!\n*Status Code:* ${result.statusCode}\n*Latency:* ${result.latencyMs}ms\n*Error:* ${result.error || "None"}`
  };

  await axios.post(webhookUrl, payload);
}
```

### 4.2 Twilio SMS Alerts
For critical infrastructure, send text messages to on-call phone numbers:

```javascript
const twilio = require('twilio');

async function sendSMSAlert(targetName, result, config) {
  const client = twilio(config.accountSid, config.authToken);
  
  const messageBody = `[Uptime Alert] ${targetName} is DOWN! Status: ${result.statusCode}. Error: ${result.error || 'None'}`;

  await client.messages.create({
    body: messageBody,
    from: config.fromPhone,
    to: config.toPhone
  });
}
```

---

## 5. Pre-Delivery Checklist

Before deploying status monitoring services, verify:
- [ ] Pings contain explicit network timeout thresholds (5 seconds maximum).
- [ ] Redirects (HTTP 301/302) are handled correctly (either count as OK or are disabled during checks).
- [ ] Webhook integration tokens/URLs are stored in Secret Manager, not raw code.
- [ ] Database storage cleanup routines (TTL rules) are active to avoid infinite document accumulation.
- [ ] Alert triggers are rate-limited/throttled (e.g. notify once when down, and once when restored, rather than pinging notifications every 5 minutes).
