/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { Bindings } from './types';
import { TelegramClient, parseWithLLM } from './telegram';
import { SupabaseClient } from './supabase';
import { dashboardHtml } from './dashboard';

const app = new Hono<{ Bindings: Bindings }>();

// ─── Pages ───────────────────────────────────────────────────────────────────
app.get('/', (c) => c.html(dashboardHtml));
app.get('/dashboard', (c) => c.html(dashboardHtml));
app.get('/ping', (c) => c.json({ status: 'alive' }));

// ─── APIs ─────────────────────────────────────────────────────────────────────
app.get('/api/logs', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    return c.json(await supabase.getRecentLogs(50));
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.get('/api/ideas', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    return c.json(await supabase.getRecentIdeas(30));
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// ─── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.message || !body.message.text) return c.json({ status: 'ignored' });

    const chatId: number = body.message.chat.id;
    const text: string = body.message.text;

    const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
    const telegram = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);

    // 1. Save user message to history
    await supabase.saveMessage(chatId, 'user', text);

    // 2. Build system context: today's data + active timer
    const [todayLogs, activeTimer, todayIdeas] = await Promise.all([
      supabase.getTodayLogs(),
      supabase.getActiveTimer(chatId),
      supabase.getTodayIdeas()
    ]);

    let totalLoggedHours = 0;
    let logsSummary = '';
    todayLogs.forEach(l => {
      totalLoggedHours += Number(l.duration_hours);
      logsSummary += `- ${l.activity}: ${l.duration_hours} ساعة\n`;
    });

    const currentLocalHour = (new Date().getUTCHours() + 3) % 24;
    let elapsedSinceWakeup = currentLocalHour - 6;
    if (elapsedSinceWakeup < 0) elapsedSinceWakeup = 0;
    const unloggedHours = Math.max(0, elapsedSinceWakeup - totalLoggedHours);

    const ideasSummary = todayIdeas.length > 0
      ? todayIdeas.map(i => `- [${i.category}] ${i.content}`).join('\n')
      : 'لا توجد أفكار مسجلة اليوم.';

    const activeTimerContext = activeTimer
      ? `⏱️ المؤقت النشط الآن: "${activeTimer.timer_type}" — بدأ الساعة ${new Date(activeTimer.started_at).toLocaleTimeString('ar-EG')}.`
      : '⏱️ لا يوجد مؤقت نشط حالياً.';

    const systemContext = `
${activeTimerContext}

📊 إحصائيات اليوم:
- الساعات المسجلة: ${totalLoggedHours} ساعة
- الساعات المنقضية منذ الاستيقاظ (6 ص): ${elapsedSinceWakeup} ساعة
- الساعات غير المسجلة (نقاط عمياء): ${unloggedHours} ساعة
- الأنشطة:
${logsSummary || '  لا يوجد أنشطة مسجلة اليوم.'}
- أفكار اليوم:
${ideasSummary}`;

    // 3. Fetch chat history and call LLM
    const history = await supabase.getHistory(chatId, 15);
    const result = await parseWithLLM(history, c.env.AI_API_KEY, systemContext);

    // 4. Save bot's reply to history & send it
    await supabase.saveMessage(chatId, 'assistant', result.reply_text);
    await telegram.sendMessage(chatId, result.reply_text);

    // 5. Execute the action
    switch (result.action) {

      case 'log':
        if (result.activity && result.duration_hours) {
          await supabase.insertLog({ activity: result.activity, duration_hours: result.duration_hours });
        }
        break;

      case 'start_timer':
        if (result.timer_type) {
          await supabase.startTimer(chatId, result.timer_type);
        }
        break;

      case 'stop_timer': {
        const stopped = await supabase.stopTimer(chatId);
        if (stopped) {
          const emoji = stopped.timerType === 'صلاة' ? '🕌' : stopped.timerType === 'أكل' ? '🍽️' : '🚿';
          const durationMins = Math.round(stopped.durationHours * 60);
          await supabase.insertLog({ activity: stopped.timerType, duration_hours: stopped.durationHours });
          // Send an additional confirmation message with the logged duration
          const logMsg = `${emoji} تم تسجيل "${stopped.timerType}" — المدة: ${durationMins} دقيقة (${stopped.durationHours} ساعة) ✅`;
          await telegram.sendMessage(chatId, logMsg);
        }
        break;
      }

      case 'save_idea':
        if (result.idea_text) {
          await supabase.saveIdea({
            chat_id: chatId,
            content: result.idea_text,
            category: result.idea_category || 'مفيدة'
          });
        }
        break;

      case 'day_summary': {
        // The LLM already composed the summary in reply_text.
        // We already sent it above, nothing else needed.
        break;
      }
    }

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ status: 'error', message: (error as Error).message });
  }
});

// ─── Scheduled Cron (every 2 hours) ──────────────────────────────────────────
export default {
  fetch: app.fetch,
  scheduled: async (_event: unknown, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil((async () => {
      try {
        const localHour = (new Date().getUTCHours() + 3) % 24;
        if (localHour >= 23 || localHour < 6) {
          console.log(`Cron skipped — sleep hours (local: ${localHour}:00)`);
          return;
        }
        if (env.TELEGRAM_CHAT_ID) {
          const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
          const supabase = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
          const chatId = parseInt(env.TELEGRAM_CHAT_ID);
          const msg = '⏰ مرحباً! لقد مرت ساعتان. ماذا فعلت في آخر ساعتين؟';
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }
      } catch (e) {
        console.error('Cron job error:', e);
      }
    })());
  }
};
