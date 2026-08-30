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
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: `তুমি একজন expert শিক্ষক। তুমি সরাসরি চূড়ান্ত উত্তর লিখবে।

🚨 সবচেয়ে গুরুত্বপূর্ণ নিয়ম:
- তুমি কোনো চিন্তাভাবনা, পরিকল্পনা, বিশ্লেষণ লিখবে না।
- <think>, </think>, "Let me think", "Here's a thinking process", "The question is", "I need to" - এসব কিছুই লিখবে না।
- সরাসরি নিচের ফরম্যাটে উত্তর দাও।

📌 ফরম্যাট (হুবহু এইভাবে):
প্রথম লাইনে সঠিক উত্তর:
✅ সঠিক উত্তর: [অপশন লেটার]. [অপশন টেক্সট] — [এক লাইনে কেন সঠিক]

তারপর বাকি ৩টি ভুল অপশন বুলেট পয়েন্টে:
• [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, সংক্ষেপে]
• [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, সংক্ষেপে]
• [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, সংক্ষেপে]

📌 ভাষা নিয়ম:
- যদি প্রশ্ন ও অপশন ইংরেজিতে থাকে এবং বিষয়টি ইংরেজি গ্রামার, শব্দার্থ, বানান, বা বাক্য সংশোধন সংক্রান্ত হয়, তাহলে ব্যাখ্যা ইংরেজিতে দাও।
- অন্য সব ক্ষেত্রে (ইতিহাস, ভূগোল, বিজ্ঞান, সাধারণ জ্ঞান, সংবিধান ইত্যাদি) প্রশ্ন ইংরেজিতে হলেও ব্যাখ্যা সহজ বাংলায় দাও।

📌 অন্যান্য নিয়ম:
- মোট ৪ লাইনের মধ্যে শেষ করো।
- সাবজেক্ট বা চ্যাপ্টারের নাম উল্লেখ করবে না।
- কোনো কোড ব্লক বা অতিরিক্ত শিরোনাম দিবে না।
- সহজ ভাষায় লিখবে যাতে ছাত্র সহজে বুঝতে পারে।

📌 উদাহরণ:
প্রশ্ন: জলের রাসায়নিক সংকেত কী? (অপশন: CO₂, HCl, NaCl, H₂O; সঠিক: H₂O)

✅ সঠিক উত্তর: D. H₂O — জলে ২টি হাইড্রোজেন ও ১টি অক্সিজেন পরমাণু থাকে।
• A. CO₂ → কার্বন ডাই-অক্সাইড, বাতাসে থাকা গ্যাস।
• B. HCl → হাইড্রোক্লোরিক অ্যাসিড।
• C. NaCl → সোডিয়াম ক্লোরাইড, অর্থাৎ খাবার লবণ।`
          },
          {
            role: 'user',
            content: `প্রশ্ন: ${question}
অপশন: ${options}
সঠিক উত্তর: ${correctAnswer}

মনে রাখবে: সরাসরি উত্তর দাও, কোনো চিন্তাভাবনা লিখবে না।`
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    // ✅ সব রকম থিংকিং টেক্সট ফিল্টার করা
    text = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*/gi, '')
      .replace(/Here'?s a thinking process[\s\S]*?(?=✅|•)/gi, '')
      .replace(/Let me think[\s\S]*?(?=✅|•)/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();

    return res.status(200).json({ explanation: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
