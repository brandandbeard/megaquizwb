// api/questioncheck.js
// AI-based question checker - underline, grammar, answer key verification, LaTeX/HTML support

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

  // ✅ Already AI-checked? Skip to save quota
  if (alreadyChecked) {
    return res.status(200).json({ 
      needsCorrection: false, 
      reason: 'already-checked',
      message: 'Already verified'
    });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_2;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY_2 not set in Vercel env' });
  }

  // ✅ All class URLs (competitive + class 5-10)
  const SCRIPT_URLS = {
    // Competitive exams (competitive.html)
    'ssc': 'https://script.google.com/macros/s/AKfycby8cADzc2mMlr-3KoLSmQLsg8AhLA9ViXL5kzSyhLwaRfutZW5er3qTO1PFmY2w-4VmUQ/exec',
    'gk': 'https://script.google.com/macros/s/AKfycbw940Ugc3FsH1NFHCnjbEc7uivqqvwacUh_gQv_UKqXBXlJ7uhGa9ptTre5LROgEVwl/exec',
    'wbpsc': 'https://script.google.com/macros/s/AKfycbzWUjN4QuZtimLgtx-sd5oVqgoi4NhMVou3qkQwthV7AcL4DkAPycJ-YNjCnQh8w_h0/exec',
    'defence': 'https://script.google.com/macros/s/AKfycbz04QAu660SM9GVplMtomNL28ug7XE3xE1lYrkJm2y3DBylAvzRD4Xxh4vZiozNO-2l/exec',
    // Class 5-10 (quiz.html)
    'class5': 'https://script.google.com/macros/s/AKfycbwtJzw0xGfY-3p2KY3z-vf_d5CVdR_alfIX4B5S9QEFi1tYtrb6_MtzX9OSiQ6-L91w/exec',
    'class6': 'https://script.google.com/macros/s/AKfycbxmUCjeYIu7Dikfnbl2LmZoeplLS0iuLWEsvGTx0jYi4i1uK3WMEF3Bqqmf72teEjgI/exec',
    'class7': 'https://script.google.com/macros/s/AKfycbwoKkn_uJRnjsccqTpROptSkFxjMIvi-S9UlX6qZaYeA7N0nWoL-FZJILhqFFmKMjjKhQ/exec',
    'class8': 'https://script.google.com/macros/s/AKfycbyS4bWgeppQwuHX52MY1DGMENHSz-hIqMClHXz7VQIcYi221vG_vBvcWUenUqupe-bmGg/exec',
    'class9': 'https://script.google.com/macros/s/AKfycbyiSmFFhax_D_t0jnRgshGSzPP6YvMdx5xY4_G-lHiRF12wYkUEiZG6ren1LXNh3IoD/exec',
    'class10': 'https://script.google.com/macros/s/AKfycbwB5PT3N8nUByW5GVv9--JenYdRm7rKTixkLe_XYmKkavIKlvoVrMLIgAXgmAiS3cUSOQ/exec'
  };

  try {
    // ═══════════════════════════════════════════════════════
    // STEP 1: AI call to check & correct question
    // ═══════════════════════════════════════════════════════
    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: `তুমি একজন expert question checker ও শিক্ষক। তোমার কাজ প্রতিটি MCQ প্রশ্ন carefully check করা ও প্রয়োজনে fix করা।

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
তোমার প্রধান কাজ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **UNDERLINE DETECTION** (সবচেয়ে গুরুত্বপূর্ণ):
   - English grammar question এ যদি লেখা থাকে "underlined word", "underlined segment", "underlined portion" — তাহলে সেই sentence এর মধ্যে কোন word/phrase টা underlined হওয়া উচিত সেটা detect করো
   - উদাহরণ: 
     Input: "He gave a haughty consent without honouring him with a single word."
     Question mentions: "underlined word"
     Output: "He gave a <u>haughty</u> consent without honouring him with a single word."
   
   - Common patterns detect করো:
     * "ANTONYM of the underlined word" → underline the target word
     * "SYNONYM of the underlined word" → underline the target word  
     * "substitute the underlined segment" → underline the phrase
     * "replace the underlined part" → underline the part
     * "underlined portion contains error" → underline the erroneous part

2️⃣ **GRAMMAR & SPELLING**:
   - Obvious typos fix করো
   - Grammatical errors থাকলে correct করো
   - কিন্তু original meaning পরিবর্তন করো না

3️⃣ **ANSWER KEY VERIFICATION**:
   - Current answer key টা সত্যিই সঠিক কিনা verify করো
   - ভুল হলে correct answer index (0-3) দাও
   - শুধু যদি তুমি 100% sure হও যে answer key ভুল, তাহলেই change করো

4️⃣ **MATH/CHEMISTRY/PHYSICS FORMATTING**:
   - সমীকরণগুলো LaTeX format এ দাও: \\(x^2 + y^2 = z^2\\)
   - Fractions: \\(\\frac{a}{b}\\)
   - Chemical formulas: \\(H_2O\\), \\(CO_2\\), \\(NaCl\\)
   - Subscripts/superscripts: \\(Fe^{2+}\\), \\(x_1\\)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use <u>text</u> for underlined segments
- Use <b>text</b> for bold emphasis (sparingly)
- Use <i>text</i> for italics (book names, foreign words)
- Use LaTeX \\(...\\) for math/science expressions
- HTML tags only use করো যেগুলো listed আছে

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT (strict JSON only, no markdown, no \`\`\`):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "needsCorrection": true or false,
  "correctedQuestion": "formatted question with <u>, <b>, LaTeX",
  "correctedOptions": ["option1", "option2", "option3", "option4"],
  "correctAnswer": 0 or 1 or 2 or 3,
  "aiExplanation": "Bengali এ সংক্ষিপ্ত ব্যাখ্যা — কেন correct answer টাই সঠিক এবং কী কী fix করা হলো"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- যদি question perfect থাকে (no underline needed, no errors, answer correct), return: {"needsCorrection": false}
- শুধু valid JSON return করো, কোনো markdown fence বা extra text না
- aiExplanation বাংলায় লেখো, সহজ ভাষায়, ৩-৪ লাইনের মধ্যে
- original meaning পরিবর্তন করো না
- option order change করো না, শুধু format fix করো
- Underline detect করার সময় question text carefully পড়ো — কোন word টা underlined হওয়া উচিত সেটা বোঝার চেষ্টা করো`
          },
          {
            role: 'user',
            content: `এই প্রশ্নটি check করো এবং JSON format এ উত্তর দাও:

প্রশ্ন: ${question}

অপশন:
A. ${options[0] || ''}
B. ${options[1] || ''}
C. ${options[2] || ''}
D. ${options[3] || ''}

বর্তমান answer key index: ${correctAnswer} (A=0, B=1, C=2, D=3)
বিষয়: ${subject || 'General'}
অধ্যায়: ${chapter || 'General'}

Return JSON only.`
          }
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.json().catch(() => ({}));
      return res.status(aiResponse.status).json({ 
        error: err.error?.message || 'AI API error',
        needsCorrection: false
      });
    }

    const aiData = await aiResponse.json();
    let parsed;
    try {
      const rawContent = aiData.choices?.[0]?.message?.content || '{}';
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      return res.status(500).json({ 
        error: 'Invalid AI response format',
        needsCorrection: false
      });
    }

    // ═══════════════════════════════════════════════════════
    // STEP 2: No correction needed — just mark as checked
    // ═══════════════════════════════════════════════════════
    if (!parsed.needsCorrection) {
      // Mark as checked in sheet even if no correction needed
      if (rowIndex && quizType) {
        const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];
        try {
          await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rowIndex: rowIndex,
              type: 'correction',
              aiExplanation: '✅ প্রশ্নটি সঠিক আছে, কোনো correction প্রয়োজন নেই।'
            })
          });
        } catch (e) { 
          console.warn('Mark as checked failed:', e); 
        }
      }
      return res.status(200).json({ 
        needsCorrection: false,
        message: 'Question is perfect'
      });
    }

    // ═══════════════════════════════════════════════════════
    // STEP 3: Correction needed — update Google Sheet
    // ═══════════════════════════════════════════════════════
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
            correctAnswer: parsed.correctAnswer !== undefined ? parsed.correctAnswer : correctAnswer,
            aiExplanation: parsed.aiExplanation || ''
          })
        });
        sheetUpdated = sheetRes.ok;
        console.log(`✅ Sheet updated for row ${rowIndex} (${quizType})`);
      } catch (e) {
        console.warn('Sheet update failed:', e);
      }
    }

    // Return corrected data to frontend
    return res.status(200).json({
      needsCorrection: true,
      correctedQuestion: parsed.correctedQuestion || question,
      correctedOptions: parsed.correctedOptions || options,
      correctAnswer: parsed.correctAnswer !== undefined ? parsed.correctAnswer : correctAnswer,
      aiExplanation: parsed.aiExplanation || '',
      sheetUpdated: sheetUpdated
    });

  } catch (e) {
    console.error('Question check error:', e);
    return res.status(500).json({ 
      error: e.message,
      needsCorrection: false
    });
  }
}
