require('dotenv').config();
const crypto = require('crypto');
const store = require('../utils/store');
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sendWebhook(name, orderId, eventId, amount) {
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

  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

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
    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function run() {
  const orderId = 'order_REPLAY123';
  const eventId = `evt_${Date.now()}`;
  const trueAmount = 50000;
  
  // Setup: Record trusted order so amount binding passes
  console.log(`[TEST SETUP] Recording trusted order ${orderId}...`);
  store.recordTrustedOrder(orderId, trueAmount, "INR");
  
  // a. Send first time (Passes)
  await sendWebhook('First Delivery (Fresh)', orderId, eventId, trueAmount);
  
  // b. Send exactly same again (Rejects)
  await sendWebhook('Replayed Delivery (Duplicate)', orderId, eventId, trueAmount);
}

run();
