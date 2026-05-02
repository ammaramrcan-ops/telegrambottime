/// <reference types="@cloudflare/workers-types" />

export class TelegramClient {
  constructor(private token: string) {}

  async sendMessage(chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
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

export async function parseWithLLM(
  history: { role: string; content: string }[],
  nimApiKey: string,
  systemContext: string = ''
): Promise<LLMResult> {
  try {
    const systemPrompt = `أنت مساعد شخصي ذكي لتتبع الوقت والإنتاجية عبر تيليجرام.
هدفك فهم نية المستخدم بدقة من خلال الرسائل السابقة، وتحديد الإجراء المناسب.

━━━ الإجراءات المتاحة ━━━

1. action: "reply"
   → للتحيات والأسئلة العامة والحوار العادي أو إذا احتجت لسؤال المستخدم لمزيد من التفاصيل.

2. action: "log"
   → عندما يؤكد المستخدم تسجيل نشاط بعد أن طلبت التأكيد منه (مثل "نعم" أو "أكد").
   → يتطلب: activity (اسم النشاط) + duration_hours (رقم).
   → قاعدة مهمة: لا تسجل مباشرة بدون تأكيد. اطلب تأكيداً أولاً (action: "reply").

3. action: "start_timer"
   → عندما يخبرك المستخدم أنه ذاهب لنشاط مباشر: حمام / أكل / صلاة.
   → يتطلب: timer_type = "حمام" أو "أكل" أو "صلاة"
   → reply_text يكون تشجيعياً مثل: "حسناً، سأبدأ في قياس وقت الصلاة الآن ⏱️"

4. action: "stop_timer"
   → عندما يخبرك المستخدم أنه انتهى من النشاط (من حمام أو أكل أو صلاة).
   → إذا لم يحدد من ماذا انتهى، استنتج من السياق (المؤقت النشط الموضح أدناه).
   → إذا لم يكن هناك سياق كافٍ، اسأله. (رجوع لـ action: "reply")
   → timer_type يكون الاسم العربي: "حمام" أو "أكل" أو "صلاة"

5. action: "save_idea"
   → عندما يذكر المستخدم فكرة (مثل "جاءت لي فكرة..." أو "لدي فكرة...").
   → يتطلب: idea_text (نص الفكرة) + idea_category = "مفيدة" أو "مضيعة للوقت"
   → قيّم الفكرة: هل هي ذات قيمة وإنتاجية؟ أم تشتيت؟ واختر التصنيف المناسب.
   → reply_text يعلق على الفكرة باختصار.

6. action: "day_summary"
   → فقط إذا طلب المستخدم صراحةً ملخص يومه (مثل "ملخص يومي", "ماذا فعلت اليوم؟", "تقرير اليوم").

━━━ السياق الحالي ━━━
${systemContext}

━━━ قواعد عامة ━━━
- ردودك دائماً بالعربية.
- لا تهلوس أو تخترع معلومات.
- ردك يجب أن يكون JSON فقط، بدون أي نصوص إضافية أو markdown.

الشكل المطلوب:
{
  "action": "...",
  "reply_text": "...",
  "activity": "...",
  "duration_hours": 0,
  "timer_type": "...",
  "idea_text": "...",
  "idea_category": "..."
}`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
        max_tokens: 350
      })
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      let content = data.choices[0]?.message?.content?.trim() || '';
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(content) as LLMResult;
      return parsed;
    } else {
      console.error('NIM API Error:', await response.text());
      return { action: 'reply', reply_text: 'عذراً، حدث خطأ في الاتصال بالذكاء الاصطناعي.' };
    }
  } catch (e) {
    console.error('Error calling NIM LLM:', e);
    return { action: 'reply', reply_text: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.' };
  }
}
