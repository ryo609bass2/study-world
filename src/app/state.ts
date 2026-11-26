import { defaultAvatar } from './avatar.ts';
import type { AvatarConfig } from './avatar.ts';
import { defaults } from './settings.ts';
import type { Settings } from './settings.ts';
import { zeroBalance } from '../building/catalog.ts';
import type { Balance, Building, BuildingId, Placement } from '../building/catalog.ts';
import type { Attempt, Session, SessionOptions } from '../learning/session.ts';
import type { WorldId } from '../worlds/maps.ts';
import type { achievements, treasures } from '../progression/levels.ts';

export type TutorialStep = 'move' | 'chest' | 'learn' | 'craft' | 'place' | 'hub' | 'done';

export interface Save {
  schemaVersion: 1;
  revision: number;
  profileId: string;
  updatedAt: string;
  player: { totalXP: number; avatar: AvatarConfig };
  economy: Balance;
  buildings: Building[];
  recipes: BuildingId[];
  world: {
    unlocked: WorldId[]; discoveries: string[]; openedChests: string[];
    nodeCooldownMs: Record<string, number>; repairedBridge: boolean; lastSafeWorldId: WorldId;
  };
  progress: {
    islandStage: 1 | 2; tutorialStep: TutorialStep; counters: Record<'resolved' | 'integers' | 'decimals', number>;
    completedQuestIds: string[]; achievements: (keyof typeof achievements)[]; collectionIds: (keyof typeof treasures)[];
    firstPlacedBuildingIds: BuildingId[];
  };
  learning: {
    attempts: Attempt[]; suspendedSession: Session | null; tutorialSession: Session | null;
    lastMission: SessionOptions | null;
  };
  settings: Settings;
  appliedEventIds: string[];
  undo: { instanceId: string; placement: Placement | null } | null;
}

export function createSave(profileId: string, settings: Settings = defaults, avatar: AvatarConfig = defaultAvatar): Save {
  return {
    schemaVersion: 1, revision: 0, profileId, updatedAt: new Date().toISOString(),
    player: { totalXP: 0, avatar: { ...avatar } }, economy: { ...zeroBalance }, buildings: [], recipes: ['house_small', 'stone_path'],
    world: { unlocked: ['home'], discoveries: [], openedChests: [], nodeCooldownMs: {}, repairedBridge: false, lastSafeWorldId: 'home' },
    progress: { islandStage: 1, tutorialStep: 'move', counters: { resolved: 0, integers: 0, decimals: 0 },
      completedQuestIds: [], achievements: [], collectionIds: [], firstPlacedBuildingIds: [] },
    learning: { attempts: [], suspendedSession: null, tutorialSession: null, lastMission: null },
    settings: { ...settings }, appliedEventIds: [], undo: null,
  };
}
