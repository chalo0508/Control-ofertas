// pages/api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages, model: requestedModel } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages inválidos' });
    }

    // Si el cliente envía un modelo explícito, lo usamos directamente
    let modelToUse = requestedModel || null;

    // Si no se envió modelo, consultamos OpenRouter para elegir uno disponible
    if (!modelToUse) {
      const modelsResp = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
      });

      const modelsData = await modelsResp.json();

      if (!modelsResp.ok) {
        console.error('OPENROUTER MODELS ERROR:', modelsData);
        return res.status(modelsResp.status || 500).json({ error: modelsData });
      }

      const models = Array.isArray(modelsData) ? modelsData : (modelsData.models || []);
      // Buscar primer modelo que contenga ':free' (si existe)
      const freeModel = models.find(m => (m.id || '').toString().toLowerCase().includes(':free'));
      modelToUse = freeModel?.id || models[0]?.id || null;
    }

    if (!modelToUse) {
      return res.status(500).json({
        error: 'No se pudo determinar un modelo disponible. Revisa tu API key o la respuesta de OpenRouter.'
      });
    }

    // Construir mensajes para el endpoint de chat
    const chatMessages = [
      { role: 'system', content: system || 'Eres un asistente útil.' },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const payload = {
      model: modelToUse,
      messages: chatMessages,
      max_tokens: 1000,
      temperature: 0.7
    };

    const chatResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const chatData = await chatResp.json();

    if (!chatResp.ok) {
      console.error('OPENROUTER CHAT ERROR:', chatData);
      return res.status(chatResp.status || 500).json({ error: chatData });
    }

    const text = chatData?.choices?.[0]?.message?.content || chatData?.choices?.[0]?.text || null;

    if (!text) {
      return res.status(500).json({ error: 'La IA no devolvió texto', debug: chatData });
    }

    return res.status(200).json({ text, model: modelToUse, raw: chatData });
  } catch (err) {
    console.error('SERVER ERROR (chat):', err);
    return res.status(500).json({ error: err.message });
  }
}

