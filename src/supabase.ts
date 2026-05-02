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

  // ─── Active Timers (Bathroom / Eating / Prayer) ──────────────────────
  async startTimer(chatId: number, timerType: string) {
    // Upsert: one active timer per user at a time (replaces any existing one)
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
    const durationHours = Math.round((durationMs / 3600000) * 100) / 100; // round to 2 decimals
    // Delete the timer
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

  // ─── Helpers ─────────────────────────────────────────────────────────
  private _utcStartOfLocalDay(): string {
    const now = new Date();
    const localTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    localTime.setUTCHours(0, 0, 0, 0);
    return new Date(localTime.getTime() - 3 * 60 * 60 * 1000).toISOString();
  }
}
