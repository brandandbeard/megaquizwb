// api/quiz-ai.js
// এটা শুধু explanation generate করার জন্য GROQ_API_KEY_2 ব্যবহার করবে

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, options, correctAnswer, subject, chapter } = req.body;

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
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `তুমি একজন expert শিক্ষক। তোমাকে বাংলায় MCQ প্রশ্নের ব্যাখ্যা দিতে হবে।

নিয়ম:
- সঠিক উত্তর কেন সঠিক তা সহজ বাংলায় ব্যাখ্যা করো
- বাকি অপশনগুলো কেন ভুল তা সংক্ষেপে বলো
- প্রয়োজনে ছোট টেবিল বা পয়েন্ট আকারে দাও
- সহজ বাংলায় লেখো, যেন একজন ছাত্র সহজে বুঝতে পারে
- ৩-৫ লাইনের মধ্যে শেষ করো
- কোনো code block বা markdown fence দিও না`
          },
          {
            role: 'user',
            content: `প্রশ্ন: ${question}\nঅপশন: ${options}\nসঠিক উত্তর: ${correctAnswer}\nবিষয়: ${subject || ''}\nঅধ্যায়: ${chapter || ''}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ explanation: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
