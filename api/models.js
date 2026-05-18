// pages/api/models.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OPENROUTER MODELS ERROR:', data);
      return res.status(response.status).json({ error: data });
    }

    // data expected como array de modelos. Filtrar modelos que contengan ":free"
    const models = Array.isArray(data) ? data : (data?.models || []);
    const freeModels = models.filter(m => {
      const id = (m.id || '').toString().toLowerCase();
      return id.includes(':free') || id.includes('free');
    });

    // Elegir preferentemente el primer modelo con ":free", si no hay, tomar el primer modelo disponible
    const chosen = freeModels.length > 0 ? freeModels[0] : (models[0] || null);

    return res.status(200).json({
      total: models.length,
      free_count: freeModels.length,
      chosen_model: chosen,
      all_models: models
    });
  } catch (error) {
    console.error('SERVER ERROR (models):', error);
    return res.status(500).json({ error: error.message });
  }
}
