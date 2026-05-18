export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { system, messages, model: requestedModel } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages inválidos' });
    }

    // Comprobar que la API key existe en el entorno
    const apiKeyPresent = !!process.env.OPENROUTER_API_KEY;
    console.log('OPENROUTER_API_KEY_PRESENT:', apiKeyPresent);
    if (!apiKeyPresent) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada en el servidor' });
    }

    const modelToUse = requestedModel || 'meta-llama/llama-3.3-70b-instruct:free';

    const payload = {
      model: modelToUse,
      messages: [
        { role: 'system', content: system || 'Eres un asistente útil.' },
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      ],
      max_tokens: 1000,
      temperature: 0.7
    };

    // Reintentos simples para 429
    const maxAttempts = 4;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      attempt++;
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);
      console.log('OPENROUTER RESPONSE STATUS:', response.status);
      console.log('OPENROUTER RESPONSE BODY:', JSON.stringify(data));

      if (response.ok) {
        const text =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.text ||
          data?.output?.[0]?.content ||
          null;
        if (!text) return res.status(500).json({ error: 'La IA no devolvió texto', debug: data });
        return res.status(200).json({ text, model: modelToUse });
      }

      // Si es rate limit, esperar y reintentar
      if (response.status === 429) {
        const retryAfter = data?.error?.metadata?.retry_after_seconds || Math.min(2 * attempt, 10);
        await new Promise(r => setTimeout(r, Math.round(retryAfter * 1000)));
        lastError = data || { status: response.status };
        continue;
      }

      // Otros errores: devolverlos
      return res.status(response.status || 500).json({ error: data || 'Error desconocido' });
    }

    return res.status(429).json({ error: 'Máximo de reintentos alcanzado', lastError });

  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}
