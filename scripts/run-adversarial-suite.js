require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('../utils/store');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://127.0.0.1:3000/webhook';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const RESULTS_FILE = path.join(__dirname, '../results/adversarial-suite-results.json');

function createPayload(orderId, amount, eventId, { includeAmount = true } = {}) {
  const entity = {
    order_id: orderId,
    status: 'captured'
  };

  if (includeAmount) {
    entity.amount = amount;
  }

  return JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity } },
    contains: ['payment']
  });
}

function sign(payload, secret = WEBHOOK_SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function pad(value, width) {
  return String(value).padEnd(width);
}

async function sendCase(testCase) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Razorpay-Event-Id': testCase.eventId
  };

  if (testCase.signature) {
    headers['X-Razorpay-Signature'] = testCase.signature;
  }

  let response;
  try {
    response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: testCase.payload
    });
  } catch (error) {
    throw new Error(`Could not reach ${WEBHOOK_URL} for "${testCase.name}": ${error.message}`);
  }

  const responseBody = await response.text();
  const actualOutcome = response.ok ? 'ACCEPTED' : 'REJECTED';
  const rejectionReason = response.ok ? null : responseBody;
  const matchesExpectation =
    actualOutcome === testCase.expectedOutcome &&
    (testCase.expectedReason === null || rejectionReason === testCase.expectedReason);

  return {
    name: testCase.name,
    groundTruth: testCase.groundTruth,
    expectedOutcome: testCase.expectedOutcome,
    expectedReason: testCase.expectedReason,
    actualOutcome,
    rejectionReason,
    httpStatus: response.status,
    matchesExpectation
  };
}

function calculateMetrics(results) {
  const metrics = {
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0
  };

  for (const result of results) {
    const isMalicious = result.groundTruth === 'malicious';
    const rejected = result.actualOutcome === 'REJECTED';

    if (isMalicious && rejected) metrics.truePositives += 1;
    if (!isMalicious && rejected) metrics.falsePositives += 1;
    if (!isMalicious && !rejected) metrics.trueNegatives += 1;
    if (isMalicious && !rejected) metrics.falseNegatives += 1;
  }

  const precisionDenominator = metrics.truePositives + metrics.falsePositives;
  const recallDenominator = metrics.truePositives + metrics.falseNegatives;
  const falsePositiveRateDenominator = metrics.falsePositives + metrics.trueNegatives;

  return {
    ...metrics,
    precision: precisionDenominator === 0 ? null : metrics.truePositives / precisionDenominator,
    recall: recallDenominator === 0 ? null : metrics.truePositives / recallDenominator,
    falsePositiveRate: falsePositiveRateDenominator === 0
      ? null
      : metrics.falsePositives / falsePositiveRateDenominator
  };
}

function formatRate(value) {
  return value === null ? 'N/A' : value.toFixed(4);
}

function printResults(results, metrics) {
  console.log('\nADVERSARIAL SUITE RESULTS');
  console.log(`${pad('Case', 38)} ${pad('Truth', 11)} ${pad('Actual', 11)} ${pad('Test', 6)} Rejection reason`);
  console.log('-'.repeat(100));

  for (const result of results) {
    console.log(
      `${pad(result.name, 38)} ${pad(result.groundTruth, 11)} ${pad(result.actualOutcome, 11)} ` +
      `${pad(result.matchesExpectation ? 'PASS' : 'FAIL', 6)} ${result.rejectionReason || '-'}`
    );
  }

  console.log('\nMETRICS');
  console.log(`${pad('Metric', 24)} Value`);
  console.log('-'.repeat(38));
  console.log(`${pad('True Positives', 24)} ${metrics.truePositives}`);
  console.log(`${pad('False Positives', 24)} ${metrics.falsePositives}`);
  console.log(`${pad('True Negatives', 24)} ${metrics.trueNegatives}`);
  console.log(`${pad('False Negatives', 24)} ${metrics.falseNegatives}`);
  console.log(`${pad('Precision', 24)} ${formatRate(metrics.precision)}`);
  console.log(`${pad('Recall', 24)} ${formatRate(metrics.recall)}`);
  console.log(`${pad('False Positive Rate', 24)} ${formatRate(metrics.falsePositiveRate)}`);
}

