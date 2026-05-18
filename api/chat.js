export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { system, messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages inválidos' });

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada' });
  }

  // Lista de modelos a intentar (ordenada por preferencia)
  const candidateModels = [
    'openai/gpt-3.5-turbo',
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free'
  ];

  const payloadBase = {
    messages: [
      { role: 'system', content: system || 'Eres un asistente útil.' },
      ...messages
    ],
    max_tokens: 500,
    temperature: 0.7
  };

  for (const modelId of candidateModels) {
    const payload = { ...payloadBase, model: modelId };
    try {
      console.log('Intentando modelo:', modelId);
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const text = await resp.text();
      console.log('RESP STATUS', resp.status, 'MODEL', modelId, 'BODY', text);

      // Si el proveedor dice que no hay endpoints para ese modelo, probar el siguiente
      if (resp.status === 404 && text.includes('No endpoints found')) {
        continue;
      }

      // Si rate limit, devolver info para que el cliente lo maneje o reintente
      if (resp.status === 429) {
        return res.status(429).json({ error: 'Rate limited upstream', detail: text });
      }

      // Si OK, parsear y devolver
      if (resp.ok) {
        try {
          const data = JSON.parse(text);
          const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || null;
          if (!content) return res.status(500).json({ error: 'No text returned', debug: data });
          return res.status(200).json({ text: content, model: modelId });
        } catch (e) {
          return res.status(200).json({ raw: text, model: modelId });
        }
      }

      // Otros errores: devolverlos
      return res.status(resp.status || 500).json({ error: 'Upstream error', detail: text });

    } catch (err) {
      console.error('Fetch error con modelo', modelId, err?.message || err);
      // Intentar siguiente modelo
      continue;
    }
  }

  return res.status(404).json({ error: 'No endpoints found for any candidate models' });
}
