export type Bindings = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  AI_API_KEY: string;
};

export interface TimeLog {
  id?: number;
  activity: string;
  duration_hours: number;
  created_at?: string;
}
