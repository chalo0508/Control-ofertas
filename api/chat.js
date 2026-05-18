export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages, model: requestedModel } = req.body;

    // Validación básica
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages inválidos' });
    }

    // Modelo: usa el que envía el cliente o el que tenías por defecto
    const modelToUse = requestedModel || 'meta-llama/llama-3.3-70b-instruct:free';

    // Request a OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        // 'HTTP-Referer' y 'X-Title' comentados mientras debuggeas
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: system || 'Eres un asistente útil.' },
          ...messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          }))
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    // Convertir respuesta a JSON (y loguearla para debug)
    const data = await response.json();
    console.log('OPENROUTER RESPONSE STATUS:', response.status);
    console.log('OPENROUTER RESPONSE BODY:', JSON.stringify(data));

    // Mostrar errores reales de OpenRouter
    if (!response.ok) {
      console.error('OPENROUTER ERROR:', data);
      return res.status(response.status || 500).json({ error: data });
    }

    // Obtener texto generado (fallbacks)
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.output?.[0]?.content ||
      null;

    // Validar respuesta
    if (!text) {
      return res.status(500).json({ error: 'La IA no devolvió texto', debug: data });
    }

    // Respuesta exitosa
    return res.status(200).json({ text, model: modelToUse });

  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}
