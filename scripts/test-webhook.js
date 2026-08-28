require('dotenv').config();
const crypto = require('crypto');
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

const payload = JSON.stringify({
  entity: "event",
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        amount: 50000,
        status: "captured"
      }
    }
  }
});

const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const invalidSignature = 'f'.repeat(64); // Complete forgery

async function sendWebhook(name, signature) {
  console.log(`\n--- Sending ${name} ---`);
  try {
    const response = await fetch('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'Request-Id': `test-${name.toLowerCase().replace(' ', '-')}`
      },
      body: payload
    });
    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function run() {
  await sendWebhook('Valid Webhook', validSignature);
  await sendWebhook('Forged Webhook', invalidSignature);
}

run();
