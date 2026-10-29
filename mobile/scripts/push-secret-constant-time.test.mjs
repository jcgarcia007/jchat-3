// The five functions called by the database (x-push-secret) must compare the secret in constant time,
// through the shared helper, and never with ===/!==. Static check of the sources: nothing is deployed or called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const functionsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'functions');
const FUNCTIONS = ['send-push', 'gift-worker', 'moderate-dm-photo', 'moderate-match-photo', 'safety-alert'];

for (const name of FUNCTIONS) {
  test(`${name} compares x-push-secret with the shared safeEqual`, () => {
    const src = readFileSync(join(functionsDir, name, 'index.ts'), 'utf8');
    assert.match(src, /import \{ safeEqual \} from "\.\.\/_shared\/safeEqual\.ts";/);
    assert.match(src, /safeEqual\(/);
    // no direct comparison of the header value
    assert.doesNotMatch(src, /x-push-secret"\)\s*(?:\?\?\s*"")?\s*[!=]==/);
    assert.doesNotMatch(src, /[!=]==\s*expectedSecret/);
    // no private copy of the helper
    assert.doesNotMatch(src, /function (safeEqual|secretsMatch)\(/);
  });
}
