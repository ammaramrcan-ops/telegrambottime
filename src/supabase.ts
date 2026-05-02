/// <reference types="@cloudflare/workers-types" />
import { TimeLog } from './types';

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

  async insertLog(log: TimeLog) {
    const res = await fetch(`${this.url}/rest/v1/time_logs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(log)
    });
    if (!res.ok) {
      throw new Error(`Supabase Error: ${await res.text()}`);
    }
    return res.json();
  }

  async getRecentLogs(limit: number = 20): Promise<TimeLog[]> {
    const res = await fetch(`${this.url}/rest/v1/time_logs?select=*&order=created_at.desc&limit=${limit}`, {
      method: 'GET',
      headers: this.headers
    });
    if (!res.ok) {
      throw new Error(`Supabase Error: ${await res.text()}`);
    }
    return res.json();
  }

  async getTodayLogs(): Promise<TimeLog[]> {
    const now = new Date();
    // Local time in UTC+3
    const localTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    // Start of local day
    localTime.setUTCHours(0, 0, 0, 0);
    // Convert back to UTC for Supabase query
    const utcStartOfToday = new Date(localTime.getTime() - 3 * 60 * 60 * 1000);

    const res = await fetch(`${this.url}/rest/v1/time_logs?created_at=gte.${utcStartOfToday.toISOString()}&select=*`, {
      method: 'GET',
      headers: this.headers
    });
    if (!res.ok) {
      console.error(`Supabase Error (getTodayLogs): ${await res.text()}`);
      return [];
    }
    return res.json();
  }

  async saveMessage(chatId: number, role: string, content: string) {
    const res = await fetch(`${this.url}/rest/v1/chat_history`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ chat_id: chatId, role, content })
    });
    if (!res.ok) {
      console.error(`Supabase Error (saveMessage): ${await res.text()}`);
    }
  }

  async getHistory(chatId: number, limit: number = 10): Promise<{role: string, content: string}[]> {
    const res = await fetch(`${this.url}/rest/v1/chat_history?chat_id=eq.${chatId}&select=role,content&order=created_at.desc&limit=${limit}`, {
      method: 'GET',
      headers: this.headers
    });
    if (!res.ok) {
      console.error(`Supabase Error (getHistory): ${await res.text()}`);
      return [];
    }
    const data = await res.json() as {role: string, content: string}[];
    return data.reverse(); // Return in chronological order
  }
}
