export type CallType = 'estimate_request' | 'emergency' | 'repair_request' | 'maintenance_request' | 'existing_customer' | 'general_office' | 'spam';
export type CallStatus = 'new' | 'contacted' | 'booked' | 'closed' | 'spam' | 'emergency_follow_up' | 'after_hours_follow_up';

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface Lead {
  id?: string;
  caller_name?: string;
  callback_number: string;
  reason_for_call?: string;
  call_type: CallType;
  emergency_flag?: boolean;
  emergency_type?: string;
  property_address?: string;
  customer_type?: string;
  equipment_type?: string;
  issue_description?: string;
  preferred_appointment_date?: string;
  preferred_time_window?: string;
  booked_appointment_slot?: string;
  google_event_id?: string;
  idempotency_key?: string;
  booking_status?: 'none' | 'booked' | 'failed_callback_offered';
  sms_sent?: boolean;
  prior_customer_history?: string;
  call_disposition?: 'booked' | 'emergency_escalated' | 'callback_requested' | 'spam' | 'info_provided';
  post_call_summary?: string;
  followup_task_created?: boolean;
  recording_consent_granted?: boolean;
  linked_lead_id?: string;
  maintenance_agreement?: boolean;
  text_back_sent?: boolean;
  text_back_timestamp?: any;
  ai_summary?: string;
  transcript: TranscriptEntry[];
  call_status: CallStatus;
  transfer_attempted?: boolean;
  transfer_result?: string;
  created_at: any; // Firestore Timestamp
  updated_at?: any; // Firestore Timestamp
}

export interface BusinessHours {
  start: string; // HH:mm
  end: string; // HH:mm
  days: string[]; // ['Monday', 'Tuesday', ...]
}

export interface Settings {
  office_name: string;
  /** Human receptionist name used in the opening greeting and live-call identity. */
  receptionist_name?: string;
  owner_name?: string;
  owner_title?: string;
  owner_phone_number?: string;
  business_hours: BusinessHours;
  timezone: string;
  service_areas: string[];
  primary_zip_code?: string;
  service_radius_miles?: number;
  service_zip_codes?: string[];
  transfer_enabled: boolean;
  transfer_phone_number: string;
  on_call_technician_phone?: string;
  auto_transfer_emergencies?: boolean;
  emergency_dispatch_webhook?: string;
  sms_alerts_enabled?: boolean;
  missed_call_text_back_enabled?: boolean;
  missed_call_template?: string;
  auto_booking_enabled?: boolean;
  calendar_id?: string;
  appointment_duration_minutes?: number;
  appointment_buffer_minutes?: number;
  sms_booking_confirmation_enabled?: boolean;
  twilio_enabled?: boolean;
  twilio_phone_number?: string;
  twilio_transfer_number?: string;
  recording_consent_required?: boolean;
  recording_retention_days?: number;
  review_request_enabled?: boolean;
  google_review_link?: string;
  review_delay_hours?: number;
  appointment_reminder_enabled?: boolean;
  review_sms_template?: string;
  available_slot_windows?: string[];
  escalation_timeout_minutes?: number;
  after_hours_message: string;
  emergency_keywords: string[];
  receptionist_voice?: string;
  receptionist_voice_style: string;
  prompt_overrides: string;
}
