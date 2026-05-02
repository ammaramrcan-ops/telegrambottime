/// <reference types="@cloudflare/workers-types" />
export class TelegramClient {
  constructor(private token: string) {}

  async sendMessage(chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
  }
}

export async function parseWithLLM(history: {role: string, content: string}[], nimApiKey: string, todayContext: string = ''): Promise<{ action: string; reply_text: string; activity?: string; duration_hours?: number }> {
  try {
    const messages = [
      {
        role: 'system',
        content: `أنت مساعد شخصي ذكي لتتبع الوقت عبر تيليجرام.
هدفك هو مساعدة المستخدم في تسجيل نشاطاته بدقة، وفهم سياق الحديث بناءً على الرسائل السابقة.
قواعد هامة جداً:
1. إذا كانت رسالة المستخدم مجرد تحية (مثل مرحبا) أو سؤال عام، قم بالرد عليها بشكل طبيعي. (action: "reply")
2. إذا ذكر المستخدم نشاطاً لكنه غير واضح أو لم يذكر تفاصيل (مثل "ذاكرت" أو "نعم")، اسأله أسئلة تفصيلية لتحديد النشاط بوضوح، أو اسأله عن المدة. (action: "reply")
3. إذا سألتَ أنت مسبقاً "ماذا فعلت في آخر ساعتين؟" وأجاب المستخدم بنشاط، افترض تلقائياً أن المدة هي ساعتين (2) ما لم يحدد هو خلاف ذلك.
4. إذا استنتجت أو فهمت بوضوح "اسم النشاط" و"المدة الزمنية"، **يجب** أن تطلب تأكيداً نهائياً من المستخدم قبل التسجيل، مثل: "هل تريدني أن أؤكد تسجيل نشاط [النشاط] لمدة [المدة] ساعة؟". (action: "reply")
5. إذا وافق المستخدم (نعم، أكد، صحيح) على النشاط الذي طلبت منه تأكيده للتو، فقم بتسجيله فوراً. (action: "log")
6. ${todayContext}

يجب أن يكون ردك دائماً بصيغة JSON فقط، بدون أي نصوص إضافية، بالشكل التالي:
{
  "action": "reply" أو "log",
  "reply_text": "الرسالة التي سترسلها للمستخدم (مطلوب دائماً)",
  "activity": "اسم النشاط في حال action هو log",
  "duration_hours": 2 (المدة بالساعات كرقم في حال action هو log)
}`
      },
      ...history
    ];

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nimApiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: messages,
        temperature: 0.1,
        max_tokens: 250
      })
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      let content = data.choices[0]?.message?.content?.trim() || '';
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(content);
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
