const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_LOG_FILE = path.join(__dirname, '../audit_log.jsonl');
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function getAuditLog(filePath = AUDIT_LOG_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
}

function computeHash(previousHash, entryContent) {
  // Sort keys to ensure deterministic stringification if content fields change order, 
  // though JSON.stringify usually preserves insertion order.
  const dataString = JSON.stringify(entryContent);
  return crypto.createHash('sha256').update(previousHash + dataString).digest('hex');
}

function appendAuditEntry(entryContent, filePath = AUDIT_LOG_FILE) {
  const logs = getAuditLog(filePath);
  const previousHash = logs.length > 0 ? logs[logs.length - 1].hash : GENESIS_HASH;
  
  const hash = computeHash(previousHash, entryContent);
  
  const entry = {
    previousHash,
    hash,
    content: entryContent
  };
  
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function verifyAuditLogIntegrity(filePath = AUDIT_LOG_FILE) {
  const logs = getAuditLog(filePath);
  if (logs.length === 0) return true;
  
  let currentExpectedPreviousHash = GENESIS_HASH;
  
  for (const entry of logs) {
    if (entry.previousHash !== currentExpectedPreviousHash) {
      return false; // Chain broken: previous hash doesn't match
    }
    
    const recomputedHash = computeHash(entry.previousHash, entry.content);
    if (recomputedHash !== entry.hash) {
      return false; // Tampered content: hash doesn't match
    }
    
    currentExpectedPreviousHash = entry.hash;
  }
  
  return true;
}

module.exports = {
  getAuditLog,
  appendAuditEntry,
  verifyAuditLogIntegrity
};
