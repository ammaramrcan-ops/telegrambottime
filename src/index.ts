/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { Bindings } from './types';
import { TelegramClient, parseWithLLM } from './telegram';
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
    
    // Ignore updates that aren't messages
    if (!body.message || !body.message.text) {
      return c.json({ status: 'ignored' });
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
    const telegram = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);

    // 1. Save user message to history
    await supabase.saveMessage(chatId, 'user', text);

    // 2. Fetch recent chat history for context
    const history = await supabase.getHistory(chatId, 15);

    // 3. Pass history to LLM to parse and decide next action
    const result = await parseWithLLM(history, c.env.AI_API_KEY);

    // 4. Save the LLM's chosen reply to history
    await supabase.saveMessage(chatId, 'assistant', result.reply_text);

    // 5. Send the reply to the user via Telegram
    await telegram.sendMessage(chatId, result.reply_text);

    // 6. If the LLM decided the action is "log" (user confirmed), save to time_logs table
    if (result.action === 'log' && result.activity && result.duration_hours) {
      await supabase.insertLog({
        activity: result.activity,
        duration_hours: result.duration_hours
      });
    }

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ status: 'error', message: (error as Error).message });
  }
});

export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: Bindings, ctx: any) => {
    ctx.waitUntil((async () => {
      try {
        const utcHour = new Date().getUTCHours();
        const localHour = (utcHour + 3) % 24; // Convert UTC to UTC+3 (Egypt/Saudi Arabia)
        
        // Don't send messages during sleep hours (from 11 PM / 23:00 to 6 AM / 06:00)
        if (localHour >= 23 || localHour < 6) {
          console.log(`Skipping cron check. Local time is ${localHour}:00 (Sleep hours).`);
          return;
        }

        if (env.TELEGRAM_CHAT_ID) {
          const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
          const supabase = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
          const chatId = parseInt(env.TELEGRAM_CHAT_ID);
          
          const msg = "مرحباً! لقد مرت ساعتان. ماذا فعلت في آخر ساعتين؟";
          
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }
      } catch (e) {
        console.error('Cron job error:', e);
      }
    })());
  }
};
