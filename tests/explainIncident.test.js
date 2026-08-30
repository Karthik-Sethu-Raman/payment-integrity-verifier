const { explainIncident, getFallbackExplanation } = require('../utils/explainIncident');

describe('Incident Explainer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, FIREWORKS_API_KEY: 'test_key' };
    
    // Mock global fetch to always reject
    global.fetch = jest.fn(() => 
      Promise.reject(new Error("API Timeout"))
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('should fallback gracefully when LLM call fails (amount mismatch)', async () => {
    const checkResults = { signature: true, amountBinding: false, replay: false };
    const reason = 'amount_mismatch';
    const details = { expected: 50000, actual: 100 };
    
    const explanation = await explainIncident(checkResults, reason, details);
    
    expect(explanation).toBe(getFallbackExplanation(reason, details));
    expect(explanation).toContain('Amount mismatch');
    expect(explanation).toContain('500');
    expect(explanation).toContain('1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('should fallback gracefully when LLM call fails (invalid signature)', async () => {
    const checkResults = { signature: false, amountBinding: false, replay: false };
    const reason = 'invalid_signature';
    
    const explanation = await explainIncident(checkResults, reason);
    
    expect(explanation).toBe(getFallbackExplanation(reason));
    expect(explanation).toContain('Invalid signature');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
