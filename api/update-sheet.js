// api/update-sheet.js
// এটি AI-generated explanation Google Sheet-এ update করবে

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { rowIndex, explanation, sheetUrl } = req.body;

  if (rowIndex === undefined || !explanation) {
    return res.status(400).json({ error: 'rowIndex and explanation required' });
  }

  // Google Apps Script Web App URL (নিচে setup দেওয়া আছে)
  const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({ error: 'GOOGLE_APPS_SCRIPT_URL not set' });
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
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
