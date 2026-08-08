// api/quiz-ai.js
// এই ফাইলটা শুধু QUIZ এর জন্য — GROQ_API_KEY_2 ব্যবহার করে
// Existing ai.js (notes section) এ হাত দিও না!

export default async function handler(req, res) {
  // শুধু POST request accept করবে
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Second Groq API key (শুধু quiz এর জন্য)
  const apiKey = process.env.GROQ_API_KEY_2;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY_2 environment variable সেট করা নেই!' });
  }

  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'prompt পাঠাও!' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'তুমি একজন expert শিক্ষক। বাংলায় সহজ ভাষায় প্রশ্নের ব্যাখ্যা দাও। সঠিক উত্তর কেন সঠিক এবং বাকি অপশনগুলো কেন ভুল তা সংক্ষেপে বোঝাও।'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    return res.status(200).json({ success: true, text: text });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
