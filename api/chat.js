export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const { system, messages } = req.body;

    // Validación básica
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Messages inválidos'
      });
    }

    // Request a OpenRouter
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://control-ofertas.vercel.app',
          'X-Title': 'Control Ofertas'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',

          messages: [
            {
              role: 'system',
              content: system || 'Eres un asistente útil.'
            },

            ...messages.map((m) => ({
              role:
                m.role === 'assistant'
                  ? 'assistant'
                  : 'user',

              content: m.content
            }))
          ],

          max_tokens: 1000,
          temperature: 0.7
        })
      }
    );

    // Convertir respuesta a JSON
    const data = await response.json();

    // Mostrar errores reales de OpenRouter
    if (!response.ok) {
      console.error('OPENROUTER ERROR:', data);

      return res.status(response.status).json({
        error: data
      });
    }

    // Obtener texto generado
    const text =
      data?.choices?.[0]?.message?.content;

    // Validar respuesta
    if (!text) {
      return res.status(500).json({
        error: 'La IA no devolvió texto',
        debug: data
      });
    }

    // Respuesta exitosa
    return res.status(200).json({
      text
    });

  } catch (error) {

    console.error('SERVER ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}
