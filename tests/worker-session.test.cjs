const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync('lib/worker-session.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports, require, Buffer });
const { workerSession } = mod.exports;

test('sessions persist only with a valid signature and secret', () => {
  const first = workerSession(undefined, 'secret');
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.equal(workerSession(first.cookie, 'secret').id, first.id);
  assert.notEqual(workerSession(first.cookie, 'other-secret').id, first.id);
  assert.notEqual(workerSession('a'.repeat(64) + '.' + first.cookie.split('.')[1], 'secret').id, first.id);
  assert.notEqual(workerSession('not-a-cookie', 'secret').id, first.id);
});
