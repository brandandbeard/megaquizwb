// api/questionfix.js
// শুধু formatting fix - underline, LaTeX, HTML, answer verification
// আলাদা API key (GROQ_API_KEY_3) ব্যবহার করে quota split করে

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { 
    question, 
    options, 
    correctAnswer, 
    subject, 
    chapter, 
    rowIndex, 
    quizType, 
    alreadyChecked 
  } = req.body;

  if (!question || !options) {
    return res.status(400).json({ error: 'question and options required' });
  }

  if (alreadyChecked) {
    return res.status(200).json({ 
      needsCorrection: false, 
      reason: 'already-checked'
    });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_3;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY_3 not set in Vercel env' });
  }

  const SCRIPT_URLS = {
    'ssc': 'https://script.google.com/macros/s/AKfycby8cADzc2mMlr-3KoLSmQLsg8AhLA9ViXL5kzSyhLwaRfutZW5er3qTO1PFmY2w-4VmUQ/exec',
    'gk': 'https://script.google.com/macros/s/AKfycbw940Ugc3FsH1NFHCnjbEc7uivqqvwacUh_gQv_UKqXBXlJ7uhGa9ptTre5LROgEVwl/exec',
    'wbpsc': 'https://script.google.com/macros/s/AKfycbzWUjN4QuZtimLgtx-sd5oVqgoi4NhMVou3qkQwthV7AcL4DkAPycJ-YNjCnQh8w_h0/exec',
    'defence': 'https://script.google.com/macros/s/AKfycbz04QAu660SM9GVplMtomNL28ug7XE3xE1lYrkJm2y3DBylAvzRD4Xxh4vZiozNO-2l/exec',
    'class5': 'https://script.google.com/macros/s/AKfycbwtJzw0xGfY-3p2KY3z-vf_d5CVdR_alfIX4B5S9QEFi1tYtrb6_MtzX9OSiQ6-L91w/exec',
    'class6': 'https://script.google.com/macros/s/AKfycbxmUCjeYIu7Dikfnbl2LmZoeplLS0iuLWEsvGTx0jYi4i1uK3WMEF3Bqqmf72teEjgI/exec',
    'class7': 'https://script.google.com/macros/s/AKfycbwoKkn_uJRnjsccqTpROptSkFxjMIvi-S9UlX6qZaYeA7N0nWoL-FZJILhqFFmKMjjKhQ/exec',
    'class8': 'https://script.google.com/macros/s/AKfycbyS4bWgeppQwuHX52MY1DGMENHSz-hIqMClHXz7VQIcYi221vG_vBvcWUenUqupe-bmGg/exec',
    'class9': 'https://script.google.com/macros/s/AKfycbyiSmFFhax_D_t0jnRgshGSzPP6YvMdx5xY4_G-lHiRF12wYkUEiZG6ren1LXNh3IoD/exec',
    'class10': 'https://script.google.com/macros/s/AKfycbwB5PT3N8nUByW5GVv9--JenYdRm7rKTixkLe_XYmKkavIKlvoVrMLIgAXgmAiS3cUSOQ/exec'
  };

  const systemPrompt = `You are an expert question formatter. Your ONLY job is to fix the formatting of MCQ questions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASKS (formatting ONLY - NO explanations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **UNDERLINE DETECTION** (HIGHEST PRIORITY):
   When question mentions "underlined word/segment/portion":
   - "ANTONYM of the underlined word" → underline the target word
   - "SYNONYM of the underlined word" → underline the target word
   - "substitute the underlined segment" → underline the phrase
   - "replace the underlined part" → underline the part
   
   Example:
   Input: "He gave a haughty consent"
   Output: "He gave a <u>haughty</u> consent"

2️⃣ **MATH/CHEMISTRY/PHYSICS LATEX**:
   - \\(x^2 + y^2 = z^2\\)
   - \\(\\frac{a}{b}\\)
   - \\(H_2O\\), \\(CO_2\\), \\(NaCl\\)
   - \\(Fe^{2+}\\), \\(x_1\\)

3️⃣ **ANSWER KEY VERIFICATION**:
   Verify if current answer (0-3) is correct. Fix only if 100% sure.

4️⃣ **TYPO FIX**:
   Fix obvious spelling/grammar errors.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HTML TAGS ALLOWED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- <u>text</u> for underlined
- <b>text</b> for bold
- <i>text</i> for italics
- LaTeX \\(...\\) for math/chemistry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT (STRICT JSON, no markdown):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "needsCorrection": true/false,
  "correctedQuestion": "formatted question",
  "correctedOptions": ["opt1", "opt2", "opt3", "opt4"],
  "correctAnswer": 0/1/2/3
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Return ONLY valid JSON
- NO explanation, NO commentary
- NO markdown code blocks
- If question is perfect, return {"needsCorrection": false}
- Preserve original meaning exactly
- Don't change option order`;

  const userPrompt = `Fix formatting of this MCQ:

Question: ${question}

Options:
A. ${options[0] || ''}
B. ${options[1] || ''}
C. ${options[2] || ''}
D. ${options[3] || ''}

Current answer index: ${correctAnswer}

Return JSON only.`;

  // ═══════════════════════════════════════════════════════
  // Helper: Call AI with hybrid approach
  // ═══════════════════════════════════════════════════════
  async function callAI(model) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) return null;
      const data = await response.json();
      return JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch (e) {
      return null;
    }
  }

  function mentionsUnderline(q) {
    const l = q.toLowerCase();
    return l.includes('underlined') || l.includes('underline');
  }

  function hasUnderline(p) {
    return p?.correctedQuestion?.includes('<u>') && p?.correctedQuestion?.includes('</u>');
  }

  try {
    // STEP 1: Try Qwen3 first (fast)
    let parsed = await callAI('qwen/qwen3.6-27b');
    let usedModel = 'qwen/qwen3.6-27b';

    // STEP 2: If underline needed but missing, fallback to GPT-oss
    if (mentionsUnderline(question) && parsed && !hasUnderline(parsed)) {
      const gptParsed = await callAI('openai/gpt-oss-120b');
      if (gptParsed) {
        parsed = gptParsed;
        usedModel = 'openai/gpt-oss-120b';
      }
    }

    if (!parsed) {
      return res.status(500).json({ error: 'AI failed', needsCorrection: false });
    }

    // STEP 3: No correction needed
    if (!parsed.needsCorrection) {
      if (rowIndex && quizType) {
        const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];
        try {
          await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rowIndex: rowIndex,
              type: 'correction'
            })
          });
        } catch (e) { console.warn('Sheet mark failed:', e); }
      }
      return res.status(200).json({ 
        needsCorrection: false,
        usedModel: usedModel
      });
    }

    // STEP 4: Correction needed — update sheet
    let sheetUpdated = false;
    if (rowIndex && quizType) {
      const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];
      try {
        const sheetRes = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIndex: rowIndex,
            type: 'correction',
            question: parsed.correctedQuestion || '',
            options: parsed.correctedOptions || options,
            correctAnswer: parsed.correctAnswer !== undefined ? parsed.correctAnswer : correctAnswer
          })
        });
        sheetUpdated = sheetRes.ok;
      } catch (e) {
        console.warn('Sheet update failed:', e);
      }
    }

    return res.status(200).json({
      needsCorrection: true,
      correctedQuestion: parsed.correctedQuestion || question,
      correctedOptions: parsed.correctedOptions || options,
      correctAnswer: parsed.correctAnswer !== undefined ? parsed.correctAnswer : correctAnswer,
      sheetUpdated: sheetUpdated,
      usedModel: usedModel
    });

  } catch (e) {
    return res.status(500).json({ error: e.message, needsCorrection: false });
  }
}
