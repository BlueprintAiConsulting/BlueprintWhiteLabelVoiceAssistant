# Blueprint HVAC AI Voice Assistant

An internal MVP for Blueprint AI. This HVAC-company AI receptionist handles inbound calls, captures leads, flags emergencies, collects appointment requests, and displays everything in a simple admin dashboard.

## Features

- **Call Simulator**: Test the AI receptionist with various scenarios (Estimate, Emergency, Repair, etc.).
- **AI Receptionist**: Powered by Gemini, it identifies call intent, collects necessary details, and flags emergencies.
- **Admin Dashboard**: View and manage all calls, filter by type/status, and view detailed lead information.
- **Settings**: Configure office name, business hours, timezone, and AI behavior.
- **Emergency Prioritization**: High-priority calls are visually highlighted and flagged for immediate follow-up.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend**: Node.js (Express) serving the Vite app.
- **Database**: Firebase Firestore for persistent storage.
- **AI**: Google Gemini API (@google/genai).

## Setup

1. **Environment Variables**:
   - `GEMINI_API_KEY`: Required for AI functionality.
   - `APP_URL`: Automatically injected in AI Studio.

2. **Firebase Configuration**:
   - Ensure `firebase-applet-config.json` is present in the root directory.
   - Deploy security rules using `deploy_firebase` tool.

3. **Development**:
   - Run `npm run dev` to start the Express server with Vite middleware.

## Data Model (Firestore)

### Leads (`/leads`)
- `caller_name`: string
- `callback_number`: string (Required)
- `call_type`: enum (estimate_request, emergency, repair_request, existing_customer, general_office, spam)
- `emergency_flag`: boolean
- `property_address`: string
- `ai_summary`: string
- `transcript`: array of {role, text}
- `call_status`: enum (new, contacted, booked, closed, spam, emergency_follow_up, after_hours_follow_up)
- `created_at`: timestamp

### Settings (`/settings/config`)
- `office_name`: string
- `business_hours`: {start, end, days[]}
- `timezone`: string
- `transfer_enabled`: boolean
- `transfer_phone_number`: string

## Business Rules

- **Business Hours**: Default Mon-Fri, 9:00 AM - 5:00 PM (America/New_York).
- **Emergency Keywords**: leak, storm, tree, tarp, water intrusion, unsafe.
- **Receptionist Style**: Professional office staff, warm, brief, and efficient.
