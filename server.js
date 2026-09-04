require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const verifySignature = require('./utils/verifySignature');
const verifyAmountBinding = require('./utils/verifyAmountBinding');
const verifyReplay = require('./utils/verifyReplay');
const store = require('./utils/store');
const fs = require('fs');
const path = require('path');
const { appendAuditEntry, getAuditLog, verifyAuditLogIntegrity } = require('./utils/auditLog');
const { explainIncident } = require('./utils/explainIncident');
const flagOrder = require('./utils/flagOrder');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Razorpay client for the auto-response action
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/webhook', express.raw({ type: 'application/json' }));

// ---------------------------------------------------------
// Dashboard API Endpoints
// ---------------------------------------------------------

app.get('/api/audit-log', (req, res) => {
  try {
    const logs = getAuditLog();
    // Return most recent first
    res.json(logs.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read audit log' });
  }
});

app.get('/api/metrics', (req, res) => {
  try {
    const resultsPath = path.join(__dirname, 'results', 'adversarial-suite-results.json');
    if (!fs.existsSync(resultsPath)) {
      return res.json({ metrics: null });
    }
    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read metrics' });
  }
});

app.get('/api/audit-log/verify', (req, res) => {
  try {
    // This is a REAL live check each time it's called
    const isValid = verifyAuditLogIntegrity();
    res.json({ valid: isValid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify audit log' });
  }
});

// ---------------------------------------------------------
// Webhook Pipeline
// ---------------------------------------------------------

// Helper function to handle failures: logs to audit, flags order, and returns 400
function handleFailure(res, eventId, orderId, reason, checkResults, details = {}) {
  console.error(`[SECURITY] Webhook rejected: ${reason}`);
  
  // Send 400 immediately so we don't block Razorpay's webhook delivery system
  res.status(400).send(reason);
  
  // Process the LLM explanation, Audit Log append, and API auto-response in the background
  (async () => {
    try {
      // 0. Generate human-readable explanation
      const explanation = await explainIncident(checkResults, reason, details);
      
      // 1. Audit Log
      appendAuditEntry({
        timestamp: new Date().toISOString(),
        eventId: eventId || 'unknown',
        checkResults,
        outcome: 'rejected',
        reason,
        explanation
      });
      
      // 2. Bounded Auto-Response (Flag the order)
      if (orderId) {
        try {
          await flagOrder(razorpay, orderId, reason);
          console.log(`[AUTO-RESPONSE] Successfully flagged order ${orderId} in Razorpay.`);
        } catch (err) {
          console.error(`[AUTO-RESPONSE FAILED] Failed to flag order ${orderId} in Razorpay:`, err.message);
          // We still appended the audit log above even if the API call fails
        }
      }
    } catch (err) {
      console.error("[BACKGROUND ERROR] Failed to process failure actions:", err);
    }
  })();
}

app.post('/webhook', async (req, res) => {
  console.log("--- Webhook Received ---");
  
  const signature = req.headers['x-razorpay-signature'];
  const eventId = req.headers['x-razorpay-event-id'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  let checkResults = {
    signature: false,
    amountBinding: false,
    replay: false
  };

  // 1. Webhook signature validity check
  const isValidSignature = verifySignature(req.body, signature, secret);
  if (!isValidSignature) {
    // Do not parse or act on an order ID from an unverified payload.
    return handleFailure(res, eventId, null, 'invalid_signature', checkResults);
  }
  checkResults.signature = true;
  console.log("[SUCCESS] Webhook signature verified successfully.");
  
  let payload;
  let orderId = null;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
    orderId = payload.payload?.payment?.entity?.order_id || null;
  } catch (err) {
    return handleFailure(res, eventId, null, 'invalid_json', checkResults);
  }

  // 2. Amount Binding Check
  if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity || !paymentEntity.order_id || paymentEntity.amount === undefined) {
      return handleFailure(res, eventId, orderId, 'malformed_payload', checkResults);
    }

    const bindingResult = verifyAmountBinding(paymentEntity.order_id, paymentEntity.amount, store);
    
    if (!bindingResult.valid) {
      const details = bindingResult.reason === 'amount_mismatch' 
        ? { expected: bindingResult.expected, actual: bindingResult.actual } 
        : {};
      return handleFailure(res, eventId, paymentEntity.order_id, bindingResult.reason, checkResults, details);
    }
    checkResults.amountBinding = true;
    console.log("[SUCCESS] Amount binding verified successfully.");
  }
  
  // 3. Replay Protection Check
  const replayResult = verifyReplay(eventId, store);
  if (!replayResult.valid) {
    return handleFailure(res, eventId, orderId, replayResult.reason, checkResults);
  }
  checkResults.replay = true;
  console.log("[SUCCESS] Replay check passed.");
  
  // -- ALL INTEGRITY CHECKS PASSED --
  
  if (eventId) {
    store.recordProcessedEvent(eventId);
    console.log(`[STORE] Recorded event ${eventId} as processed.`);
  }
  
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    eventId: eventId || 'unknown',
    checkResults,
    outcome: 'accepted',
    reason: 'all_checks_passed'
  });
  
  console.log(`[SUCCESS] Webhook fully verified and accepted!`);
  res.status(200).send("OK");
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

module.exports = app;
