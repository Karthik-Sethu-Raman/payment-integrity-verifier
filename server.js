require('dotenv').config();
const express = require('express');
const verifySignature = require('./utils/verifySignature');

const app = express();
const port = process.env.PORT || 3000;

// Use express.raw() to get the raw body bytes for signature verification later
// This is critical since express.json() modifies the stream and makes it impossible to verify the signature
app.use('/webhook', express.raw({ type: 'application/json' }));

app.post('/webhook', (req, res) => {
  console.log("--- Webhook Received ---");
  
  const signature = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  // 1. Webhook signature validity check
  const isValid = verifySignature(req.body, signature, secret);
  
  if (!isValid) {
    console.error(`[SECURITY] Invalid webhook signature detected! request-id: ${req.headers['request-id'] || 'unknown'}`);
    return res.status(400).send("Invalid signature");
  }
  
  console.log("[SUCCESS] Webhook signature verified successfully.");
  
  // Parse body now that signature is verified
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
    console.log("Event:", payload.event);
  } catch (err) {
    console.error("Failed to parse JSON payload");
    return res.status(400).send("Invalid JSON");
  }
  
  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
