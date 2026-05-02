/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { Bindings } from './types';
import { TelegramClient, parseWithLLM } from './telegram';
import { SupabaseClient } from './supabase';
import { dashboardHtml } from './dashboard';

const app = new Hono<{ Bindings: Bindings }>();

const PERIODS = [
  { key: 'fajr_dhuhr',  label: 'الفجر → الظهر',    startH: 4,  startM: 30,  endH: 12, endM: 0  },
  { key: 'dhuhr_asr',   label: 'الظهر → العصر',    startH: 12, startM: 0,   endH: 15, endM: 30 },
  { key: 'asr_maghrib', label: 'العصر → المغرب',   startH: 15, startM: 30,  endH: 18, endM: 45 },
  { key: 'maghrib_isha',label: 'المغرب → العشاء',  startH: 18, startM: 45,  endH: 20, endM: 15 },
  { key: 'isha_fajr',   label: 'العشاء → الفجر',   startH: 20, startM: 15,  endH: 28, endM: 30 },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

function getCurrentPeriod(localHour: number, localMin: number): PeriodKey {
  const t = localHour * 60 + localMin;
  for (const p of PERIODS) {
    const startTotal = p.startH * 60 + p.startM;
    const endTotal   = p.endH   * 60 + p.endM;
    if (t >= startTotal && t < endTotal) return p.key;
  }
  return 'isha_fajr';
}

// ─── APIs ─────────────────────────────────────────────────────────────────────
app.get('/', (c) => c.html(dashboardHtml));
app.get('/dashboard', (c) => c.html(dashboardHtml));
app.get('/api/logs', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  return c.json(await supabase.getRecentLogs(50));
});
app.delete('/api/logs/:id', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  await supabase.deleteLog(Number(c.req.param('id')));
  return c.json({ ok: true });
});
app.get('/api/ideas', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  return c.json(await supabase.getRecentIdeas(30));
});
app.get('/api/tasks', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  return c.json(await supabase.getAllTasksForDashboard());
});
app.post('/api/tasks', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  const body = await c.req.json();
  return c.json(await supabase.createTask(body));
});
app.patch('/api/tasks/:id/done', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  await supabase.markTaskDone(Number(c.req.param('id')));
  return c.json({ ok: true });
});
app.delete('/api/tasks/:id', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  await supabase.deleteTask(Number(c.req.param('id')));
  return c.json({ ok: true });
});
app.get('/api/archive', async (c) => {
  const supabase = new SupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  return c.json(await supabase.getRecentArchive(7));
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

    await supabase.saveMessage(chatId, 'user', text);

    const [todayLogs, activeTimer, todayIdeas, todayTasks] = await Promise.all([
      supabase.getTodayLogs(),
      supabase.getActiveTimer(chatId),
      supabase.getTodayIdeas(),
      supabase.getTodayTasks(),
    ]);

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

    const currentPeriodTasks = todayTasks.filter(t => t.period === currentPeriod);
    const pendingTasks = currentPeriodTasks.filter(t => !t.is_done);
    
    const tasksSummary = currentPeriodTasks.length > 0
      ? currentPeriodTasks.map(t => `${t.is_done ? '✅' : '❌'} ${t.title}`).join('\n')
      : 'لا مهام مسجلة لهذه الفترة.';

    const systemContext = `
${activeTimer ? `⏱️ مؤقت نشط: "${activeTimer.timer_type}"` : '⏱️ لا يوجد مؤقت نشط.'}
🕌 الفترة: ${periodLabel}
📋 مهام الفترة الحالية:
${tasksSummary}

📊 إحصائيات اليوم:
- الساعات المسجلة: ${totalLoggedHours.toFixed(2)}
- الأنشطة: ${logsSummary || 'لا يوجد'}
- أفكار: ${todayIdeas.length}

قاعدة: إذا أخبرك المستخدم أنه انتهى من مهمة موجودة في القائمة، استخدم action: "reply" ورد بـ "تم التحديث ✅" وسنقوم بتحديثها لاحقاً أو اطلب منه تأكيد النشاط لتسجيله كـ log.
إذا كان المستخدم يماطل أو لم ينجز مهامه، كن حازماً قليلاً في الرد لشحذ همته.`;

    const history = await supabase.getHistory(chatId, 12);
    const result = await parseWithLLM(history, c.env.AI_API_KEY, systemContext);

    await supabase.saveMessage(chatId, 'assistant', result.reply_text);
    await telegram.sendMessage(chatId, result.reply_text, 'Markdown');

    switch (result.action) {
      case 'log':
        if (result.activity && result.duration_hours) {
          await supabase.insertLog({ activity: result.activity, duration_hours: result.duration_hours });
        }
        break;
      case 'start_timer':
        if (result.timer_type) await supabase.startTimer(chatId, result.timer_type);
        break;
      case 'stop_timer': {
        const stopped = await supabase.stopTimer(chatId);
        if (stopped) {
          await supabase.insertLog({ activity: stopped.timerType, duration_hours: stopped.durationHours });
          await telegram.sendMessage(chatId, `✅ تم تسجيل "${stopped.timerType}" لمدة ${Math.round(stopped.durationHours * 60)} دقيقة.`);
        }
        break;
      }
      case 'save_idea':
        if (result.idea_text) await supabase.saveIdea({ chat_id: chatId, content: result.idea_text, category: result.idea_category || 'مفيدة' });
        break;
    }

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ status: 'error' });
  }
});

// ─── Scheduled Cron ───────────────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  scheduled: async (_event: unknown, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil((async () => {
      try {
        const now = new Date();
        const localHour = (now.getUTCHours() + 3) % 24;
        const localMin  = now.getUTCMinutes();
        
        const supabase = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
        const chatId = parseInt(env.TELEGRAM_CHAT_ID);

        // 1. Midnight Reset (00:00 - 00:30)
        if (localHour === 0 && localMin < 30) {
          const count = await supabase.archiveAndResetDay();
          if (count > 0) await telegram.sendMessage(chatId, `🌙 انتهى اليوم! تم أرشفة ${count} نشاط بنجاح. سجل اليوم الجديد بدأ الآن 🌅`);
          return;
        }

        // 2. Periodic Follow-up (Check-ins & Period transitions)
        // Check if a period just ended (e.g., at 12:00, 15:30, etc.)
        for (const p of PERIODS) {
          if (localHour === p.endH && localMin < 30) {
            const todayTasks = await supabase.getTodayTasks();
            const missedTasks = todayTasks.filter(t => t.period === p.key && !t.is_done);
            if (missedTasks.length > 0) {
              const taskList = missedTasks.map(t => `- ${t.title}`).join('\n');
              await telegram.sendMessage(chatId, `⚠️ انتهت فترة *${p.label}* وهناك مهام لم تنجزها بعد:\n${taskList}\n\nماذا حدث؟ لا تدع الوقت يسرقك! 👊`, 'Markdown');
            }
          }
        }

        // 3. Regular 2-hour Check-in
        if (localHour >= 7 && localHour <= 23 && localHour % 2 === 0 && localMin < 30) {
          const keyboard = {
            reply_markup: {
              keyboard: [
                [{ text: "سأخبرك الآن ✍️" }, { text: "سأخبرك لاحقاً ⏳" }],
                [{ text: "ملخص اليوم 📊" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          };
          const msg = "⏰ مرت ساعتان.. ماذا أنجزت؟ سأنتظر تقريرك السريع.";
          await telegram.sendMessage(chatId, msg, '', keyboard.reply_markup);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }

      } catch (e) {
        console.error('Cron error:', e);
      }
    })());
  }
};
