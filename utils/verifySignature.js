const crypto = require('crypto');

/**
 * Deterministically verifies the Razorpay webhook signature.
 * 
 * @param {string|Buffer} rawBody - The raw, unparsed request body string or buffer.
 * @param {string} signature - The X-Razorpay-Signature header value.
 * @param {string} secret - The webhook secret.
 * @returns {boolean} - True if signature is valid, false otherwise.
 */
function verifySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody.toString('utf8'))
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks.
  if (expectedSignature.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
}

module.exports = verifySignature;
