const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Load these pure TypeScript modules with the compiler already in the project.
// No browser or additional test runtime dependency is needed.
function load(name) {
  const filename = path.join(__dirname, '../lib/i18n', name + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: dependency => load(dependency) }, { filename });
  return module.exports;
}
const { translate, localizeResult, resolveLocale } = load('index');
const { messages } = load('messages');

test('English is the default; an explicit saved language preference wins', () => {
  assert.equal(resolveLocale(undefined), 'en');
  assert.equal(resolveLocale(''), 'en');
  assert.equal(resolveLocale('invalid'), 'en');
  assert.equal(resolveLocale('zh-CN'), 'en');
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(resolveLocale('zh'), 'zh');
});

test('translations preserve musical symbols, user content and parameter values', () => {
  assert.equal(translate('zh', 'Play'), '播放');
  assert.equal(translate('en', 'Play'), 'Play');
  assert.equal(translate('zh', 'Chord {index} of {total}', { index: 2, total: 4 }), '第 2 个和弦，共 4 个');
  assert.equal(translate('en', 'Loop {chord} at {time}', { chord: 'F#m7b5', time: '0:02.4' }), 'Loop F#m7b5 at 0:02.4');
  assert.equal(localizeResult('en', '我的原创练习.mov'), '我的原创练习.mov');
  assert.equal(localizeResult('zh', 'G7alt'), 'G7alt');
});

test('historical worker results display in English without modifying source data', () => {
  assert.equal(localizeResult('en', 'D 小调'), 'D minor');
  assert.equal(localizeResult('en', 'Bb 大调'), 'Bb major');
  assert.equal(localizeResult('en', '主功能 · 稳定、归属'), 'Tonic function · stability and home');
  assert.equal(localizeResult('en', 'Basic Pitch 正在逐音转录'), 'Basic Pitch is transcribing notes');
  assert.equal(localizeResult('en', '为避免同弦重叠，2 处延音在下一次拨弦处截断。'), 'To avoid overlap on the same string, 2 sustained notes were shortened at the next pluck.');
  assert.match(localizeResult('en', '3 个音未进入六线谱（片段起点之前、音域或同时指位限制）；原始音符和 MIDI 仍保留。'), /^3 notes were omitted/);
  assert.equal(localizeResult('zh', 'Request failed. Check your input and try again.'), '请求未完成，请检查输入后重试。');
});

test('every message has Chinese copy with the same interpolation parameters', () => {
  const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [en, zh] of Object.entries(messages)) {
    assert.ok(zh.trim(), en);
    assert.deepEqual(parameters(en), parameters(zh), en);
    assert.equal(translate('en', en), en);
    assert.equal(translate('zh', en), zh);
  }
});

test('all static translation calls are present in the central catalog', () => {
  for (const filename of fs.readdirSync(path.join(__dirname, '../components')).filter(name => name.endsWith('.tsx'))) {
    const source = fs.readFileSync(path.join(__dirname, '../components', filename), 'utf8');
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function checkCopy(node) {
      if (ts.isStringLiteral(node)) assert.ok(Object.hasOwn(messages, node.text), `${filename}: ${node.text}`);
      else if (ts.isConditionalExpression(node)) { checkCopy(node.whenTrue); checkCopy(node.whenFalse); }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments[0]) checkCopy(node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
});
