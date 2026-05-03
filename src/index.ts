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

const PERIOD_NAMES_MAP: Record<string, string> = {
  fajr_dhuhr: 'فجر',
  dhuhr_asr: 'ظهر',
  asr_maghrib: 'عصر',
  maghrib_isha: 'مغرب',
  isha_fajr: 'عشاء'
};

// ─── Global State ─────────────────────────────────────────────────────────────
type ChatState = 
  | { type: 'waiting_gap'; start: Date; end: Date }
  | { type: 'waiting_blind'; gaps: { start: Date; end: Date }[]; currentIndex: number }
  | { type: 'waiting_duration'; activity: string };

const stateStore = new Map<number, ChatState>();

function getConfirmationMsg(activity: string, durationHours: number, periodKey: string): string {
  const durationStr = durationHours < 1 
    ? `${Math.round(durationHours * 60)} دقيقة` 
    : `${durationHours.toFixed(1)} ساعة`;
  
  const periodName = PERIOD_NAMES_MAP[periodKey] || 'غير محددة';
  return `✅ تم تسجيل النشاط\n📌 ${activity}\n⏱️ المدة: ${durationStr}\n🕐 الفترة: ${periodName}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });
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

    const cleanText = text.trim().toLowerCase();
    const state = stateStore.get(chatId);

    // ─── 1. Handle States ─────────────────────────────────────────────────────
    if (state) {
      if (state.type === 'waiting_duration') {
        const mins = parseFloat(text);
        if (!isNaN(mins)) {
          const durationHours = mins / 60;
          await supabase.insertLog({ activity: state.activity, duration_hours: durationHours });
          stateStore.delete(chatId);
          const now = new Date();
          const period = getCurrentPeriod((now.getUTCHours() + 3) % 24, now.getUTCMinutes());
          const msg = getConfirmationMsg(state.activity, durationHours, period);
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
          return c.json({ status: 'ok' });
        }
      } 
      else if (state.type === 'waiting_gap') {
        const durationHours = (state.end.getTime() - state.start.getTime()) / 3600000;
        await supabase.insertLog({ activity: text, duration_hours: durationHours });
        stateStore.delete(chatId);
        const period = getCurrentPeriod((state.end.getUTCHours() + 3) % 24, state.end.getUTCMinutes());
        const msg = getConfirmationMsg(text, durationHours, period);
        await telegram.sendMessage(chatId, msg);
        await supabase.saveMessage(chatId, 'assistant', msg);
        return c.json({ status: 'ok' });
      }
      else if (state.type === 'waiting_blind') {
        const currentGap = state.gaps[state.currentIndex];
        const durationHours = (currentGap.end.getTime() - currentGap.start.getTime()) / 3600000;
        await supabase.insertLog({ activity: text, duration_hours: durationHours });
        
        const nextIndex = state.currentIndex + 1;
        if (nextIndex < state.gaps.length) {
          const nextGap = state.gaps[nextIndex];
          stateStore.set(chatId, { ...state, currentIndex: nextIndex });
          const msg = `ماذا كنت تفعل من ${formatTime(nextGap.start)} إلى ${formatTime(nextGap.end)}؟`;
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        } else {
          stateStore.delete(chatId);
          const msg = "✅ تم تسجيل جميع الفجوات!";
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }
        return c.json({ status: 'ok' });
      }
    }

    // ─── 2. Handle Commands ───────────────────────────────────────────────────
    if (cleanText === 'start') {
      const [tasks, logs] = await Promise.all([supabase.getTodayTasks(), supabase.getTodayLogs()]);
      const pending = tasks.filter(t => !t.is_done);
      const tasksStr = pending.length > 0 ? pending.map(t => `• ${t.title}`).join('\n') : "لا توجد مهام مضافة اليوم";
      const msg = `🌅 صباح الخير! يوم جديد مبارك\n\n📋 مهامك اليوم:\n${tasksStr}\n\n📊 الأنشطة المسجلة حتى الآن: ${logs.length}\n\n💪 بالتوفيق!`;
      await telegram.sendMessage(chatId, msg);
      await supabase.saveMessage(chatId, 'assistant', msg);
      return c.json({ status: 'ok' });
    }

    if (cleanText === 'gap') {
      const logs = await supabase.getTodayLogs();
      const now = new Date();
      const cairoNow = new Date(now.getTime() + 3 * 3600000);
      
      let lastEnd = new Date(now.getTime() + 3 * 3600000);
      lastEnd.setUTCHours(0, 0, 0, 0); // Start of Cairo day
      
      if (logs.length > 0) {
        const lastLog = logs[logs.length - 1];
        lastEnd = new Date(lastLog.created_at!);
        lastEnd = new Date(lastEnd.getTime() + 3 * 3600000); // Back to Cairo time for calculation
      }

      const diffMins = Math.round((cairoNow.getTime() - lastEnd.getTime()) / 60000);
      if (diffMins < 2) {
        await telegram.sendMessage(chatId, "⚡ لا توجد فجوة زمنية تُذكر");
        return c.json({ status: 'ok' });
      }

      const durationStr = diffMins < 60 ? `${diffMins} دقيقة` : `${(diffMins/60).toFixed(1)} ساعة`;
      const msg = `⏱️ آخر فجوة زمنية: ${durationStr}\nمن ${formatTime(new Date(lastEnd.getTime() - 3 * 3600000))} إلى ${formatTime(now)}\n\nماذا كنت تفعل في هذا الوقت؟`;
      stateStore.set(chatId, { type: 'waiting_gap', start: new Date(lastEnd.getTime() - 3 * 3600000), end: now });
      await telegram.sendMessage(chatId, msg);
      await supabase.saveMessage(chatId, 'assistant', msg);
      return c.json({ status: 'ok' });
    }

    if (cleanText === 'blind') {
      const logs = await supabase.getTodayLogs();
      const now = new Date();
      
      const gaps: { start: Date; end: Date }[] = [];
      let lastEnd = new Date();
      lastEnd.setUTCHours(0, 0, 0, 0);
      lastEnd = new Date(lastEnd.getTime() - 3 * 3600000); // 00:00 Cairo in UTC

      for (const log of logs) {
        const logEnd = new Date(log.created_at!);
        const logStart = new Date(logEnd.getTime() - (log.duration_hours * 3600000));
        const diffMins = (logStart.getTime() - lastEnd.getTime()) / 60000;
        if (diffMins > 5) gaps.push({ start: lastEnd, end: logStart });
        lastEnd = logEnd;
      }

      const finalDiff = (now.getTime() - lastEnd.getTime()) / 60000;
      if (finalDiff > 5) gaps.push({ start: lastEnd, end: now });

      if (gaps.length === 0) {
        await telegram.sendMessage(chatId, "🔍 لا توجد نقاط عمياء في يومك حتى الآن! أحسنت.");
        return c.json({ status: 'ok' });
      }

      let gapsMsg = "🔍 النقاط العمياء في يومك:\n\n";
      gaps.forEach((g, i) => {
        const mins = Math.round((g.end.getTime() - g.start.getTime()) / 60000);
        gapsMsg += `${i + 1}️⃣ من ${formatTime(g.start)} إلى ${formatTime(g.end)} (${mins} دقيقة)\n`;
      });
      gapsMsg += `\nسأسألك عن كل فترة واحدة تلو الأخرى.\nماذا كنت تفعل من ${formatTime(gaps[0].start)} إلى ${formatTime(gaps[0].end)}؟`;
      
      stateStore.set(chatId, { type: 'waiting_blind', gaps, currentIndex: 0 });
      await telegram.sendMessage(chatId, gapsMsg);
      await supabase.saveMessage(chatId, 'assistant', gapsMsg);
      return c.json({ status: 'ok' });
    }

    const quickLogMap: Record<string, string> = {
      wc: "حمام 🚽",
      food: "أكل 🍽️",
      pray: "صلاة 🕌",
      waste: "تضييع وقت ⏳"
    };

    if (quickLogMap[cleanText]) {
      stateStore.set(chatId, { type: 'waiting_duration', activity: quickLogMap[cleanText] });
      await telegram.sendMessage(chatId, "⏱️ كم دقيقة؟");
      return c.json({ status: 'ok' });
    }

    if (cleanText === 'stats') {
      const logs = await supabase.getTodayLogs();
      if (logs.length === 0) {
        await telegram.sendMessage(chatId, "📊 لا توجد أنشطة مسجلة اليوم بعد.");
        return c.json({ status: 'ok' });
      }

      let totalMins = 0;
      let longest = logs[0];
      const periodMins: Record<string, number> = { fajr_dhuhr: 0, dhuhr_asr: 0, asr_maghrib: 0, maghrib_isha: 0, isha_fajr: 0 };

      logs.forEach(l => {
        const mins = l.duration_hours * 60;
        totalMins += mins;
        if (l.duration_hours > longest.duration_hours) longest = l;
        
        const logTime = new Date(l.created_at!);
        const hour = (logTime.getUTCHours() + 3) % 24;
        const period = getCurrentPeriod(hour, logTime.getUTCMinutes());
        periodMins[period] += mins;
      });

      const msg = `📊 ملخص يومك حتى الآن

⏱️ إجمالي الوقت المسجل: ${Math.floor(totalMins/60)} ساعة ${Math.round(totalMins%60)} دقيقة
📝 عدد الأنشطة: ${logs.length}

📅 توزيع الفترات:
🌙 فجر: ${Math.round(periodMins.fajr_dhuhr)} دقيقة
☀️ ظهر: ${Math.round(periodMins.dhuhr_asr)} دقيقة
🌤️ عصر: ${Math.round(periodMins.asr_maghrib)} دقيقة
🌆 مغرب: ${Math.round(periodMins.maghrib_isha)} دقيقة
🌙 عشاء: ${Math.round(periodMins.isha_fajr)} دقيقة

🏆 أطول نشاط: ${longest.activity} (${Math.round(longest.duration_hours * 60)} دقيقة)`;

      await telegram.sendMessage(chatId, msg);
      await supabase.saveMessage(chatId, 'assistant', msg);
      return c.json({ status: 'ok' });
    }

    // ─── 3. Existing LLM Logic ───────────────────────────────────────────────
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
          const msg = getConfirmationMsg(result.activity, result.duration_hours, currentPeriod);
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
        }
        break;
      case 'start_timer':
        if (result.timer_type) await supabase.startTimer(chatId, result.timer_type);
        break;
      case 'stop_timer': {
        const stopped = await supabase.stopTimer(chatId);
        if (stopped) {
          await supabase.insertLog({ activity: stopped.timerType, duration_hours: stopped.durationHours });
          const msg = getConfirmationMsg(stopped.timerType, stopped.durationHours, currentPeriod);
          await telegram.sendMessage(chatId, msg);
          await supabase.saveMessage(chatId, 'assistant', msg);
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
