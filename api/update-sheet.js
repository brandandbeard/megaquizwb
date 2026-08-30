// api/update-sheet.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { rowIndex, explanation, quizType } = req.body;

  if (rowIndex === undefined || !explanation) {
    return res.status(400).json({ error: 'rowIndex and explanation required' });
  }

  // তোমার দেওয়া URL গুলো এখানে বসানো আছে
  const SCRIPT_URLS = {
    'ssc': 'https://script.google.com/macros/s/AKfycby8cADzc2mMlr-3KoLSmQLsg8AhLA9ViXL5kzSyhLwaRfutZW5er3qTO1PFmY2w-4VmUQ/exec',
    'gk': 'https://script.google.com/macros/s/AKfycbw940Ugc3FsH1NFHCnjbEc7uivqqvwacUh_gQv_UKqXBXlJ7uhGa9ptTre5LROgEVwl/exec',
    'wbpsc': 'https://script.google.com/macros/s/AKfycbzWUjN4QuZtimLgtx-sd5oVqgoi4NhMVou3qkQwthV7AcL4DkAPycJ-YNjCnQh8w_h0/exec',
    'defence': 'https://script.google.com/macros/s/AKfycbz04QAu660SM9GVplMtomNL28ug7XE3xE1lYrkJm2y3DBylAvzRD4Xxh4vZiozNO-2l/exec'
  };

  const SCRIPT_URL = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rowIndex: rowIndex,
        explanation: explanation
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Sheet update error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to update sheet'
    });
  }
}
