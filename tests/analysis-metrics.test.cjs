const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/analysis-metrics.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { module: mod, exports: mod.exports, require });
const { analysisMetric } = mod.exports;
const id = 'a'.repeat(32);

test('metrics accept trusted job status and remove all uploaded content and identities', () => {
  const metric = analysisMetric('GET', `jobs/${id}`, 200, { id, status: 'done', owner: 'private-user', result: { title: 'secret-song', url: '?ticket=private-ticket' } }, 'secret');
  assert.equal(metric.status, 'done');
  assert.match(metric.job, /^[a-f0-9]{24}$/);
  assert.equal(metric.job, analysisMetric('POST', 'demo', 200, { id, status: 'queued' }, 'secret').job);
  assert.equal(analysisMetric('POST', 'demo', 202, { id }, 'secret').status, 'queued');
  assert.equal(analysisMetric('GET', `jobs/${id}`, 200, { id }, 'secret'), null);
  assert.notEqual(metric.job, analysisMetric('POST', 'demo', 200, { id, status: 'queued' }, 'new-secret').job);
  assert.doesNotMatch(JSON.stringify(metric), /private|secret-song|ticket|aaaaaaaaaaaaaaaa/);
  assert.equal(analysisMetric('GET', 'jobs', 200, [{ id, status: 'done' }], 'secret'), null);
  assert.equal(analysisMetric('GET', `jobs/${id}`, 200, { id, status: 'nonsense' }, 'secret'), null);
  assert.equal(analysisMetric('POST', 'analyze', 200, { id, status: 'queued' }), null);
  assert.equal(analysisMetric('POST', 'demo', 429, { detail: 'private-error' }, 'secret').http_status, 429);
});

test('summary deduplicates polls and separates failures, cancellation and unknown outcomes', async () => {
  const { summarizeAnalysis } = await import('../scripts/summarize-analysis.mjs');
  const events = [
    ['a', 'queued', '01'], ['a', 'done', '03'], ['a', 'running', '02'], ['a', 'done', '03'],
    ['b', 'error', '04'], ['c', 'cancelled', '05'], ['d', 'running', '06']
  ].map(([id, status, at]) => JSON.stringify({ message: `FRETFLOW_ANALYSIS ${JSON.stringify({ schema: 'fretflow.analysis.v1', event: 'job_observed', job: id.repeat(24), status, at })}` })).join('\n');
  const summary = summarizeAnalysis(events);
  assert.equal(summary.observed_jobs, 4);
  assert.equal(summary.done, 1);
  assert.equal(summary.error, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.success_rate_of_observed_done_or_error, 0.5);
  assert.equal(summarizeAnalysis('').success_rate_of_observed_done_or_error, null);
});
