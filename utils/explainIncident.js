// Key is read dynamically so it can be picked up during testing/reloads

function getFallbackExplanation(reason, details) {
  if (reason === 'invalid_signature') {
    return 'Invalid signature: Webhook cryptographic signature failed verification. It may be forged or tampered with.';
  }
  if (reason.startsWith('amount_mismatch')) {
    const expected = details?.expected || 'unknown';
    const actual = details?.actual || 'unknown';
    return `Amount mismatch: The payment amount (₹${actual/100}) does not match the original trusted order amount (₹${expected/100}).`;
  }
  if (reason.startsWith('replay_detected')) {
    return 'Replay detected: This webhook event ID has already been successfully processed. Duplicate rejected.';
  }
  return `Incident rejected: ${reason}`;
}

async function explainIncident(checkResults, reason, details) {
  const fallback = getFallbackExplanation(reason, details);
  const apiKey = process.env.FIREWORKS_API_KEY;
  
  if (!apiKey || apiKey === 'your_fireworks_api_key_here') {
    return fallback;
  }

  const prompt = `
You are a security assistant translating automated payment webhook integrity checks into a simple, 1-2 sentence plain-English explanation for a merchant dashboard. 

DO NOT make judgements on the payment. Just explain the technical failure that occurred based on these deterministic results:

Check Results: ${JSON.stringify(checkResults)}
Rejection Reason: ${reason}
Details: ${JSON.stringify(details || {})}

Provide ONLY the 1-2 sentence explanation, nothing else. No markdown.
`;

  // 5-second timeout via abort controller to prevent hanging the webhook pipeline
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'accounts/fireworks/models/deepseek-v4-flash-0731',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        reasoning_effort: "none"
      }),
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`Fireworks API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.trim();
    }
    
    return fallback;
  } catch (error) {
    console.error('[LLM ERROR] Failed to generate explanation, using fallback:', error.message);
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  explainIncident,
  getFallbackExplanation
};
