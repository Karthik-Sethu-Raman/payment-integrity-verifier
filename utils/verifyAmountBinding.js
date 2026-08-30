/**
 * Deterministically verifies the amount-binding integrity check.
 * 
 * @param {string} orderId - The Razorpay order_id claimed in the webhook.
 * @param {number} claimedAmount - The amount claimed in the webhook payload.
 * @param {object} trustedOrdersStore - The store module containing getTrustedOrder.
 * @returns {object} - Verification result object.
 */
function verifyAmountBinding(orderId, claimedAmount, trustedOrdersStore) {
  const trustedOrder = trustedOrdersStore.getTrustedOrder(orderId);
  
  if (!trustedOrder) {
    // We treat unknown orders as suspicious because they didn't originate from our system
    return { valid: false, reason: 'unknown_order' };
  }
  
  if (trustedOrder.amount !== claimedAmount) {
    return { 
      valid: false, 
      reason: 'amount_mismatch', 
      expected: trustedOrder.amount, 
      actual: claimedAmount 
    };
  }
  
  return { valid: true };
}

module.exports = verifyAmountBinding;
