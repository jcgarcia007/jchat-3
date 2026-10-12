// Unit tests for services/uploadBody.web.ts (file URIs → upload bodies in the browser). Run from mobile/:
//   node --test scripts/upload-body-web.test.mjs
// Node's fetch() understands data: URIs just like the browser's fetch() understands blob: / data: ones.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'upload-body-'));
const file = join(dir, 'uploadBody.web.mjs');
writeFileSync(
  file,
  ts.transpileModule(readFileSync(new URL('../services/uploadBody.web.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { uriToUploadBody, fileExtension } = await import(pathToFileURL(file).href);

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('a data: URI becomes a Blob with the same bytes and type', async () => {
  const body = await uriToUploadBody(PNG_1X1);
  assert.ok(body instanceof Blob);
  assert.equal(body.type, 'image/png');
  const bytes = new Uint8Array(await body.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]); // PNG signature
});

test('the picker mimeType wins over the blob type', async () => {
  const body = await uriToUploadBody(PNG_1X1, 'image/webp');
  assert.equal(body.type, 'image/webp');
  assert.equal(body.size, (await uriToUploadBody(PNG_1X1)).size, 'the bytes are untouched');
});

test('an empty blob type is filled from the given mimeType', async () => {
  const body = await uriToUploadBody('data:application/octet-stream;base64,AAEC', 'audio/webm');
  assert.equal(body.type, 'audio/webm');
});

test('an unreadable source throws (the caller shows its upload error)', async () => {
  await assert.rejects(uriToUploadBody('http://127.0.0.1:1/nope'));
});

test('fileExtension comes from the MIME type, never from the URI text', () => {
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', 'image/png'), 'png');
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', 'image/jpeg'), 'jpg');
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', 'image/webp'), 'webp');
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', 'image/png; charset=binary'), 'png');
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', undefined), 'jpg');
  assert.equal(fileExtension('blob:https://bar.jchat.cloud/3f2a-uuid', 'application/x-weird'), 'jpg');
  assert.equal(fileExtension('file:///a/b/photo.png', null), 'jpg', 'web ignores the URI text (a blob URI would give a broken path)');
});
