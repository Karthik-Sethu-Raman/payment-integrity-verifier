/**
 * Applies the bounded, deterministic Razorpay response for a verified order.
 */
async function flagOrder(razorpay, orderId, reason) {
  return razorpay.orders.edit(orderId, {
    notes: {
      flagged: 'true',
      flagged_reason: reason,
      flagged_at: new Date().toISOString()
    }
  });
}

module.exports = flagOrder;
