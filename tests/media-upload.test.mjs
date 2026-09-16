import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareMediaUpload, uploadMedia, validateClip } from '../lib/media-upload.ts';

const settings = () => ({ start: 0, end: null, duration: null, maxDuration: 180, maxBytes: 95 * 1024 * 1024, signal: new AbortController().signal });

test('full-file duration is checked before uploading; valid source offsets remain usable', () => {
  assert.throws(() => validateClip(0, null, 142.2, 60), /duration limit/);
  assert.doesNotThrow(() => validateClip(0, null, 142.2, 180));
  assert.doesNotThrow(() => validateClip(100, 140, 142.2, 60));
  assert.throws(() => validateClip(143, null, 142.2, 180), /duration limit/);
  assert.throws(() => validateClip(0, 181, null, 180), /duration limit/);
  assert.throws(() => validateClip(NaN, null, null, 180), /duration limit/);
});

test('formats the browser cannot parse retain their original upload path', async () => {
  const file = new File(['unrecognized video'], 'recording.avi');
  assert.equal(await prepareMediaUpload(file, settings()), file);
  await assert.rejects(prepareMediaUpload(file, { ...settings(), maxBytes: 1 }), /upload limit/);
});

test('audio extraction drops video while preserving the decoded stereo recording', {
  skip: spawnSync('ffmpeg', ['-version']).status !== 0,
}, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'fretflow-audio-copy-'));
  try {
    const path = join(folder, 'source.mp4');
    const generate = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2', '-c:v', 'mpeg4', '-c:a', 'aac', '-ac', '2', '-t', '2', path]);
    assert.equal(generate.status, 0, generate.stderr?.toString());
    const original = readFileSync(path);
    const file = new File([original], 'source.mp4');
    const result = await prepareMediaUpload(file, settings());
    assert.equal(result.name, 'source.m4a');
    assert.ok(result.size < file.size);
    const extracted = Buffer.from(await result.arrayBuffer());
    const decode = input => {
      const output = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-map', '0:a:0', '-f', 's16le', 'pipe:1'], { input, maxBuffer: 1024 * 1024 });
      assert.equal(output.status, 0, output.stderr?.toString());
      return output.stdout;
    };
    assert.deepEqual(decode(extracted), decode(original));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,channels,sample_rate', '-of', 'json', 'pipe:0'], { input: extracted });
    assert.deepEqual(JSON.parse(probe.stdout).streams, [{ codec_type: 'audio', sample_rate: '44100', channels: 2 }]);
    await assert.rejects(prepareMediaUpload(file, { ...settings(), maxDuration: 1 }), /duration limit/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

function transport(t) {
  let xhr;
  class FakeXHR {
    upload = {};
    headers = {};
    constructor() { xhr = this; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeXHR;
  t.after(() => { if (previous) globalThis.XMLHttpRequest = previous; else delete globalThis.XMLHttpRequest; });
  const form = new FormData(); form.append('file', new File(['audio'], 'audio.m4a'));
  const controller = new AbortController();
  const events = [];
  const promise = uploadMedia('https://worker.example/api/analyze', form, {
    ticket: 'single-use-ticket', signal: controller.signal, originalBytes: 1000,
    onProgress: event => events.push(event),
  });
  return { xhr, events, promise, controller };
}

test('upload shows actual transmitted bytes and waits for job admission after reaching 100%', async t => {
  const { xhr, events, promise } = transport(t);
  xhr.upload.onprogress({ loaded: 50, total: 100, lengthComputable: true });
  assert.equal(events.at(-1).loaded, 50);
  assert.equal(events.at(-1).total, 100);
  xhr.upload.onload();
  assert.equal(events.at(-1).stage, 'waiting');
  assert.equal(xhr.withCredentials, false);
  assert.equal(xhr.headers['X-FretFlow-Ticket'], 'single-use-ticket');
  xhr.status = 202; xhr.responseText = '{"id":"accepted"}'; xhr.onload();
  assert.deepEqual(await promise, { id: 'accepted' });
});

test('cancelling an upload aborts the network request', async t => {
  const { xhr, promise, controller } = transport(t);
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(xhr.aborted, true);
});

test('a stalled upload fails instead of waiting forever and does not replay its ticket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { xhr, promise } = transport(t);
  t.mock.timers.tick(60_000);
  await assert.rejects(promise, /Upload stalled/);
  assert.equal(xhr.aborted, true);
});

test('server busy errors remain actionable after upload', async t => {
  const { xhr, promise } = transport(t);
  xhr.status = 429; xhr.responseText = '{"detail":"You already have an active analysis. Please wait for it to finish."}'; xhr.onload();
  await assert.rejects(promise, /active analysis/);
});
