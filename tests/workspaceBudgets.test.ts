import { describe, expect, it } from 'vitest';
import { budgetForWorkspace, scopeStateToWorkspace, withWorkspaceBudget } from '../domain/teams';
import { parseSettingsPrefs } from '../utils/settingsPrefs';
import { buildSettingsSyncPayload } from '../utils/settingsSync';
import { buildStateSegments, mergeStateSegments } from '../utils/statePersistence';
import { mergeRemoteState } from '../services/hydration';
import { createBaseState } from './helpers/stateFactories';
import type { AppState, Budget } from '../types';

const personal: Budget = { monthly: 50000, categoryLimits: { food: 20000 } };
const family: Budget = { monthly: 120000, categoryLimits: {} };

const withBudgets = (): AppState => ({ ...createBaseState(), budget: personal, teamBudgets: { family } });

describe('workspace budgets', () => {
  it('reads the Personal budget or the user\'s own budget for a team', () => {
    const state = withBudgets();
    expect(budgetForWorkspace(state, null)).toEqual(personal);
    expect(budgetForWorkspace(state, 'family')).toEqual(family);
    expect(budgetForWorkspace(state, 'work')).toBeNull();
  });

  it('scopes `budget` to the workspace on screen and leaves Personal as stored', () => {
    const state = withBudgets();
    expect(scopeStateToWorkspace(state, 'family').budget).toEqual(family);
    expect(scopeStateToWorkspace(state, 'work').budget).toBeNull();
    expect(scopeStateToWorkspace(state, null).budget).toEqual(personal);
  });

  it('writes only the slot of the workspace being edited', () => {
    const state = withBudgets();
    const work: Budget = { monthly: 9000, categoryLimits: {} };

    const added = withWorkspaceBudget(state, 'work', work);
    expect(added.teamBudgets).toEqual({ family, work });
    expect(added.budget).toEqual(personal);

    const removed = withWorkspaceBudget(added, 'family', null);
    expect(removed.teamBudgets).toEqual({ work });
    expect(removed.budget).toEqual(personal);

    const personalCleared = withWorkspaceBudget(state, null, null);
    expect(personalCleared.budget).toBeNull();
    expect(personalCleared.teamBudgets).toEqual({ family });
  });

  it('syncs team budgets in settings.prefs and reads them back', () => {
    const payload = buildSettingsSyncPayload(withBudgets());
    expect(payload.prefs?.teamBudgets).toEqual({ family });
    expect(parseSettingsPrefs(payload.prefs).teamBudgets).toEqual({ family });
  });

  it('keeps the local team budgets when the server copy is malformed, and clears them on null', () => {
    expect(parseSettingsPrefs({ teamBudgets: { family: { monthly: -5 } } }).teamBudgets).toBeUndefined();
    expect(parseSettingsPrefs({ teamBudgets: null }).teamBudgets).toEqual({});
    expect(parseSettingsPrefs({}).teamBudgets).toBeUndefined();
  });

  it('persists team budgets on the device', () => {
    const state = withBudgets();
    const restored = mergeStateSegments(createBaseState(), buildStateSegments(state));
    expect(restored.teamBudgets).toEqual({ family });
  });

  it('takes the server team budgets when the settings row was fetched', () => {
    const local = withBudgets();
    const merged = mergeRemoteState(local, {
      state: { teamBudgets: { work: family } },
      failedSlices: [],
      hasSettingsRow: true,
    }, []);
    expect(merged.teamBudgets).toEqual({ work: family });
  });
});
