// api/quiz-ai.js
// এটা শুধু explanation generate করার জন্য GROQ_API_KEY_2 ব্যবহার করবে

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, options, correctAnswer } = req.body;

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
        model: 'qwen/qwen3.6-27b',
        messages: [
          {
            role: 'system',
            content: `তুমি একজন expert শিক্ষক। তোমাকে বাংলায় (বা ইংরেজি গ্রামার প্রশ্নে ইংরেজিতে) ব্যাখ্যা দিতে হবে।

📌 কঠোর নিয়ম:
- সরাসরি চূড়ান্ত উত্তর লিখবে। কোনো "Let me think", "The subject is", "We need to" বা প্ল্যানিং টেক্সট লিখবে না।
- ফরম্যাট হুবহু এরকম হবে:
  প্রথম লাইনে: ✅ সঠিক উত্তর: [অপশন লেটার]. [অপশন টেক্সট] — [এক লাইনে কেন সঠিক]
  তারপর বাকি ৩টি অপশন বুলেট পয়েন্টে:
  • [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, সংক্ষেপে]
- সাবজেক্ট বা চ্যাপ্টারের নাম উল্লেখ করবে না।
- ৪ লাইনের মধ্যে শেষ করো।
- কোনো code block বা অতিরিক্ত শিরোনাম দিবে না।
- সহজ বাংলায় লিখবে।

📌 উদাহরণ (বাংলা):
✅ সঠিক উত্তর: D. H₂O — জলে ২টি হাইড্রোজেন ও ১টি অক্সিজেন পরমাণু থাকে।
• A. CO₂ → কার্বন ডাই-অক্সাইড, বাতাসে থাকা গ্যাস।
• B. HCl → হাইড্রোক্লোরিক অ্যাসিড।
• C. NaCl → সোডিয়াম ক্লোরাইড, অর্থাৎ খাবার লবণ।

📌 উদাহরণ (ইংরেজি গ্রামার):
✅ Correct Answer: B. Fearless — "Fearless" means having no fear, same as "Brave".
• A. Coward → means someone who is not brave.
• C. Weak → means lacking physical strength.
• D. Timid → means easily scared.`
          },
          {
            role: 'user',
            content: `প্রশ্ন: ${question}\nঅপশন: ${options}\nসঠিক উত্তর: ${correctAnswer}`
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    // ✅ <think> ট্যাগ ফিল্টার করা (যেটা আগে সমস্যা করছিল)
    text = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    return res.status(200).json({ explanation: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
