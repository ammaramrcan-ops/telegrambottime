export type Bindings = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  AI_API_KEY: string;
  TELEGRAM_CHAT_ID: string;
};

export interface TimeLog {
  id?: number;
  activity: string;
  duration_hours: number;
  created_at?: string;
}

// ─── أنماط جداول Supabase ─────────────────────────────────────────────
export interface Idea {
  id?: number;
  chat_id?: number;
  content: string;
  category: 'مفيدة' | 'مضيعة للوقت';
  created_at?: string;
}

export interface ActiveTimer {
  chat_id: number;
  timer_type: string; // "حمام" | "أكل" | "صلاة"
  started_at: string;
}

export interface DayTask {
  id?: number;
  title: string;
  period: 'fajr_dhuhr' | 'dhuhr_asr' | 'asr_maghrib' | 'maghrib_isha' | 'isha_fajr';
  estimated_hours?: number;
  is_done?: boolean;
  created_at?: string;
  target_date?: string; // YYYY-MM-DD في الوقت المحلي (UTC+3)
  reminder_sent?: boolean;
}

export interface PrayerStateRow {
  prayer_key: string;
  notified_15: boolean;
  notified_5: boolean;
  notified_time: boolean;
  confirmed: boolean;
  prayer_time?: string;
  last_reminder?: string;
}
