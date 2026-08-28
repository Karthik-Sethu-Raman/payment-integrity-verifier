# Payment Integration Integrity Verifier

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Fill in your real keys in `.env` if necessary.

3. **Create a Test Order**
   ```bash
   node scripts/create-test-order.js
   ```
   This creates a test-mode order via the Razorpay API. Keep the Order ID handy; it will later be used to test the amount-binding integrity check.

4. **Start Webhook Server**
   ```bash
   node server.js
   ```
   This will start the local server on the specified PORT (default 3000).

5. **Expose Local Server using ngrok**
   ```bash
   ngrok http 3000
   ```
   Copy the Forwarding URL from ngrok and configure it in your Razorpay dashboard as the webhook URL (append `/webhook` to the path).
