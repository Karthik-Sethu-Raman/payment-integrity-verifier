require('dotenv').config();
const Razorpay = require('razorpay');
const store = require('../utils/store');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createOrder() {
  try {
    const options = {
      amount: 50000, // amount in the smallest currency unit (paise) -> ₹500
      currency: "INR",
      receipt: "receipt_order_74394",
    };
    const order = await razorpay.orders.create(options);
    console.log("Order created successfully:");
    console.log("Order ID:", order.id);
    console.log("Full response:", order);
    
    // Record trusted amount in store
    store.recordTrustedOrder(order.id, order.amount, order.currency);
    console.log(`[STORE] Recorded trusted order ${order.id} with amount ${order.amount}`);
    
    // NOTE: This order ID will later be used to test the amount-binding integrity check
  } catch (error) {
    console.error("Error creating order:", error);
  }
}

createOrder();
