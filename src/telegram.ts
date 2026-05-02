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

export async function parseMessage(text: string, nimApiKey?: string): Promise<{ activity: string; durationHours: number }> {
  if (nimApiKey) {
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nimApiKey}`
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          messages: [
            {
              role: 'system',
              content: 'You are an AI that extracts the activity name and the duration in hours from an Arabic text. Reply strictly with a JSON object in this format: {"activity": "string", "durationHours": number}. Do not add any extra text, explanation, or markdown formatting like ```json.'
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 150
        })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        let content = data.choices[0]?.message?.content?.trim() || '';
        // Clean up markdown just in case the model adds it despite instructions
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(content);
        if (parsed.activity && typeof parsed.durationHours === 'number') {
          return { activity: parsed.activity, durationHours: parsed.durationHours };
        }
      } else {
        console.error('NIM API Error:', await response.text());
      }
    } catch (e) {
      console.error('Error calling NIM LLM:', e);
    }
  }

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
