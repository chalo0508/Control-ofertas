// pages/api/chat.js
export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages, model: requestedModel } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages inválidos' });
    }

    // Si el cliente envía un modelo explícito, lo usamos; si no, pedimos al endpoint de modelos el primero disponible
    let modelToUse = requestedModel || null;

    if (!modelToUse) {
      // Llamada interna al endpoint que lista modelos (puedes reemplazar por llamada directa a OpenRouter si prefieres)
      const modelsResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      });

      // Si la llamada local falla, intentamos directamente OpenRouter
      if (!modelsResp.ok) {
        // fallback: pedir directamente a OpenRouter
        const direct = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
        });
        const directData = await direct.json();
        const directModels = Array.isArray(directData) ? directData : (directData?.models || []);
        const freeDirect = directModels.filter(m => (m.id || '').toString().toLowerCase().includes(':free'));
        modelToUse = freeDirect.length > 0 ? freeDirect[0].id : (directModels[0]?.id || null);
      } else {
        const modelsData = await modelsResp.json();
        const chosen = modelsData?.chosen_model;
        modelToUse = chosen?.id || chosen?.model || null;
      }
    }

    // Si aún no hay modelo, devolver error claro
    if (!modelToUse) {
      return res.status(500).json({
        error: 'No se pudo determinar un modelo disponible. Revisa tu API key o la respuesta de /api/models.'
      });
    }

    // Construir payload para OpenRouter
    const payload = {
      model: modelToUse,
      messages: [
        { role: 'system', content: system || 'Eres un asistente útil.' },
        ...messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      ],
      max_tokens: 1000,
      temperature: 0.7
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // Opcionales: ajusta o elimina según tu entorno
        'HTTP-Referer': process.env.REFERER || 'https://control-ofertas.vercel.app',
        'X-Title': 'Control Ofertas'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OPENROUTER ERROR (chat):', data);
      return res.status(response.status).json({ error: data });
    }

    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || null;

    if (!text) {
      return res.status(500).json({ error: 'La IA no devolvió texto', debug: data });
    }

    return res.status(200).json({ text, model: modelToUse, raw: data });
  } catch (error) {
    console.error('SERVER ERROR (chat):', error);
    return res.status(500).json({ error: error.message });
  }
}


