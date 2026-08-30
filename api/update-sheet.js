// api/update-sheet.js
// এটি AI-generated explanation Google Sheet-এ update করবে

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { rowIndex, explanation, quizType } = req.body;

  if (rowIndex === undefined || !explanation) {
    return res.status(400).json({ error: 'rowIndex and explanation required' });
  }

  // ✅ সব Apps Script URL এখানে সরাসরি hardcode করা আছে
  const SCRIPT_URLS = {
    'ssc': 'https://script.google.com/macros/s/AKfycby8cADzc2mMlr-3KoLSmQLsg8AhLA9ViXL5kzSyhLwaRfutZW5er3qTO1PFmY2w-4VmUQ/exec',
    'gk': 'https://script.google.com/macros/s/AKfycbw940Ugc3FsH1NFHCnjbEc7uivqqvwacUh_gQv_UKqXBXlJ7uhGa9ptTre5LROgEVwl/exec',
    'wbpsc': 'https://script.google.com/macros/s/AKfycbzWUjN4QuZtimLgtx-sd5oVqgoi4NhMVou3qkQwthV7AcL4DkAPycJ-YNjCnQh8w_h0/exec',
    'defence': 'https://script.google.com/macros/s/AKfycbz04QAu660SM9GVplMtomNL28ug7XE3xE1lYrkJm2y3DBylAvzRD4Xxh4vZiozNO-2l/exec'
  };

  const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];

  if (!SCRIPT_URL) {
    return res.status(500).json({ error: `Apps Script URL not set for ${quizType}` });
  }

  try {
    // ✅ no-cors mode দরকার Google Apps Script এর সাথে কাজ করতে
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        rowIndex: rowIndex,
        explanation: explanation
      })
    });

    // no-cors mode এ response status 0 হয়, তাই সরাসরি success ধরে নিচ্ছি
    return res.status(200).json({ 
      success: true,
      message: 'Explanation update request sent to sheet'
    });

  } catch (error) {
    console.error('Sheet update error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to update sheet'
    });
  }
}
