export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    console.log("API KEY EXISTS:", !!process.env.OPENROUTER_API_KEY);

    const { system, messages } = req.body;

    console.log("BODY:", req.body);

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            {
              role: 'system',
              content: system || 'You are a helpful assistant'
            },
            ...(messages || []).map(m => ({
              role: m.role === 'assistant'
                ? 'assistant'
                : 'user',
              content: m.content
            }))
          ],
          max_tokens: 1000
        })
      }
    );

    const data = await response.json();

    console.log("OPENROUTER RESPONSE:", data);

    if (!response.ok) {
      return res.status(response.status).json({
        error: data
      });
    }

    const text = data?.choices?.[0]?.message?.content;

    return res.status(200).json({
      text: text || "No response generated"
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
