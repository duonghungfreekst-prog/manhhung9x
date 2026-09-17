/**
 * tests/unit/command_injection.test.cjs
 * Unit tests cho kiểm tra chống command injection
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('power-action input validation', () => {
  // Simulate the validation logic from pctools:power-action
  function validateMinutes(minutes) {
    return Math.max(1, Math.min(1440, parseInt(minutes, 10) || 30));
  }

  it('accepts valid integer minutes', () => {
    assert.strictEqual(validateMinutes(30), 30);
    assert.strictEqual(validateMinutes(60), 60);
    assert.strictEqual(validateMinutes(1), 1);
    assert.strictEqual(validateMinutes(1440), 1440);
  });

  it('clamps to range 1-1440', () => {
    // parseInt(0) = 0, 0 || 30 = 30, Math.max(1, 30) = 30
    assert.strictEqual(validateMinutes(0), 30);
    // parseInt(-5) = -5, -5 || 30 → -5 is truthy, Math.max(1, Math.min(1440, -300)) = 1
    assert.strictEqual(validateMinutes(-5), 1);
    assert.strictEqual(validateMinutes(9999), 1440);
  });

  it('defaults to 30 for non-numeric input', () => {
    assert.strictEqual(validateMinutes('abc'), 30);
    assert.strictEqual(validateMinutes(null), 30);
    assert.strictEqual(validateMinutes(undefined), 30);
    assert.strictEqual(validateMinutes(NaN), 30);
  });

  it('rejects injection attempts in minutes', () => {
    // These would have been dangerous with the old exec(template string)
    const dangerous = '1" & calc.exe & "';
    const result = validateMinutes(dangerous);
    assert.strictEqual(result, 1); // parseInt('1" & calc...') returns 1
    assert.strictEqual(typeof result, 'number');
  });

  it('handles string numbers correctly', () => {
    assert.strictEqual(validateMinutes('45'), 45);
    assert.strictEqual(validateMinutes('  120  '), 120);
  });
});

describe('printer credential validation', () => {
  function validateUsername(user) {
    if (!user || user === 'Guest') return true;
    return /^[a-zA-Z0-9_.\\-]{1,64}$/.test(String(user).trim());
  }

  function validatePassword(pass) {
    if (!pass) return true;
    return !/[\x00-\x1F\x7F]/.test(String(pass));
  }

  it('accepts valid usernames', () => {
    assert.strictEqual(validateUsername('admin'), true);
    assert.strictEqual(validateUsername('DOMAIN\\user'), true);
    assert.strictEqual(validateUsername('user.name'), true);
    assert.strictEqual(validateUsername('Guest'), true);
  });

  it('rejects usernames with special chars', () => {
    assert.strictEqual(validateUsername('user;drop'), false);
    assert.strictEqual(validateUsername('user & calc'), false);
    assert.strictEqual(validateUsername('/delete:*'), false);
  });

  it('accepts normal passwords', () => {
    assert.strictEqual(validatePassword('P@ssw0rd!'), true);
    assert.strictEqual(validatePassword('complex#Pass'), true);
  });

  it('rejects passwords with control characters', () => {
    assert.strictEqual(validatePassword('pass\x00word'), false);
    assert.strictEqual(validatePassword('pass\nword'), false);
    assert.strictEqual(validatePassword('pass\rword'), false);
  });
});
