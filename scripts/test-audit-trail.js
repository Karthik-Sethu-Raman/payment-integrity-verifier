require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('../utils/store');
const { getAuditLog, verifyAuditLogIntegrity } = require('../utils/auditLog');
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sendWebhook(name, orderId, eventId, amount, signatureOverride) {
  const payload = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          order_id: orderId,
          amount: amount,
          status: "captured"
        }
      }
    }
  });

  const signature = signatureOverride || crypto.createHmac('sha256', secret).update(payload).digest('hex');

  console.log(`\n--- Sending ${name} ---`);
  try {
    const response = await fetch('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': eventId,
        'Request-Id': eventId
      },
      body: payload
    });
    console.log(`Status: ${response.status}`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const orderId = 'order_AUDIT123';
  const trueAmount = 50000;
  
  // Ensure fresh audit log for test output clarity
  const logFilePath = path.join(__dirname, '../audit_log.jsonl');
  if (fs.existsSync(logFilePath)) {
    fs.unlinkSync(logFilePath);
  }
  
  // Setup
  store.recordTrustedOrder(orderId, trueAmount, "INR");
  
  // 1. Sends a mix of webhooks
  // Fully valid
  await sendWebhook('Valid Webhook', orderId, `evt_valid_${Date.now()}`, trueAmount);
  
  // Forged signature
  await sendWebhook('Forged Signature Webhook', orderId, `evt_forged_${Date.now()}`, trueAmount, 'a'.repeat(64));
  
  // Amount mismatch
  await sendWebhook('Amount Mismatch Webhook', orderId, `evt_mismatch_${Date.now()}`, 100);
  
  // Replayed
  const replayEventId = `evt_replay_${Date.now()}`;
  await sendWebhook('Valid for Replay Setup', orderId, replayEventId, trueAmount);
  await sendWebhook('Replayed Webhook', orderId, replayEventId, trueAmount);
  
  // Wait for background processing (poll for 5 entries)
  console.log('\n--- Waiting for background LLM and Audit tasks ---');
  let logs = [];
  for (let i = 0; i < 20; i++) {
    logs = getAuditLog();
    if (logs.length >= 5) break;
    await delay(500);
  }
  
  // 2. Call getAuditLog and print
  console.log('\n--- Audit Log Entries ---');
  logs.forEach((log, index) => console.log(`Entry ${index + 1}:`, JSON.stringify(log, null, 2)));
  
  // 3. Verify integrity
  console.log('\n--- Verifying Audit Log Integrity ---');
  const isValid = verifyAuditLogIntegrity();
  console.log(`Initial Integrity Check: ${isValid}`);
  
  // 4. Manually corrupt one line
  console.log('\n--- Simulating Tampering ---');
  const rawLogs = fs.readFileSync(logFilePath, 'utf8').split('\n');
  if (rawLogs.length > 2) {
    const tamperedLine = JSON.parse(rawLogs[1]);
    tamperedLine.content.outcome = 'tampered_outcome';
    rawLogs[1] = JSON.stringify(tamperedLine);
    fs.writeFileSync(logFilePath, rawLogs.join('\n'));
    console.log('Successfully corrupted entry 2.');
  }
  
  const isTamperedValid = verifyAuditLogIntegrity();
  console.log(`Integrity Check after tampering: ${isTamperedValid}`);
}

run();
