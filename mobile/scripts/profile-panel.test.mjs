// Unit tests for utils/profilePanelLayout.ts (the desktop profile panel next to a usable chat). Run from mobile/:
//   node --test scripts/profile-panel.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'profile-panel-'));
const file = join(dir, 'profilePanelLayout.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/profilePanelLayout.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { isProfilePanelWidth, columnLeftWithPanel, PROFILE_PANEL_MIN_WIDTH, PROFILE_PANEL_WIDTH, WEB_COLUMN } = await import(pathToFileURL(file).href);

test('a panel from 900 px up, a sheet below', () => {
  assert.equal(PROFILE_PANEL_MIN_WIDTH, 900);
  assert.equal(isProfilePanelWidth(900), true);
  assert.equal(isProfilePanelWidth(1280), true);
  assert.equal(isProfilePanelWidth(899), false);
  assert.equal(isProfilePanelWidth(390), false);
});

test('column + panel are centered as one block: even gaps, never overlapping from the breakpoint on', () => {
  assert.equal(PROFILE_PANEL_WIDTH, 420);
  assert.equal(WEB_COLUMN, 480);
  for (const width of [900, 1024, 1280, 1920]) {
    const left = columnLeftWithPanel(width);
    const columnRight = left + WEB_COLUMN;
    const panelLeft = width - PROFILE_PANEL_WIDTH;
    assert.ok(left >= 0);
    assert.ok(columnRight <= panelLeft + 1e-9, `no overlap at ${width}`);
    assert.ok(Math.abs(left - (panelLeft - columnRight)) < 1e-9, `the gap left of the column equals the one between column and panel at ${width}`);
  }
});

test('on a window narrower than both blocks the left padding never goes negative', () => {
  assert.equal(columnLeftWithPanel(500), 0);
});
