/// <reference types="@cloudflare/workers-types" />
import { TimeLog } from './types';

export interface Idea {
  id?: number;
  chat_id?: number;
  content: string;
  category: 'مفيدة' | 'مضيعة للوقت';
  created_at?: string;
}

export interface ActiveTimer {
  chat_id: number;
  timer_type: string;
  started_at: string;
}

export interface DayTask {
  id?: number;
  title: string;
  period: 'fajr_dhuhr' | 'dhuhr_asr' | 'asr_maghrib' | 'maghrib_isha' | 'isha_fajr';
  estimated_hours?: number;
  is_done?: boolean;
  created_at?: string;
  target_date?: string; // YYYY-MM-DD in local time
  reminder_sent?: boolean;
}

export class SupabaseClient {
  constructor(private url: string, private key: string) {}

  private get headers() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  /** Returns ISO UTC string for midnight (local) of the current Ismailia day */
  private _utcStartOfLocalDay(): string {
    const now = new Date();
    const localTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    localTime.setUTCHours(0, 0, 0, 0);
    return new Date(localTime.getTime() - 3 * 60 * 60 * 1000).toISOString();
  }

  /** Returns the current local date as YYYY-MM-DD (Ismailia = UTC+3) */
  localDateString(): string {
    const now = new Date();
    const local = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return local.toISOString().slice(0, 10);
  }

