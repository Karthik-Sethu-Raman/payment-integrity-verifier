const crypto = require('crypto');

jest.mock('../utils/flagOrder', () => jest.fn().mockResolvedValue(undefined));

const flagOrder = require('../utils/flagOrder');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhook failure handling', () => {
  const originalEnv = process.env;
  const webhookSecret = 'test_webhook_secret';
  let app;
  let server;
  let webhookUrl;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
      FIREWORKS_API_KEY: 'your_fireworks_api_key_here'
    };
    app = require('../server');

    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    webhookUrl = `http://127.0.0.1:${server.address().port}/webhook`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    process.env = originalEnv;
  });

  beforeEach(() => {
    flagOrder.mockClear();
  });

  test('does not flag an order named in an invalid-signature webhook', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { order_id: 'order_untrusted', amount: 50000 } } }
    });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': 'f'.repeat(64),
        'X-Razorpay-Event-Id': 'evt_invalid_signature'
      },
      body: payload
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('invalid_signature');
    await new Promise(setImmediate);
    expect(flagOrder).not.toHaveBeenCalled();
  });

  test('rejects a signed payment event with a missing amount as malformed', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { order_id: 'order_verified' } } }
    });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': sign(payload, webhookSecret),
        'X-Razorpay-Event-Id': 'evt_missing_amount'
      },
      body: payload
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('malformed_payload');
    await new Promise(setImmediate);
    expect(flagOrder).toHaveBeenCalledWith(expect.anything(), 'order_verified', 'malformed_payload');
  });
});
