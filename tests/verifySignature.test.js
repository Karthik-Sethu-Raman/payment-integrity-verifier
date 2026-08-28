const verifySignature = require('../utils/verifySignature');
const crypto = require('crypto');

describe('Webhook Signature Verification Check', () => {
  const secret = 'my_super_secret_123';
  const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { amount: 50000 } } } });
  
  // Calculate a valid signature for the test body
  const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  test('should pass with a valid signature', () => {
    const isValid = verifySignature(rawBody, validSignature, secret);
    expect(isValid).toBe(true);
  });

  test('should fail with a forged signature', () => {
    const forgedSignature = 'f'.repeat(64); // Completely fake hash
    const isValid = verifySignature(rawBody, forgedSignature, secret);
    expect(isValid).toBe(false);
  });

  test('should fail if signature is missing', () => {
    const isValid = verifySignature(rawBody, undefined, secret);
    expect(isValid).toBe(false);
  });

  test('should fail if body is tampered but signature is the same', () => {
    const tamperedBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { amount: 100 } } } }); // amount changed
    const isValid = verifySignature(tamperedBody, validSignature, secret);
    expect(isValid).toBe(false);
  });
});
