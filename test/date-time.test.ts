import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKoreaDateTime } from '../src/shared/date-time.js';

test('UTC database timestamps are displayed in Korea time', () => {
  assert.equal(formatKoreaDateTime('2026-08-31 09:05:00'), '2026.08.31 18:05');
  assert.equal(formatKoreaDateTime('2026-08-31 09:05'), '2026.08.31 18:05');
  assert.equal(formatKoreaDateTime('2026-08-31T09:05:00'), '2026.08.31 18:05');
  assert.equal(formatKoreaDateTime('2026-08-31T15:30:00Z'), '2026.09.01 00:30');
});

test('missing or invalid timestamps are not displayed', () => {
  assert.equal(formatKoreaDateTime(null), null);
  assert.equal(formatKoreaDateTime('not-a-date'), null);
});
