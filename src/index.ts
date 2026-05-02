/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { Bindings } from './types';
import { TelegramClient, parseWithLLM } from './telegram';
import { SupabaseClient } from './supabase';
import { dashboardHtml } from './dashboard';

const app = new Hono<{ Bindings: Bindings }>();

// ─── Prayer time periods for Ismailia (UTC+3) ────────────────────────────────
// Approximate times: Fajr 4:30, Dhuhr 12:00, Asr 15:30, Maghrib 18:45, Isha 20:15
const PERIODS = [
  { key: 'fajr_dhuhr',  label: 'الفجر → الظهر',    startH: 4,  startM: 30,  endH: 12, endM: 0  },
  { key: 'dhuhr_asr',   label: 'الظهر → العصر',    startH: 12, startM: 0,   endH: 15, endM: 30 },
  { key: 'asr_maghrib', label: 'العصر → المغرب',   startH: 15, startM: 30,  endH: 18, endM: 45 },
  { key: 'maghrib_isha',label: 'المغرب → العشاء',  startH: 18, startM: 45,  endH: 20, endM: 15 },
  { key: 'isha_fajr',   label: 'العشاء → الفجر',   startH: 20, startM: 15,  endH: 28, endM: 30 }, // 28:30 = 4:30 next day
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

function getCurrentPeriod(localHour: number, localMin: number): PeriodKey {
  const t = localHour * 60 + localMin;
  for (const p of PERIODS) {
    const startTotal = p.startH * 60 + p.startM;
    const endTotal   = p.endH   * 60 + p.endM;
    if (t >= startTotal && t < endTotal) return p.key;
  }
  // After Isha or before Fajr → isha_fajr
  return 'isha_fajr';
}

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

app.get('/api/tasks', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    return c.json(await supabase.getAllTasksForDashboard());
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.post('/api/tasks', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    const body = await c.req.json();
    const task = await supabase.createTask({
      title: body.title,
      period: body.period,
      estimated_hours: body.estimated_hours,
    });
    return c.json(task);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.patch('/api/tasks/:id/done', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    await supabase.markTaskDone(Number(c.req.param('id')));
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.delete('/api/tasks/:id', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    await supabase.deleteTask(Number(c.req.param('id')));
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

app.get('/api/archive', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  try {
    return c.json(await supabase.getRecentArchive(7));
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

    // 2. Build system context in parallel
    const [todayLogs, activeTimer, todayIdeas, todayTasks] = await Promise.all([
      supabase.getTodayLogs(),
      supabase.getActiveTimer(chatId),
      supabase.getTodayIdeas(),
      supabase.getTodayTasks(),
    ]);

    // Calculate stats
    let totalLoggedHours = 0;
    let logsSummary = '';
    todayLogs.forEach(l => {
      totalLoggedHours += Number(l.duration_hours);
      logsSummary += `- ${l.activity}: ${l.duration_hours} ساعة\n`;
    });

    const now = new Date();
    const localHour = (now.getUTCHours() + 3) % 24;
    const localMin  = now.getUTCMinutes();
    const currentPeriod = getCurrentPeriod(localHour, localMin);
    const periodLabel = PERIODS.find(p => p.key === currentPeriod)?.label || '';

    const ideasSummary = todayIdeas.length > 0
      ? todayIdeas.map(i => `- [${i.category}] ${i.content}`).join('\n')
      : 'لا توجد أفكار مسجلة اليوم.';

    const activeTimerContext = activeTimer
      ? `⏱️ المؤقت النشط الآن: "${activeTimer.timer_type}" — بدأ ${new Date(activeTimer.started_at).toLocaleTimeString('ar-EG')}.`
      : '⏱️ لا يوجد مؤقت نشط حالياً.';

    // Pending tasks for current period
    const currentPeriodTasks = todayTasks.filter(t => t.period === currentPeriod && !t.is_done);
    const tasksSummary = currentPeriodTasks.length > 0
      ? currentPeriodTasks.map(t => `- ${t.title}${t.estimated_hours ? ` (${t.estimated_hours} ساعة)` : ''}`).join('\n')
      : 'لا مهام معلقة في هذه الفترة.';

    const systemContext = `
${activeTimerContext}

🕌 الفترة الحالية: ${periodLabel} (${localHour}:${String(localMin).padStart(2,'0')})
📋 مهام هذه الفترة:
${tasksSummary}

📊 إحصائيات اليوم:
- الساعات المسجلة: ${totalLoggedHours.toFixed(2)} ساعة
- الأنشطة:
${logsSummary || '  لا يوجد أنشطة مسجلة اليوم.'}
- أفكار اليوم:
${ideasSummary}`;

    // 3. Fetch chat history and call LLM
    const history = await supabase.getHistory(chatId, 12);
    const result = await parseWithLLM(history, c.env.AI_API_KEY, systemContext);

    // 4. Save bot reply & send
    await supabase.saveMessage(chatId, 'assistant', result.reply_text);
    await telegram.sendMessage(chatId, result.reply_text);

    // 5. Execute action
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

      case 'day_summary':
        // LLM already composed the summary in reply_text
        break;
    }

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ status: 'error', message: (error as Error).message });
  }
});

// ─── Scheduled Cron ───────────────────────────────────────────────────────────
// Runs every 30 minutes (0,30 * * * *)
// Handles: 1) task reminders  2) 2-hour check-ins  3) midnight archive reset
export default {
  fetch: app.fetch,
  scheduled: async (_event: unknown, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil((async () => {
      try {
        const now = new Date();
        const localHour = (now.getUTCHours() + 3) % 24;
        const localMin  = now.getUTCMinutes();
        const totalMins = localHour * 60 + localMin;

        // ── Midnight reset: archive yesterday and clear logs (runs at 00:00–00:30) ──
        if (localHour === 0 && localMin < 30) {
          const supabase = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
          const count = await supabase.archiveAndResetDay();
          if (count > 0 && env.TELEGRAM_CHAT_ID) {
            const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
            const chatId = parseInt(env.TELEGRAM_CHAT_ID);
            await telegram.sendMessage(chatId,
              `🌙 انتهى اليوم! تم أرشفة ${count} نشاط وإعادة ضبط السجل من الصفر.\nصباح الخير غداً! 🌅`
            );
          }
          console.log(`Midnight archive: ${count} logs archived`);
        }

        // ── Sleep hours: skip reminders ──
        if (totalMins < 4 * 60 + 30 || totalMins >= 23 * 60) {
          console.log(`Cron skipped — sleep hours (${localHour}:${localMin})`);
          return;
        }

        if (!env.TELEGRAM_CHAT_ID) return;
        const chatId = parseInt(env.TELEGRAM_CHAT_ID);
        const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
        const supabase = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        // ── Task reminders: check tasks whose period is starting now ──
        const currentPeriod = getCurrentPeriod(localHour, localMin);
        const todayTasks = await supabase.getTodayTasks();
        const tasksToRemind = todayTasks.filter(t =>
          t.period === currentPeriod && !t.is_done && !t.reminder_sent
        );

        if (tasksToRemind.length > 0) {
          const periodLabel = PERIODS.find(p => p.key === currentPeriod)?.label || '';
          let reminderMsg = `🔔 تذكير بمهام فترة *${periodLabel}*:\n\n`;
          tasksToRemind.forEach((t, i) => {
            reminderMsg += `${i + 1}. ${t.title}`;
            if (t.estimated_hours) reminderMsg += ` (${t.estimated_hours} ساعة)`;
            reminderMsg += '\n';
          });
          reminderMsg += '\nوفقك الله! 💪';
          await telegram.sendMessage(chatId, reminderMsg);

          // Mark reminders as sent
          await Promise.all(tasksToRemind.map(t => supabase.markTaskReminderSent(t.id!)));
        }

        // ── Every 2 hours: check-in message ──
        const isEvenHour = localMin < 30 && localHour % 2 === 0;
        if (isEvenHour) {
          const msg = `⏰ مرحباً! لقد مرت ساعتان. ماذا فعلت في آخر ساعتين؟`;
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }

      } catch (e) {
        console.error('Cron job error:', e);
      }
    })());
  }
};
