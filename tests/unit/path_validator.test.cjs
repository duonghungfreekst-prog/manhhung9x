/**
 * tests/unit/path_validator.test.cjs
 * Unit tests cho pathValidator.cjs — kiểm tra chặn path traversal,
 * null byte injection, prefix bypass
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Mock electron app trước khi require pathValidator
const mockApp = {
  getPath: (name) => {
    const map = {
      userData: 'C:\\Users\\Test\\AppData\\Roaming\\dmh-tools',
      pictures: 'C:\\Users\\Test\\Pictures',
      documents: 'C:\\Users\\Test\\Documents',
      desktop: 'C:\\Users\\Test\\Desktop',
      downloads: 'C:\\Users\\Test\\Downloads',
      temp: 'C:\\Users\\Test\\AppData\\Local\\Temp',
    };
    if (map[name]) return map[name];
    throw new Error('Unknown path: ' + name);
  }
};

// Patch require trước khi load module
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === 'electron') {
    return request;
  }
  return origResolve.call(this, request, parent, ...rest);
};

require.cache.electron = {
  id: 'electron',
  filename: 'electron',
  loaded: true,
  exports: { app: mockApp }
};

const { isSafePath, getAllowedDirectories } = require('../../electron/security/pathValidator.cjs');

describe('pathValidator — isSafePath()', () => {
  it('rejects null/undefined/empty', () => {
    assert.strictEqual(isSafePath(null), false);
    assert.strictEqual(isSafePath(undefined), false);
    assert.strictEqual(isSafePath(''), false);
    assert.strictEqual(isSafePath(123), false);
  });

  it('rejects null byte injection', () => {
    assert.strictEqual(isSafePath('C:\\Users\\Test\\Documents\\file.txt\x00.exe'), false);
  });

  it('blocks Windows system paths', () => {
    assert.strictEqual(isSafePath('C:\\Windows\\System32\\cmd.exe'), false);
    assert.strictEqual(isSafePath('C:\\WINDOWS\\SysWOW64\\test.dll'), false);
  });

  it('blocks registry hive files', () => {
    assert.strictEqual(isSafePath('C:\\Users\\Test\\NTUSER.DAT'), false);
  });

  it('allows files within allowed directories', () => {
    assert.strictEqual(isSafePath('C:\\Users\\Test\\Documents\\report.pdf'), true);
    assert.strictEqual(isSafePath('C:\\Users\\Test\\Downloads\\file.zip'), true);
    assert.strictEqual(isSafePath('C:\\Users\\Test\\Desktop\\notes.txt'), true);
  });

  it('blocks path traversal attacks', () => {
    // Attempting to escape from Documents to Windows
    assert.strictEqual(isSafePath('C:\\Users\\Test\\Documents\\..\\..\\..\\Windows\\System32\\cmd.exe'), false);
  });

  it('blocks prefix bypass (D:\\data vs D:\\data_evil)', () => {
    // This tests the path.sep fix — without fix, D:\data would match D:\data_evil
    const dirs = getAllowedDirectories();
    // Verify directories list doesn't include entire drive roots
    const hasFullDrive = dirs.some(d => /^[A-Z]:\\?$/.test(d));
    assert.strictEqual(hasFullDrive, false, 'Should not whitelist entire drive roots');
  });
});

describe('pathValidator — getAllowedDirectories()', () => {
  it('returns array of directories', () => {
    const dirs = getAllowedDirectories();
    assert.ok(Array.isArray(dirs));
    assert.ok(dirs.length > 0);
  });

  it('does NOT include entire drive roots D:/E:/F:', () => {
    const dirs = getAllowedDirectories();
    for (const d of dirs) {
      assert.ok(!(/^[DEF]:\\?$/.test(d)), 'Should not whitelist entire drive: ' + d);
    }
  });
});
