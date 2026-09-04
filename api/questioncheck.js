// api/questioncheck.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, options, correctAnswer, subject, chapter, rowIndex, quizType } = req.body;

  if (!question || !options) {
    return res.status(400).json({ error: 'question and options required' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_2;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY_2 not set' });
  }

  try {
    // Step 1: AI দিয়ে question check করো
    const checkResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are an expert question checker. Your task:

1. Check if the question needs underlined segments (especially English grammar questions)
2. Identify grammatical errors or typos
3. Verify if the answer key is correct
4. Return corrected question with HTML formatting

Rules:
- Use <u>underline text</u> for underlined segments
- Use <b>bold text</b> for emphasis
- For math/chemistry, use LaTeX: \(x^2\) or \(\frac{a}{b}\)
- Fix obvious typos
- If answer key seems wrong, suggest the correct one
- Return JSON format:
{
  "needsCorrection": true/false,
  "correctedQuestion": "corrected question with HTML/LaTeX",
  "correctedOptions": ["opt1", "opt2", "opt3", "opt4"],
  "correctAnswer": 0/1/2/3,
  "explanation": "why this is correct"
}

Example:
Input: "Do not later about the street"
Output: {
  "needsCorrection": true,
  "correctedQuestion": "Do not <u>later</u> about the street.",
  "correctedOptions": ["latter about", "litre about", "litter about", "loiter around"],
  "correctAnswer": 3,
  "explanation": "'Loiter around' is the correct phrase meaning to wander without purpose."
}`
          },
          {
            role: 'user',
            content: `Question: ${question}
Options: ${JSON.stringify(options)}
Correct Answer Index: ${correctAnswer}
Subject: ${subject || 'General'}
Chapter: ${chapter || 'General'}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })
    });

    if (!checkResponse.ok) {
      const err = await checkResponse.json().catch(() => ({}));
      return res.status(checkResponse.status).json({ error: err.error?.message || 'AI check failed' });
    }

    const checkData = await checkResponse.json();
    const aiResponse = JSON.parse(checkData.choices?.[0]?.message?.content || '{}');

    if (!aiResponse.needsCorrection) {
      return res.status(200).json({ 
        needsCorrection: false,
        message: 'Question is correct'
      });
    }

    // Step 2: Google Sheet update করো
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

    const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['class6'];

    let sheetUpdateSuccess = false;
    if (rowIndex) {
      try {
        const sheetResponse = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIndex: rowIndex,
            question: aiResponse.correctedQuestion,
            options: aiResponse.correctedOptions,
            correctAnswer: aiResponse.correctAnswer,
            explanation: aiResponse.explanation
          })
        });
        sheetUpdateSuccess = sheetResponse.ok;
      } catch (sheetError) {
        console.warn('Sheet update failed:', sheetError);
      }
    }

    return res.status(200).json({
      needsCorrection: true,
      correctedQuestion: aiResponse.correctedQuestion,
      correctedOptions: aiResponse.correctedOptions,
      correctAnswer: aiResponse.correctAnswer,
      explanation: aiResponse.explanation,
      sheetUpdated: sheetUpdateSuccess
    });

  } catch (e) {
    console.error('Question check error:', e);
    return res.status(500).json({ error: e.message });
  }
}
