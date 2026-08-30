// api/quiz-ai.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, options, correctAnswer } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question required' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY;

  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ API key not set in Vercel env' });
  }

  const optionList = String(options || '')
    .split('|')
    .map(x => x.trim())
    .filter(Boolean);

  const letters = ['A', 'B', 'C', 'D'];

  const optionText = optionList
    .map((opt, i) => `${letters[i]}. ${opt}`)
    .join('\n');

  const correctIndex = optionList.findIndex(
    opt => opt.trim() === String(correctAnswer || '').trim()
  );

  const correctLetter = correctIndex >= 0 ? letters[correctIndex] : '';

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
            content: `You are an MCQ explanation generator.

Return ONLY the final explanation.
Do NOT write thinking, analysis, reasoning process, planning, notes, or hidden thoughts.
Do NOT use <think> tags.
Do NOT mention subject or chapter.

Language rule:
- If the question is English grammar, vocabulary, synonym, antonym, sentence correction, or other English-language question, explain in English.
- Otherwise explain in simple Bengali.

Output format must be exactly 4 lines:

✅ সঠিক উত্তর: [LETTER]. [ANSWER] — [one short reason]
• [LETTER]. [OPTION] → [why wrong]
• [LETTER]. [OPTION] → [why wrong]
• [LETTER]. [OPTION] → [why wrong]

For English questions use:
✅ Correct Answer: [LETTER]. [ANSWER] — [one short reason]
• [LETTER]. [OPTION] → [why wrong]
• [LETTER]. [OPTION] → [why wrong]
• [LETTER]. [OPTION] → [why wrong]

Keep it short and student-friendly.`
          },
          {
            role: 'user',
            content:
`Question:
${question}

Options:
${optionText}

Correct Answer:
${correctLetter ? correctLetter + '. ' : ''}${correctAnswer}

Now give only the final 4-line explanation.`
          }
        ],
        temperature: 0.2,
        max_tokens: 250
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err.error?.message || 'Groq API error'
      });
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    text = cleanExplanation(text);

    return res.status(200).json({ explanation: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function cleanExplanation(text) {
  if (!text) return '';

  let t = String(text);

  // Remove complete <think>...</think> blocks
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // If model started with <think> but did not close it, keep only from final answer marker
  const finalBangla = t.indexOf('✅ সঠিক উত্তর:');
  const finalEnglish = t.indexOf('✅ Correct Answer:');

  if (finalBangla !== -1 || finalEnglish !== -1) {
    const start = finalBangla !== -1
      ? finalBangla
      : finalEnglish;

    t = t.slice(start);
  }

  // Remove any remaining think tags
  t = t.replace(/<\/?think>/gi, '');

  // Remove common unwanted phrases if leaked
  t = t.replace(/Here's a thinking process:[\s\S]*?(?=✅)/gi, '');
  t = t.replace(/Analyze User Input:[\s\S]*?(?=✅)/gi, '');
  t = t.replace(/Check Constraints:[\s\S]*?(?=✅)/gi, '');
  t = t.replace(/Map Options[\s\S]*?(?=✅)/gi, '');

  // Clean markdown/code symbols
  t = t
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .trim();

  // Keep max 4 useful lines
  let lines = t
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const answerLineIndex = lines.findIndex(line =>
    line.startsWith('✅ সঠিক উত্তর:') || line.startsWith('✅ Correct Answer:')
  );

  if (answerLineIndex > 0) {
    lines = lines.slice(answerLineIndex);
  }

  lines = lines.slice(0, 4);

  return lines.join('\n').trim();
}
