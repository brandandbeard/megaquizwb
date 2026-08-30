export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }
    const { system, user } = req.body;
    if (!system || !user) {
        return res.status(400).json({ error: 'system and user required' });
    }
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: err.error?.message || 'AI Error' });
        }
        const data = await response.json();
        return res.status(200).json({ text: data.choices?.[0]?.message?.content || '' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
