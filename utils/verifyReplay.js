/**
 * Deterministically verifies the replay integrity check.
 * 
 * @param {string} eventId - The Razorpay event ID (from x-razorpay-event-id header).
 * @param {object} processedEventsStore - The store module containing hasProcessedEvent.
 * @returns {object} - Verification result object.
 */
function verifyReplay(eventId, processedEventsStore) {
  if (!eventId) {
    return { valid: false, reason: 'missing_event_id' };
  }

  const isReplay = processedEventsStore.hasProcessedEvent(eventId);
  
  if (isReplay) {
    return { valid: false, reason: 'replay_detected' };
  }
  
  return { valid: true };
}

module.exports = verifyReplay;
