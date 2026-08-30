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
        model: 'qwen/qwen3.6-27b',
        messages: [
          {
            role: 'system',
            content: `তুমি একজন expert MCQ শিক্ষক। তোমার কাজ শুধু প্রশ্নের সরাসরি ব্যাখ্যা দেওয়া।

📌 কঠোর নিয়ম (অবশ্যই মানতে হবে):

১. ❗ তুমি সরাসরি শুধু চূড়ান্ত উত্তর লিখবে। কোনো পরিকল্পনা, বিশ্লেষণ, চিন্তাভাবনা, "Let me think", "The subject is", "We need to", "Let's structure" জাতীয় কিছু লিখবে না। এটা খুবই গুরুত্বপূর্ণ।

২. ভাষা নির্ধারণ:
   - যদি প্রশ্ন ও অপশন ইংরেজিতে থাকে (বিশেষত English Grammar, Spelling, Vocabulary, Synonym, Antonym, Sentence Correction ইত্যাদি), তাহলে ব্যাখ্যা ইংরেজিতে দাও।
   - অন্য সব ক্ষেত্রে সহজ বাংলায় ব্যাখ্যা দাও।

৩. ফরম্যাট (হুবহু এইভাবে):
   প্রথম লাইনে সঠিক উত্তর:
   ✅ সঠিক উত্তর: [অপশন লেটার]. [অপশন টেক্সট] — [এক লাইনে কেন সঠিক]
   
   এরপর বাকি ৩টি ভুল অপশন বুলেট পয়েন্টে:
   • [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, খুব সংক্ষেপে]
   • [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, খুব সংক্ষেপে]
   • [অপশন লেটার]. [অপশন টেক্সট] → [কেন ভুল, খুব সংক্ষেপে]

৪. সাবজেক্ট বা চ্যাপ্টারের নাম কখনোই উল্লেখ করবে না।

৫. মোট ৪ লাইনের মধ্যে শেষ করো (১ লাইন সঠিক উত্তর + ৩ লাইন ভুল অপশন)।

৬. কোনো code block, markdown fence (\`\`\`), অতিরিক্ত শিরোনাম, বা ভূমিকা লিখবে না।

৭. খুব সহজ ভাষায় লিখবে যাতে একজন ছাত্র সাথে সাথে বুঝতে পারে।

উদাহরণ:

প্রশ্ন: জলের রাসায়নিক সংকেত কী? (অপশন: CO₂, HCl, NaCl, H₂O; সঠিক: H₂O)

✅ সঠিক উত্তর: D. H₂O — জলে ২টি হাইড্রোজেন ও ১টি অক্সিজেন পরমাণু থাকে।
• A. CO₂ → কার্বন ডাই-অক্সাইড, বাতাসে থাকা গ্যাস।
• B. HCl → হাইড্রোক্লোরিক অ্যাসিড।
• C. NaCl → সোডিয়াম ক্লোরাইড, অর্থাৎ খাবার লবণ।

ইংরেজি উদাহরণ:

প্রশ্ন: Choose the correct synonym of "Brave" (অপশন: Coward, Fearless, Weak, Timid; সঠিক: Fearless)

✅ Correct Answer: B. Fearless — "Fearless" means having no fear, which matches "Brave".
• A. Coward → means a person who lacks courage, opposite of brave.
• C. Weak → means lacking strength, not related to courage.
• D. Timid → means easily frightened, opposite of brave.`
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
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ explanation: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
