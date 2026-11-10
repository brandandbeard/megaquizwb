// api/quiz-ai.js
// quiz-এ সাথে সাথে দেখানোর জন্য বিস্তারিত প্রিভিউ-ব্যাখ্যা (GROQ_API_KEY_2)।
// চূড়ান্ত যাচাইকৃত ব্যাখ্যা লেখে api/questioncheck.js — এই endpoint-এর লেখা
// কখনো শীটে সেভ হয় না; পরে যাচাইকৃত ব্যাখ্যা এসে client-এ তা বদলে যায়।
// v2.3:
//  - ডিজিট: সব ক্লাসে কঠোরভাবে ইংরেজি অঙ্ক (0-9) — ০-৯ বাংলা অঙ্ক একদম নয়;
//    AI যা-ই লিখুক, কোড দিয়ে জোর করে রূপান্তর করা হয় (enDigits)
//  - ব্যাখ্যা দীর্ঘ ও বিস্তারিত (মাত্র ৩-৫ লাইন নয়), max_tokens 1024
//  - self-made/বানানো তথ্য নিষিদ্ধ — শুধু প্রশ্ন+অপশন+দেওয়া উত্তর ও নিশ্চিত তথ্য
//  - temperature 0.2; শীটে লেখা বন্ধ (আগে এখান থেকেই ভুল ব্যাখ্যা শীটে চলে যেত)

import { enDigits } from './questioncheck.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, options, correctAnswer, subject, chapter, quizType } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question required' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_2;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY_2 not set in Vercel env' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: `তুমি একজন অভিজ্ঞ ও যত্নবান শিক্ষক। তোমাকে বাংলায় MCQ প্রশ্নের বিস্তারিত ব্যাখ্যা দিতে হবে।

ব্যাখ্যার কাঠামো (দীর্ঘ ও বিস্তারিত লিখবে — মাত্র 3-5 লাইনে শেষ করবে না):
1) প্রথমে বলো সঠিক উত্তর কোনটি এবং কেন সঠিক — ধারণা/প্রেক্ষাপট/কারণ সহ পুরো ব্যাখ্যা
2) এরপর প্রতিটি ভুল অপশন আলাদা করে — কেন ভুল, ছাত্ররা সাধারণত কোথায় গুলিয়ে ফেলে
3) শেষে 1-2 লাইনে মনে রাখার মতো মূল কথা
- সহজ বাংলায় লেখো, যেন ছাত্র সহজে বুঝতে পারে
- কোনো code block বা markdown fence দিও না

কঠোর নিয়ম (একটাও ভাঙা যাবে না):
- ব্যাখ্যা করবে শুধু প্রশ্ন, অপশন আর দেওয়া সঠিক উত্তরের ভিত্তিতে। নিজের মতো নতুন
  তথ্য, নাম, সাল, ঘটনা বা উদাহরণ বানাবে না — বানানো তথ্য সবচেয়ে বড় অপরাধ।
- বাইরের তথ্য লাগলে শুধু পাঠ্যবইয়ে প্রতিষ্ঠিত, তোমার পক্ষে 100% নিশ্চিত তথ্যই ব্যবহার
  করবে; সামান্য সন্দেহ থাকলে সেটা বাদ দিয়ে শুধু প্রশ্নের তথ্য থেকে যে যুক্তি দাঁড়ায়
  সেটাই দেখাবে — কম লেখা ভুল লেখার চেয়ে শতগুণ ভালো।
- কোনো ঘটনাকে ভুল ব্যক্তি, ভুল সময় বা ভুল নেতৃত্বের সাথে যুক্ত করবে না।
- দেওয়া সঠিক উত্তরকে কখনো ভুল বলবে না, অন্য কোনো অপশনকে সঠিক বলবে না।
- সব সংখ্যা ও সাল কঠোরভাবে ইংরেজি অঙ্কে (0-9) লেখবে — ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯
  বাংলা অঙ্ক একটাও ব্যবহার করবে না।`
          },
          {
            role: 'user',
            content: `প্রশ্ন: ${question}\nঅপশন: ${options}\nসঠিক উত্তর: ${correctAnswer}\nবিষয়: ${subject || ''}\nঅধ্যায়: ${chapter || ''}`
          }
        ],
        temperature: 0.2,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    let explanation = data.choices?.[0]?.message?.content || '';
    // AI যা-ই লিখুক, ফাইনাল ডিজিট কোডেই জোর করে ইংরেজি করা হয়
    explanation = enDigits(explanation);
    return res.status(200).json({ explanation: explanation });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
