import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestedLevels, orderedLevels, snapshotForLevel } from '../app/difficulty-levels.ts';

test('suggested levels start at five and remain expandable without losing IDs', () => {
  const suggested = createSuggestedLevels();
  assert.equal(suggested.length, 5);
  const extended = orderedLevels([...suggested, ...Array.from({ length: 4 }, (_, index) => ({
    id: `added-${index}`, order: suggested.length + index, name: '', activity: `Practice ${index}`, target: '', criteria: '',
  }))]);
  assert.equal(extended.length, 9);
  assert.equal(extended[5].id, 'added-0');
  assert.equal(new Set(extended.map(level => level.id)).size, extended.length);
});

test('completion snapshot follows the active stable ID and updated position', () => {
  const levels = createSuggestedLevels().map((level, index) => ({ ...level, activity: `Level action ${index + 1}`, target: `${index + 1} minutes` }));
  const activeId = levels[3].id;
  const reordered = orderedLevels([levels[3], levels[0], levels[1], levels[2], levels[4]]);
  const snapshot = snapshotForLevel(reordered, activeId);
  assert.equal(snapshot.level_number, 1);
  assert.equal(snapshot.id, activeId);
  assert.equal(snapshot.target, '4 minutes');
});
