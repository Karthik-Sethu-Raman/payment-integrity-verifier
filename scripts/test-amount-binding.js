require('dotenv').config();
const crypto = require('crypto');
const store = require('../utils/store');
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sendWebhook(name, orderId, amount, signatureOverride) {
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
        'Request-Id': `test-${name.toLowerCase().replace(/ /g, '-')}`
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
  const orderId = 'order_TEST123';
  const trueAmount = 50000;
  
  // a. Create a real trusted order (mocked here directly in store for self-contained testing)
  console.log(`[TEST SETUP] Recording trusted order ${orderId} for ₹500 (50000 paise)...`);
  store.recordTrustedOrder(orderId, trueAmount, "INR");
  
  // b. Send a correctly-signed webhook claiming ₹500 (Passes)
  await sendWebhook('Valid Amount Webhook', orderId, trueAmount);
  
  // c. Send a correctly-signed webhook claiming ₹1 (Rejects)
  await sendWebhook('Tampered Amount Webhook', orderId, 100);
}

run();
