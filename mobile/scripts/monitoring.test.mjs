// Unit tests for utils/monitoringConfig.ts (Sentry privacy rules + "no DSN → no init"). Run from mobile/:
//   node --test scripts/monitoring.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'monitoring-'));
const out = join(dir, 'monitoringConfig.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../utils/monitoringConfig.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { buildSentryOptions, resolveDsn, scrubEvent, scrubBreadcrumb, SENSITIVE_KEYS } = await import(pathToFileURL(out).href);

const DSN = 'https://abc123@o123456.ingest.sentry.io/789'; // synthetic

test('without a DSN nothing is initialised', () => {
  for (const raw of [undefined, null, '', '   ', 'PENDIENTE_DSN', 'your-dsn', 'not a url', 'ftp://x']) {
    assert.equal(buildSentryOptions(raw), null, String(raw));
  }
  assert.equal(resolveDsn(` ${DSN} `), DSN);
});

test('with a DSN: privacy-first options', () => {
  const o = buildSentryOptions(DSN);
  assert.equal(o.dsn, DSN);
  assert.equal(o.sendDefaultPii, false);
  assert.equal(o.tracesSampleRate, 0.2);
  assert.equal(o.replaysSessionSampleRate, 0);
  assert.equal(o.replaysOnErrorSampleRate, 1.0);
  assert.equal(o.beforeSend, scrubEvent);
  assert.equal(o.beforeBreadcrumb, scrubBreadcrumb);
});

test('beforeSend removes e-mail, IP, location and the sensitive fields; keeps the rest', () => {
  const event = {
    event_id: 'e1',
    message: 'boom',
    level: 'error',
    user: { id: 'u-1', email: 'a@b.c', ip_address: '1.2.3.4' },
    contexts: { location: { lat: 1, lng: 2 }, device: { model: 'Pixel' }, os: { name: 'Android' } },
    tags: { screen: 'ChatRoom' },
    extra: {
      lat: 26.08, lng: -80.2, Latitude: 1, LONGITUDE: 2,
      token: 'abc', table_qr_token: 'qr', password: 'pw', access_token: 'at', refresh_token: 'rt', tracking_code: 'tc',
      keep: 'ok', nested: { deep: [{ password: 'x', fine: 1 }, 'str'], lat: 3, venue: 'bar' },
    },
    breadcrumbs: [{ category: 'ui.click', message: 'tap', data: { token: 't', view: 'Send' } }],
    request: { url: 'https://jchat.cloud/m/bar', headers: { authorization: 'Bearer x', 'user-agent': 'ua' } },
  };
  const snapshot = JSON.stringify(event);
  const out = scrubEvent(event);

  assert.equal(JSON.stringify(event), snapshot, 'the input is not mutated');
  assert.deepEqual(out.user, { id: 'u-1' });
  assert.equal('location' in out.contexts, false);
  assert.deepEqual(out.contexts.device, { model: 'Pixel' });
  assert.deepEqual(out.contexts.os, { name: 'Android' });
  assert.deepEqual(out.extra, { keep: 'ok', nested: { deep: [{ fine: 1 }, 'str'], venue: 'bar' } });
  assert.deepEqual(out.breadcrumbs, [{ category: 'ui.click', message: 'tap', data: { view: 'Send' } }]);
  assert.deepEqual(out.request, { url: 'https://jchat.cloud/m/bar', headers: { 'user-agent': 'ua' } });
  assert.equal(out.event_id, 'e1');
  assert.equal(out.message, 'boom');
  assert.deepEqual(out.tags, { screen: 'ChatRoom' });
  for (const key of ['lat', 'lng', 'latitude', 'longitude', 'token', 'table_qr_token', 'password']) assert.ok(SENSITIVE_KEYS.has(key), key);
});

test('beforeBreadcrumb drops console breadcrumbs and scrubs the data of the others', () => {
  assert.equal(scrubBreadcrumb({ category: 'console', message: 'user typed secret' }), null);
  assert.deepEqual(scrubBreadcrumb({ category: 'navigation', data: { to: 'Chat', lat: 1 } }), { category: 'navigation', data: { to: 'Chat' } });
  assert.deepEqual(scrubBreadcrumb({ category: 'ui.click' }), { category: 'ui.click' });
});

test('odd input does not throw (cycles, null, primitives)', () => {
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => scrubEvent({ extra: cyclic }));
  assert.equal(scrubEvent(null), null);
  assert.equal(scrubEvent('x'), 'x');
});