async function main() {
  if (!WEBHOOK_SECRET) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET must be set before running the adversarial suite.');
  }

  const runId = `adv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const orderA = `order_${runId}_a`;
  const orderB = `order_${runId}_b`;
  const amountA = 50000;
  const amountB = 12500;

  // These are server-side fixtures, mirroring a completed order-creation flow.
  store.recordTrustedOrder(orderA, amountA, 'INR');
  store.recordTrustedOrder(orderB, amountB, 'INR');

  const legitimateAPayload = createPayload(orderA, amountA, `${runId}_legitimate_a`);
  const legitimateASignature = sign(legitimateAPayload);
  const legitimateBPayload = createPayload(orderB, amountB, `${runId}_legitimate_b`);
  const validPayloadBeforeTampering = createPayload(orderA, amountA, `${runId}_stale_signature`);
  const tamperedPayload = createPayload(orderA, 100, `${runId}_stale_signature`);

  const cases = [
    {
      name: '1. Legitimate transaction A',
      groundTruth: 'legitimate',
      expectedOutcome: 'ACCEPTED',
      expectedReason: null,
      eventId: `${runId}_legitimate_a`,
      payload: legitimateAPayload,
      signature: legitimateASignature
    },
    {
      name: '2. Legitimate transaction B',
      groundTruth: 'legitimate',
      expectedOutcome: 'ACCEPTED',
      expectedReason: null,
      eventId: `${runId}_legitimate_b`,
      payload: legitimateBPayload,
      signature: sign(legitimateBPayload)
    },
    {
      name: '3. Forged signature',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'invalid_signature',
      eventId: `${runId}_forged_signature`,
      payload: createPayload(orderA, amountA, `${runId}_forged_signature`),
      signature: sign(createPayload(orderA, amountA, `${runId}_forged_signature`), 'wrong_webhook_secret')
    },
    {
      name: '4. Missing signature header',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'invalid_signature',
      eventId: `${runId}_missing_signature`,
      payload: createPayload(orderA, amountA, `${runId}_missing_signature`),
      signature: null
    },
    {
      name: '5. Tampered body, stale signature',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'invalid_signature',
      eventId: `${runId}_stale_signature`,
      payload: tamperedPayload,
      signature: sign(validPayloadBeforeTampering)
    },
    {
      name: '6. Amount under-claim',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'amount_mismatch',
      eventId: `${runId}_under_claim`,
      payload: createPayload(orderA, 100, `${runId}_under_claim`),
      signature: sign(createPayload(orderA, 100, `${runId}_under_claim`))
    },
    {
      name: '7. Amount over-claim',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'amount_mismatch',
      eventId: `${runId}_over_claim`,
      payload: createPayload(orderA, 60000, `${runId}_over_claim`),
      signature: sign(createPayload(orderA, 60000, `${runId}_over_claim`))
    },
    {
      name: '8. Replay of transaction A',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'replay_detected',
      eventId: `${runId}_legitimate_a`,
      payload: legitimateAPayload,
      signature: legitimateASignature
    },
    {
      name: '9. Malformed signed payload',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'malformed_payload',
      eventId: `${runId}_malformed`,
      payload: createPayload(orderA, amountA, `${runId}_malformed`, { includeAmount: false }),
      signature: null,
      signPayload: true
    },
    {
      name: '10. Unknown order_id',
      groundTruth: 'malicious',
      expectedOutcome: 'REJECTED',
      expectedReason: 'unknown_order',
      eventId: `${runId}_unknown_order`,
      payload: createPayload(`order_${runId}_unknown`, amountA, `${runId}_unknown_order`),
      signature: null,
      signPayload: true
    }
  ];

  for (const testCase of cases) {
    if (testCase.signPayload) {
      testCase.signature = sign(testCase.payload);
    }
  }

  const results = [];
  for (const testCase of cases) {
    results.push(await sendCase(testCase));
  }

  const metrics = calculateMetrics(results);
  const report = {
    generatedAt: new Date().toISOString(),
    webhookUrl: WEBHOOK_URL,
    results,
    metrics
  };

  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');

  printResults(results, metrics);
  console.log(`\nFull results saved to ${RESULTS_FILE}`);

  if (results.some(result => !result.matchesExpectation)) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`Adversarial suite failed: ${error.message}`);
  process.exitCode = 1;
});
