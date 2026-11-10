import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCoordinate,
  buildDirectionsUrl,
  buildStreetViewUrl,
} from '../utils/mapsLinks.ts';

test('isValidCoordinate', async (t) => {
  await t.test('returns true for valid coordinates', () => {
    assert.equal(isValidCoordinate(0, 0), true);
    assert.equal(isValidCoordinate(37.7749, -122.4194), true);
    assert.equal(isValidCoordinate(-90, -180), true);
    assert.equal(isValidCoordinate(90, 180), true);
  });

  await t.test('returns false for out-of-range coordinates', () => {
    assert.equal(isValidCoordinate(90.0001, 0), false);
    assert.equal(isValidCoordinate(-90.0001, 0), false);
    assert.equal(isValidCoordinate(0, 180.0001), false);
    assert.equal(isValidCoordinate(0, -180.0001), false);
  });

  await t.test('returns false for NaN and Infinity', () => {
    assert.equal(isValidCoordinate(NaN, 0), false);
    assert.equal(isValidCoordinate(0, NaN), false);
    assert.equal(isValidCoordinate(Infinity, 0), false);
    assert.equal(isValidCoordinate(0, -Infinity), false);
  });

  await t.test('returns false for non-number inputs', () => {
    assert.equal(isValidCoordinate('37.7749', -122.4194), false);
    assert.equal(isValidCoordinate(37.7749, '-122.4194'), false);
    assert.equal(isValidCoordinate(null, undefined), false);
    assert.equal(isValidCoordinate({}, []), false);
  });
});

test('buildDirectionsUrl', async (t) => {
  await t.test('builds valid URL with properly encoded query parameters', () => {
    const urlStr = buildDirectionsUrl(37.7749, -122.4194);
    assert.ok(urlStr !== null);
    assert.ok(urlStr.startsWith('https://www.google.com/maps/'));

    const parsed = new globalThis.URL(urlStr);
    assert.equal(parsed.origin, 'https://www.google.com');
    assert.equal(parsed.pathname, '/maps/dir/');
    assert.equal(parsed.searchParams.get('api'), '1');
    assert.equal(parsed.searchParams.get('destination'), '37.7749,-122.4194');
    assert.equal(parsed.searchParams.get('travelmode'), 'walking');
  });

  await t.test('rounds coordinates to 6 decimals', () => {
    const urlStr = buildDirectionsUrl(37.123456789, -122.987654321);
    assert.ok(urlStr !== null);
    const parsed = new globalThis.URL(urlStr);
    assert.equal(parsed.searchParams.get('destination'), '37.123457,-122.987654');
  });

  await t.test('returns null for invalid inputs', () => {
    assert.equal(buildDirectionsUrl(NaN, 0), null);
    assert.equal(buildDirectionsUrl(0, Infinity), null);
    assert.equal(buildDirectionsUrl(91, 0), null);
    assert.equal(buildDirectionsUrl(0, -181), null);
    assert.equal(buildDirectionsUrl('37.77', -122.41), null);
  });
});

test('buildStreetViewUrl', async (t) => {
  await t.test('builds valid URL with properly encoded query parameters', () => {
    const urlStr = buildStreetViewUrl(37.7749, -122.4194);
    assert.ok(urlStr !== null);
    assert.ok(urlStr.startsWith('https://www.google.com/maps/'));

    const parsed = new globalThis.URL(urlStr);
    assert.equal(parsed.origin, 'https://www.google.com');
    assert.equal(parsed.pathname, '/maps/@');
    assert.equal(parsed.searchParams.get('api'), '1');
    assert.equal(parsed.searchParams.get('map_action'), 'pano');
    assert.equal(parsed.searchParams.get('viewpoint'), '37.7749,-122.4194');
  });

  await t.test('rounds coordinates to 6 decimals', () => {
    const urlStr = buildStreetViewUrl(37.123456789, -122.987654321);
    assert.ok(urlStr !== null);
    const parsed = new globalThis.URL(urlStr);
    assert.equal(parsed.searchParams.get('viewpoint'), '37.123457,-122.987654');
  });

  await t.test('returns null for invalid inputs', () => {
    assert.equal(buildStreetViewUrl(NaN, 0), null);
    assert.equal(buildStreetViewUrl(Infinity, 0), null);
    assert.equal(buildStreetViewUrl(-95, 0), null);
    assert.equal(buildStreetViewUrl(0, 185), null);
    assert.equal(buildStreetViewUrl(null, undefined), null);
  });
});
