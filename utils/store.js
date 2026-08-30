const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '../trusted_orders.json');
const PROCESSED_EVENTS_FILE = path.join(__dirname, '../processed_events.json');

/**
 * Gets all trusted orders from the store.
 */
function getStore() {
  if (!fs.existsSync(STORE_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(STORE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading trusted orders store:", error);
    return {};
  }
}

/**
 * Gets a specific trusted order by ID.
 * @param {string} orderId 
 * @returns {object|undefined} The order details or undefined if not found
 */
function getTrustedOrder(orderId) {
  const store = getStore();
  return store[orderId];
}

/**
 * Records a new trusted order.
 * @param {string} orderId 
 * @param {number} amount 
 * @param {string} currency 
 */
function recordTrustedOrder(orderId, amount, currency = "INR") {
  const store = getStore();
  store[orderId] = {
    amount,
    currency,
    created_at: Date.now()
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

/**
 * Gets all processed events.
 */
function getProcessedEvents() {
  if (!fs.existsSync(PROCESSED_EVENTS_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(PROCESSED_EVENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading processed events store:", error);
    return {};
  }
}

/**
 * Checks if an event has already been processed.
 * @param {string} eventId 
 * @returns {boolean} True if processed, false otherwise
 */
function hasProcessedEvent(eventId) {
  const events = getProcessedEvents();
  return !!events[eventId];
}

/**
 * Records that an event has been processed.
 * @param {string} eventId 
 */
function recordProcessedEvent(eventId) {
  const events = getProcessedEvents();
  events[eventId] = {
    processed_at: Date.now()
  };
  fs.writeFileSync(PROCESSED_EVENTS_FILE, JSON.stringify(events, null, 2));
}

module.exports = {
  getTrustedOrder,
  recordTrustedOrder,
  hasProcessedEvent,
  recordProcessedEvent
};
