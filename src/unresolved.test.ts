import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wasUnresolved } from './unresolved.js';

test('a setting the engine names is one whose placeholder found nothing [@spec:unresolved-settings:AC-1]', () => {
  const ctx = { unresolvedSettings: new Set(['customer_id', 'filters.customer', 'lines[2].sku']) };

  assert.equal(wasUnresolved(ctx, 'customer_id'), true);
  assert.equal(wasUnresolved(ctx, 'filters.customer'), true);
  assert.equal(wasUnresolved(ctx, 'lines[2].sku'), true);
  // A neighbour of a named path is not named with it.
  assert.equal(wasUnresolved(ctx, 'filters'), false);
  assert.equal(wasUnresolved(ctx, 'status'), false);
});

test('a setting inside one the engine names found nothing with it [@spec:unresolved-settings:AC-3]', () => {
  const ctx = { unresolvedSettings: new Set(['filters', 'lines[2]']) };

  assert.equal(wasUnresolved(ctx, 'filters.customer'), true);
  assert.equal(wasUnresolved(ctx, 'filters[0]'), true);
  assert.equal(wasUnresolved(ctx, 'lines[2].sku'), true);
  // Only a whole step of the path: these merely start with the same letters.
  assert.equal(wasUnresolved(ctx, 'filtersByDate'), false);
  assert.equal(wasUnresolved(ctx, 'lines[20].sku'), false);
});

test('an engine that names nothing answers no for every setting [@spec:unresolved-settings:AC-2]', () => {
  assert.equal(wasUnresolved({}, 'customer_id'), false);
  assert.equal(wasUnresolved({ unresolvedSettings: new Set() }, 'customer_id'), false);
});
