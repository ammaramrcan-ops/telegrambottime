/// <reference types="@cloudflare/workers-types" />

export class TelegramClient {
  constructor(private token: string) {}

  async sendMessage(chatId: number, text: string, parseMode: string = '', replyMarkup: any = null) {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (parseMode) body['parse_mode'] = parseMode;
    if (replyMarkup) body['reply_markup'] = replyMarkup;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

export interface LLMResult {
  action: 'reply' | 'log' | 'start_timer' | 'stop_timer' | 'save_idea' | 'day_summary';
  reply_text: string;
  // For "log"
  activity?: string;
  duration_hours?: number;
  // For "start_timer" / "stop_timer"
  timer_type?: string; // "حمام" | "أكل" | "صلاة"
  // For "save_idea"
  idea_text?: string;
  idea_category?: 'مفيدة' | 'مضيعة للوقت';
}

/**
 * Extracts the first valid JSON object from an LLM response string.
 * Handles cases where the model wraps the JSON in markdown code blocks.
 */
function extractJson(raw: string): string {
  // Remove markdown fences
  let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  // Find the first '{' and last '}' to extract the JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

export async function parseWithLLM(
  history: { role: string; content: string }[],
  nimApiKey: string,
  systemContext: string = ''
): Promise<LLMResult> {
  const systemPrompt = `أنت مساعد شخصي ذكي لتتبع الوقت والإنتاجية عبر تيليجرام.
هدفك فهم نية المستخدم بدقة من خلال الرسائل السابقة، وتحديد الإجراء المناسب.

━━━ الإجراءات المتاحة ━━━

1. action: "reply"
   → للتحيات والأسئلة العامة والحوار العادي أو إذا احتجت لسؤال المستخدم لمزيد من التفاصيل.

2. action: "log"
   → عندما يؤكد المستخدم تسجيل نشاط بعد أن طلبت التأكيد منه (مثل "نعم" أو "أكد").
   → يتطلب: activity (اسم النشاط) + duration_hours (رقم عشري).
   → قاعدة مهمة: لا تسجل مباشرة بدون تأكيد. اطلب تأكيداً أولاً (action: "reply").

3. action: "start_timer"
   → عندما يخبرك المستخدم أنه ذاهب لنشاط مباشر: حمام / أكل / صلاة.
   → يتطلب: timer_type = "حمام" أو "أكل" أو "صلاة"

4. action: "stop_timer"
   → عندما يخبرك المستخدم أنه انتهى من النشاط.
   → استنتج timer_type من السياق (المؤقت النشط).
   → timer_type: "حمام" أو "أكل" أو "صلاة"

5. action: "save_idea"
   → عندما يذكر المستخدم فكرة.
   → يتطلب: idea_text + idea_category = "مفيدة" أو "مضيعة للوقت"

6. action: "day_summary"
   → فقط إذا طلب المستخدم صراحةً ملخص يومه.

━━━ السياق الحالي ━━━
${systemContext}

━━━ قواعد صارمة ━━━
- ردودك دائماً بالعربية.
- لا تهلوس أو تخترع معلومات.
- أرجع JSON فقط، بدون أي نص خارج الـ JSON. لا markdown. لا شرح.

الشكل المطلوب:
{"action":"...","reply_text":"...","activity":"...","duration_hours":0,"timer_type":"...","idea_text":"...","idea_category":"..."}`;

  try {
    // Use AbortController for a strict 25-second timeout (Cloudflare Workers limit is 30s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response: Response;
    try {
      response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nimApiKey}`
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history
          ],
          temperature: 0.1,
          max_tokens: 512,
          stream: false
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = (await response.json()) as any;
      const rawContent = data.choices?.[0]?.message?.content?.trim() || '';
      const jsonStr = extractJson(rawContent);
      try {
        const parsed = JSON.parse(jsonStr) as LLMResult;
        return parsed;
      } catch {
        console.error('JSON parse error. Raw:', rawContent);
        return { action: 'reply', reply_text: 'عذراً، حدث خطأ في معالجة الرد. حاول مرة أخرى.' };
      }
    } else {
      const errText = await response.text();
      console.error('NIM API Error:', response.status, errText);
      return { action: 'reply', reply_text: `⚠️ خطأ في الاتصال بالذكاء الاصطناعي (${response.status}). حاول مرة أخرى.` };
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.error('LLM request timed out after 25s');
      return { action: 'reply', reply_text: '⏱️ انتهت مهلة الاتصال بالذكاء الاصطناعي. حاول مرة أخرى.' };
    }
    console.error('Error calling NIM LLM:', e);
    return { action: 'reply', reply_text: '⚠️ حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.' };
  }
}
