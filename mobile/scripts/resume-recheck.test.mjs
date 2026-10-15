// JChat 3.0 — when the web app re-checks the venue presence on resume (utils/resumeRecheck.ts). Pure; no DOM.
// Run: node scripts/resume-recheck.test.mjs
import assert from 'node:assert/strict';
import { shouldResumeRecheck } from '../utils/resumeRecheck.ts';

const MIN = 60_000;
const base = { visible: true, online: true, sinceLastCheckMs: 5 * MIN, minGapMs: MIN };

// Back to the tab after a while → re-check.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'visible' }), true);
// The network comes back while the tab is visible → re-check.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'online' }), true);
// A page restored from the back-forward cache → re-check.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'pageshow', persisted: true }), true);

// Throttle: a check that started less than RESUME_RECHECK_MIN_GAP_MS ago is not repeated…
assert.equal(shouldResumeRecheck({ ...base, trigger: 'visible', sinceLastCheckMs: MIN - 1 }), false);
assert.equal(shouldResumeRecheck({ ...base, trigger: 'online', sinceLastCheckMs: 0 }), false);
// …and exactly at the gap it is.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'visible', sinceLastCheckMs: MIN }), true);
// No check ever made (Infinity) → re-check.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'online', sinceLastCheckMs: Infinity }), true);

// Never for a tab nobody is looking at (no position read in the background).
assert.equal(shouldResumeRecheck({ ...base, trigger: 'online', visible: false }), false);
assert.equal(shouldResumeRecheck({ ...base, trigger: 'pageshow', persisted: true, visible: false }), false);
// Offline: wait for the `online` event instead of a request that will fail.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'visible', online: false }), false);
// A normal page load is not a resume.
assert.equal(shouldResumeRecheck({ ...base, trigger: 'pageshow', persisted: false }), false);
assert.equal(shouldResumeRecheck({ ...base, trigger: 'pageshow' }), false);

console.log('resume recheck OK');