  // ─── Time Logs ───────────────────────────────────────────────────────
  async insertLog(log: TimeLog) {
    const res = await fetch(`${this.url}/rest/v1/time_logs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(log)
    });
    if (!res.ok) throw new Error(`Supabase Error: ${await res.text()}`);
    return res.json();
  }

  async getRecentLogs(limit: number = 20): Promise<TimeLog[]> {
    const res = await fetch(`${this.url}/rest/v1/time_logs?select=*&order=created_at.desc&limit=${limit}`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) throw new Error(`Supabase Error: ${await res.text()}`);
    return res.json();
  }

  async getTodayLogs(): Promise<TimeLog[]> {
    const utcStart = this._utcStartOfLocalDay();
    const res = await fetch(`${this.url}/rest/v1/time_logs?created_at=gte.${utcStart}&select=*&order=created_at.asc`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getTodayLogs): ${await res.text()}`); return []; }
    return res.json();
  }

  async deleteLog(logId: number): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/time_logs?id=eq.${logId}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!res.ok) console.error(`Supabase Error (deleteLog): ${await res.text()}`);
  }

  // ─── Daily Archive ───────────────────────────────────────────────────
  /** Archives all today's logs to daily_archive and deletes them from time_logs */
  async archiveAndResetDay(): Promise<number> {
    const todayLogs = await this.getTodayLogs();
    if (todayLogs.length === 0) return 0;

    const localDate = this.localDateString();
    const archivePayload = todayLogs.map(l => ({
      log_date: localDate,
      activity: l.activity,
      duration_hours: l.duration_hours,
      logged_at: l.created_at
    }));

    // Insert into archive
    const archiveRes = await fetch(`${this.url}/rest/v1/daily_archive`, {
      method: 'POST',
      headers: { ...this.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(archivePayload)
    });
    if (!archiveRes.ok) {
      console.error('Archive insert error:', await archiveRes.text());
      return 0;
    }

    // Delete today's logs from the live table
    const utcStart = this._utcStartOfLocalDay();
    const deleteRes = await fetch(`${this.url}/rest/v1/time_logs?created_at=gte.${utcStart}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!deleteRes.ok) {
      console.error('Delete logs error:', await deleteRes.text());
    }

    return todayLogs.length;
  }

  async getRecentArchive(days: number = 7): Promise<any[]> {
    const res = await fetch(`${this.url}/rest/v1/daily_archive?select=*&order=log_date.desc,logged_at.asc&limit=${days * 30}`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getRecentArchive): ${await res.text()}`); return []; }
    return res.json();
  }

  // ─── Active Timers ───────────────────────────────────────────────────
  async startTimer(chatId: number, timerType: string) {
    const headersWithUpsert = { ...this.headers, 'Prefer': 'resolution=merge-duplicates,return=representation' };
    const res = await fetch(`${this.url}/rest/v1/active_timers`, {
      method: 'POST',
      headers: headersWithUpsert,
      body: JSON.stringify({ chat_id: chatId, timer_type: timerType, started_at: new Date().toISOString() })
    });
    if (!res.ok) console.error(`Supabase Error (startTimer): ${await res.text()}`);
  }

  async getActiveTimer(chatId: number): Promise<ActiveTimer | null> {
    const res = await fetch(`${this.url}/rest/v1/active_timers?chat_id=eq.${chatId}&select=*`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getActiveTimer): ${await res.text()}`); return null; }
    const data = await res.json() as ActiveTimer[];
    return data.length > 0 ? data[0] : null;
  }

  async stopTimer(chatId: number): Promise<{ timerType: string; durationHours: number } | null> {
    const timer = await this.getActiveTimer(chatId);
    if (!timer) return null;
    const durationMs = Date.now() - new Date(timer.started_at).getTime();
    const durationHours = Math.round((durationMs / 3600000) * 100) / 100;
    await fetch(`${this.url}/rest/v1/active_timers?chat_id=eq.${chatId}`, {
      method: 'DELETE', headers: this.headers
    });
    return { timerType: timer.timer_type, durationHours };
  }

  // ─── Ideas ───────────────────────────────────────────────────────────
  async saveIdea(idea: Omit<Idea, 'id' | 'created_at'>) {
    const res = await fetch(`${this.url}/rest/v1/ideas`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(idea)
    });
    if (!res.ok) console.error(`Supabase Error (saveIdea): ${await res.text()}`);
  }

  async getTodayIdeas(): Promise<Idea[]> {
    const utcStart = this._utcStartOfLocalDay();
    const res = await fetch(`${this.url}/rest/v1/ideas?created_at=gte.${utcStart}&select=*&order=created_at.desc`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getTodayIdeas): ${await res.text()}`); return []; }
    return res.json();
  }

  async getRecentIdeas(limit: number = 20): Promise<Idea[]> {
    const res = await fetch(`${this.url}/rest/v1/ideas?select=*&order=created_at.desc&limit=${limit}`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getRecentIdeas): ${await res.text()}`); return []; }
    return res.json();
  }

  // ─── Day Tasks ───────────────────────────────────────────────────────
  async createTask(task: Omit<DayTask, 'id' | 'created_at'>): Promise<DayTask> {
    const payload = { ...task, target_date: task.target_date || this.localDateString(), is_done: false, reminder_sent: false };
    const res = await fetch(`${this.url}/rest/v1/day_tasks`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Supabase Error (createTask): ${await res.text()}`);
    const arr = await res.json() as DayTask[];
    return arr[0];
  }

  async getTodayTasks(): Promise<DayTask[]> {
    const today = this.localDateString();
    const res = await fetch(`${this.url}/rest/v1/day_tasks?target_date=eq.${today}&select=*&order=created_at.asc`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getTodayTasks): ${await res.text()}`); return []; }
    return res.json();
  }

  async markTaskDone(taskId: number): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/day_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      headers: { ...this.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_done: true })
    });
    if (!res.ok) console.error(`Supabase Error (markTaskDone): ${await res.text()}`);
  }

  async markTaskReminderSent(taskId: number): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/day_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      headers: { ...this.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ reminder_sent: true })
    });
    if (!res.ok) console.error(`Supabase Error (markTaskReminderSent): ${await res.text()}`);
  }

  async getAllTasksForDashboard(): Promise<DayTask[]> {
    const today = this.localDateString();
    const res = await fetch(`${this.url}/rest/v1/day_tasks?target_date=eq.${today}&select=*&order=created_at.asc`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getAllTasks): ${await res.text()}`); return []; }
    return res.json();
  }

  async deleteTask(taskId: number): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/day_tasks?id=eq.${taskId}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!res.ok) console.error(`Supabase Error (deleteTask): ${await res.text()}`);
  }

  // ─── Chat History ────────────────────────────────────────────────────
  async saveMessage(chatId: number, role: string, content: string) {
    const res = await fetch(`${this.url}/rest/v1/chat_history`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ chat_id: chatId, role, content })
    });
    if (!res.ok) console.error(`Supabase Error (saveMessage): ${await res.text()}`);
  }

  async getHistory(chatId: number, limit: number = 10): Promise<{role: string, content: string}[]> {
    const res = await fetch(`${this.url}/rest/v1/chat_history?chat_id=eq.${chatId}&select=role,content&order=created_at.desc&limit=${limit}`, {
      method: 'GET', headers: this.headers
    });
    if (!res.ok) { console.error(`Supabase Error (getHistory): ${await res.text()}`); return []; }
    const data = await res.json() as {role: string, content: string}[];
    return data.reverse();
  }
}
