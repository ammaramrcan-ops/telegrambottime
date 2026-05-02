/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { Bindings } from './types';
import { TelegramClient, parseMessage } from './telegram';
import { SupabaseClient } from './supabase';
import { dashboardHtml } from './dashboard';

const app = new Hono<{ Bindings: Bindings }>();

// Dashboard Route (serves the Arabic HTML)
app.get('/', (c) => {
  return c.html(dashboardHtml);
});

app.get('/dashboard', (c) => {
  return c.html(dashboardHtml);
});

// Health check endpoint
app.get('/ping', (c) => {
  return c.json({ status: 'alive' });
});

// API for logs (used by the dashboard Chart.js and Table)
app.get('/api/logs', async (c) => {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
    return c.json({ error: 'Supabase credentials not configured' }, 500);
  }
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    const logs = await supabase.getRecentLogs(50); // Get last 50 logs
    return c.json(logs);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Telegram Webhook Handler
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    
    // Ignore updates that aren't messages (e.g. channel posts, edits, etc.)
    if (!body.message || !body.message.text) {
      return c.json({ status: 'ignored' });
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    // 1. Parse the message to extract activity and duration using NIM API if configured
    const { activity, durationHours } = await parseMessage(text, c.env.NIM_API_KEY);

    // 2. Save to Supabase
    if (c.env.SUPABASE_URL && c.env.SUPABASE_ANON_KEY) {
      const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
      await supabase.insertLog({
        activity,
        duration_hours: durationHours
      });
    } else {
      console.error('Supabase credentials missing.');
    }

    // 3. Send Success Reply strictly in ARABIC
    if (c.env.TELEGRAM_BOT_TOKEN) {
      const telegram = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
      const replyText = `تم تسجيل النشاط بنجاح يا هندسة! ✅\nالنشاط: ${activity}\nالمدة: ${durationHours} ساعة`;
      await telegram.sendMessage(chatId, replyText);
    } else {
      console.error('Telegram bot token missing.');
    }

    // Cloudflare Workers handling Telegram webhooks must return 200 OK
    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    // Returning 200 even on error prevents Telegram from retrying the same bad webhook multiple times
    return c.json({ status: 'error', message: (error as Error).message });
  }
});

export default app;
