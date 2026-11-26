import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartLook } from '../public/lib/look.js';

const theme = { up: '#089981', down: '#f23645', bg: '#131722' };

test('no settings follows the theme', () => {
  assert.deepEqual(chartLook(undefined, theme), {
    up: '#089981', down: '#f23645', bg: '#131722',
    vertGrid: true, horzGrid: true, borders: false, wicks: true, priceLine: true,
  });
});

test('custom colours, grid and toggles apply', () => {
  const l = chartLook({ up: '#2962ff', down: '#ff9800', bg: '#000000', grid: 'horz', borders: true, wicks: false, priceLine: false }, theme);
  assert.equal(l.up, '#2962ff');
  assert.equal(l.down, '#ff9800');
  assert.equal(l.bg, '#000000');
  assert.equal(l.vertGrid, false);
  assert.equal(l.horzGrid, true);
  assert.equal(l.borders, true);
  assert.equal(l.wicks, false);
  assert.equal(l.priceLine, false);
});

test('bad values fall back instead of breaking the chart', () => {
  const l = chartLook({ up: 'red;', bg: 'javascript:', grid: 'diagonal' }, theme);
  assert.equal(l.up, '#089981');
  assert.equal(l.bg, '#131722');
  assert.equal(l.vertGrid && l.horzGrid, true);
  assert.equal(chartLook({ grid: 'none' }, theme).vertGrid, false);
});
