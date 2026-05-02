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

export function parseMessage(text: string): { activity: string; durationHours: number } {
  // Placeholder parser as requested (can be replaced with LLM API)
  const arabicNumbers = [
    { word: 'ساعتين', val: 2 },
    { word: 'ساعة واحدة', val: 1 },
    { word: 'ساعة', val: 1 },
    { word: 'نص ساعة', val: 0.5 },
    { word: 'نصف ساعة', val: 0.5 },
    { word: 'نص', val: 0.5 },
    { word: 'نصف', val: 0.5 },
    { word: 'ربع', val: 0.25 },
  ];
  let durationHours = 0;
  let activity = text;

  // Try extracting decimal/integers first
  const digitMatch = text.match(/([\d\.]+)/);
  if (digitMatch) {
    durationHours = parseFloat(digitMatch[1]);
    activity = text.replace(digitMatch[0], '').replace(/(ساعة|ساعات|لمدة)/g, '').trim();
  } else {
    // Try word matching
    for (const num of arabicNumbers) {
      if (text.includes(num.word)) {
        durationHours = num.val;
        activity = text.replace(num.word, '').trim();
        break;
      }
    }
  }

  if (durationHours === 0) durationHours = 1; // Default fallback
  if (!activity) activity = "نشاط عام";

  return { activity, durationHours };
}
