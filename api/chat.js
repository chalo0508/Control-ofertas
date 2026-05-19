export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages } = req.body;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openrouter/owl-alpha',
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
        ],
        max_tokens: 1000
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(200).json({ text: 'DEBUG: ' + JSON.stringify(data).substring(0, 300) });
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ text: 'ERROR: ' + error.message });
  }
}
