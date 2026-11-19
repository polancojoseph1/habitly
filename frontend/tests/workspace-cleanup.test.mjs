import test from 'node:test';
import assert from 'node:assert/strict';
import { removeSmokingWorkspaceData } from '../app/workspace-cleanup.ts';

test('workspace cleanup preserves personal habits, logs, and history', () => {
  const workspace = {
    habits: [{ id: 'smoking', name: 'Smoking' }, { id: 'kratom', name: 'Kratom' }],
    behaviorLogs: [{ id: 'urge-1', habitId: 'smoking', outcome: 'resisted' }],
    history: { '2026-11-18': ['smoking', 'kratom'] },
  };

  assert.strictEqual(removeSmokingWorkspaceData(workspace), workspace);
  assert.deepEqual(workspace, {
    habits: [{ id: 'smoking', name: 'Smoking' }, { id: 'kratom', name: 'Kratom' }],
    behaviorLogs: [{ id: 'urge-1', habitId: 'smoking', outcome: 'resisted' }],
    history: { '2026-11-18': ['smoking', 'kratom'] },
  });
});
