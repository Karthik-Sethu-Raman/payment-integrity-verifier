const fs = require('fs');
const path = require('path');
const { appendAuditEntry, verifyAuditLogIntegrity } = require('../utils/auditLog');

const TEST_LOG_FILE = path.join(__dirname, '../test_audit_log.jsonl');

describe('Audit Log Hash Chain', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
  });

  test('should return true for a valid chain', () => {
    appendAuditEntry({ action: 'test1' }, TEST_LOG_FILE);
    appendAuditEntry({ action: 'test2' }, TEST_LOG_FILE);
    appendAuditEntry({ action: 'test3' }, TEST_LOG_FILE);
    
    expect(verifyAuditLogIntegrity(TEST_LOG_FILE)).toBe(true);
  });

  test('should return false if content is tampered with', () => {
    appendAuditEntry({ action: 'test1' }, TEST_LOG_FILE);
    appendAuditEntry({ action: 'test2' }, TEST_LOG_FILE);
    appendAuditEntry({ action: 'test3' }, TEST_LOG_FILE);
    
    expect(verifyAuditLogIntegrity(TEST_LOG_FILE)).toBe(true);
    
    // Manually corrupt the log file
    let logs = fs.readFileSync(TEST_LOG_FILE, 'utf8').split('\n');
    // Modify the content of the second entry (index 1)
    const tamperedEntry = JSON.parse(logs[1]);
    tamperedEntry.content.action = 'malicious_action';
    logs[1] = JSON.stringify(tamperedEntry);
    fs.writeFileSync(TEST_LOG_FILE, logs.join('\n'));
    
    expect(verifyAuditLogIntegrity(TEST_LOG_FILE)).toBe(false);
  });
});
