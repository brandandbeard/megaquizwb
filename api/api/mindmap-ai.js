// api/mindmap-ai.js
// ===== Dedicated AI endpoint ONLY for Mind Map generation =====
// api/ai.js কে touch করে না — ওটা আগের মতোই quiz এর জন্য চলবে।
// Mindmap এর জন্য আলাদা settings: বড় max_tokens (JSON truncate হবে না) + JSON mode

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const { system, user } = req.body || {};
    if (!user) {
        return res.status(400).json({ error: 'user prompt required' });
    }

    // Mindmap-specific default system prompt (client চাইলে নিজেরটা পাঠাতে পারবে)
    const SYS = system || `You are a mind-map generator. Reply with ONLY valid JSON (no markdown, no code fences).
Schema: {"id":"root","text":"Title","children":[{"id":"b1","text":"branch","children":[{"id":"b1a","text":"leaf","children":[]}]}]}
Rules: 4-8 branches, 2-6 leaves per branch, max 3 levels, each text under 60 characters, include years/dates when relevant.`;

    const baseBody = {
        model: 'openai/gpt-oss-120b',
        messages: [
            { role: 'system', content: SYS },
            { role: 'user', content: user }
        ],
        temperature: 0.35,
        max_tokens: 8192   // ai.js এ 1024 ছিল — সেজন্য JSON কেটে যেত। এখন 8x বড়
    };

    const call = async (useJsonMode) => {
        const payload = useJsonMode
            ? { ...baseBody, response_format: { type: 'json_object' } }  // guaranteed valid JSON
            : baseBody;
        return fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
            },
            body: JSON.stringify(payload)
        });
    };

    try {
        // 1st try: JSON mode (strict valid JSON)
        let response = await call(true);
        // Fallback: যদি model JSON mode support না করে
        if (!response.ok) response = await call(false);

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: err.error?.message || 'AI Error' });
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        return res.status(200).json({ text });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
