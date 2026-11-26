import type { ActionDifficulty, Difficulty } from '../app/settings.ts';
import type { AnswerMode, Question, UnitId } from './math.ts';
import { makeQuestions } from './math.ts';

export type Material = 'wood' | 'stone';
export type SessionMode = 'tutorial' | 'mining' | 'obby' | 'bridge';
export interface SessionOptions {
  mode: SessionMode; unitIds: UnitId[]; difficulty: Difficulty; actionDifficulty: ActionDifficulty;
  count: 1 | 3 | 5 | 10; answerMode: AnswerMode; rewardMaterial: Material;
  originScreen: 'title' | 'world';
}
export interface Attempt {
  instanceId: string; unitId: UnitId; skillId: string; difficulty: Difficulty;
  firstSubmittedCorrect: boolean | null; hintBeforeFirst: boolean;
  wrongCount: number; hintCount: number; guidedUsed: boolean;
  resolved: boolean; resolvedWithHelp: boolean; activeResponseMs: number;
  attemptCount: number; timestamp: string;
}
export interface Session extends SessionOptions {
  id: string; questions: Question[]; questionIndex: number;
  status: 'active' | 'suspended' | 'completed' | 'abandoned';
  checkpointId: number; gateReady: boolean; attempts: Attempt[];
  clearedInstanceIds: string[]; completionRewardGranted: boolean;
  earned: { coin: number; wood: number; stone: number; xp: number };
}
export const bonus = { 1: { coin: 0, material: 0 }, 3: { coin: 10, material: 2 },
  5: { coin: 20, material: 5 }, 10: { coin: 40, material: 10 } };

export function createSession(id: string, options: SessionOptions): Session {
  const questions = makeQuestions(id, options.unitIds, options.count, options.difficulty, options.answerMode, options.mode);
  return {
    ...options, id, questions, questionIndex: 0, status: 'active', checkpointId: 0,
    gateReady: options.mode !== 'obby', attempts: [newAttempt(questions[0])],
    clearedInstanceIds: [], completionRewardGranted: false, earned: { coin: 0, wood: 0, stone: 0, xp: 0 },
  };
}

export function newAttempt(question: Question): Attempt {
  return {
    instanceId: question.instanceId, unitId: question.unitId, skillId: question.skillId, difficulty: question.difficulty,
    firstSubmittedCorrect: null, hintBeforeFirst: false, wrongCount: 0, hintCount: 0,
    guidedUsed: false, resolved: false, resolvedWithHelp: false, activeResponseMs: 0,
    attemptCount: 0, timestamp: new Date().toISOString(),
  };
}
