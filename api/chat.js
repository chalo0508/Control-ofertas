export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages } = req.body;

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { maxOutputTokens: 1000 }
        })
      }
    );

    const data = await response.json();
    
    // Devolver respuesta completa para debug
    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({ text: 'DEBUG: ' + JSON.stringify(data) });
    }
    
    const text = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ text: 'ERROR: ' + error.message });
  }
}
