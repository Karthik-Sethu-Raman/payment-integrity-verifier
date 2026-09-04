# Payment Integration Integrity Verifier

**Razorpay AI Buildathon 2026 — Track 02: AI Risk Manager**

## The problem

Razorpay already provides the cryptographic primitives merchants need to
secure their integrations — signed webhooks, an Orders API that lets you
verify amounts server-side. Razorpay solved the cryptography. It didn't
solve merchant behavior.

In practice, integrations skip signature verification, compare signatures
with naive string equality (a timing side-channel), trust client-supplied
amounts instead of re-deriving them server-side, or don't guard against
webhook replay. This is the exact class of bug behind real incidents —
including a 2022 case where outdated Razorpay integrations lacking proper
server-side authorization checks led to ₹7.3 crore stolen across 831
transactions.

This project doesn't score transactions for suspicious *patterns*. It
verifies whether a transaction's chain of custody is structurally valid
in the first place — whether the integration is actually using Razorpay's
own security primitives correctly.

## What it does

Three deterministic integrity checks run on every incoming webhook, in
this order:

1. **Signature verification** — independently recomputes the HMAC-SHA256
   over the raw webhook body using the registered webhook secret, and
   compares it to Razorpay's `X-Razorpay-Signature` header using a
   constant-time comparison (`crypto.timingSafeEqual`) to avoid timing
   side-channel leaks that a naive `===` comparison introduces.
2. **Amount binding** — compares the amount claimed in the webhook
   against the order's true amount, recorded server-side at order
   creation time. Never trusts a client- or webhook-supplied amount as
   ground truth.
3. **Replay protection** — rejects any webhook whose `event.id` has
   already been processed, even if it carries a valid signature.

A webhook must pass all three, in order, to be accepted. Failing any
check triggers a **bounded auto-response**: the affected order is flagged
via Razorpay's Orders API using a fixed, hard-coded action — never an
AI-decided one — and the incident is written to an append-only,
hash-chained audit log.

## Why AI, and where it's used (and isn't)

The three checks above are deterministic by design — they need to be
provably correct, not judgment calls. No LLM is involved in the actual
accept/reject decision, on purpose.

Where AI is genuinely used: an LLM (via the Fireworks AI API,
`deepseek-v4-flash-0731`) translates each *already-made* deterministic
decision into a plain-English explanation for a merchant reading the
dashboard — e.g. turning `{reason: "amount_mismatch", expected: 50000,
actual: 100}` into a clear sentence. If the LLM call fails or times out,
the system falls back to a plain templated explanation — this has been
observed happening for real under a genuine API timeout during testing,
and the security decision was completely unaffected, which is the point.

## Results — held-out adversarial test suite

Ten hand-designed test cases were run against the live, deployed webhook
pipeline (not isolated unit tests) — two legitimate transactions as
negative controls, and eight adversarial cases spanning every failure
mode the system defends against: forged signature, missing signature,
tampered body with a stale signature, amount under-claim, amount
over-claim, replay, malformed-but-signed payload, and unknown order ID.

| Metric | Value |
|---|---|
| Precision | 1.0000 |
| Recall | 1.0000 |
| False Positive Rate | 0.0000 |
| True Positives | 8 |
| False Positives | 0 |
| True Negatives | 2 |
| False Negatives | 0 |

These numbers are expected to be clean, since the checks are deterministic
rather than probabilistic — the real evidence of rigor is in the breadth
of the 10 hand-constructed adversarial cases, not the percentages
themselves. Full results: `results/adversarial-suite-results.json`.

## Audit trail

Every decision — accepted or rejected — is written to an append-only,
hash-chained log (`audit_log.jsonl`). Each entry stores a hash of the
previous entry, so any retroactive tampering with the log is detectable.
This is proven, not just claimed: a unit test manually corrupts an entry
and confirms `verifyAuditLogIntegrity()` correctly flips from valid to
invalid. The dashboard exposes a live "Re-verify" button that re-runs
this check on demand.

## Architecture

```
Client → Razorpay → Webhook → [Signature Check] → [Amount Binding]
                                       ↓ fail            ↓ fail
                                [Auto-flag order]  [Auto-flag order]
                                       ↓                 ↓
                              [Audit log entry] ← [Replay Check]
                                                        ↓ fail
                                                 [Auto-flag order]
                                                        ↓
                                              [Audit log entry]
                                                        ↓ pass
                                              [Accepted + logged]
```

## Known limitations

- **Replay store is not atomic.** The JSON-file read/check/write flow
  could theoretically allow two simultaneous deliveries of the same
  event ID to both pass in a true race condition. Not exposed by current
  tests; a production system would need proper locking or an atomic
  data store.
- **In-memory/file-based persistence**, not a real database — a
  deliberate scope choice for a buildathon timeline, not a production
  architecture.

## Running locally

```bash
npm install
cp .env.example .env   # fill in your Razorpay test-mode keys + Fireworks key
node server.js         # starts the webhook receiver + dashboard
node scripts/create-test-order.js   # create a test order
node scripts/run-adversarial-suite.js   # run the full test suite
npm test                # unit tests
```

Dashboard available at `http://localhost:3000/dashboard.html` once the
server is running.