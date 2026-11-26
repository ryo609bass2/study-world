export type Difficulty = 'basic' | 'standard' | 'advanced';
export type ActionDifficulty = 'assist' | 'standard' | 'advanced';

export interface Settings {
  learningDifficulty: Difficulty;
  actionDifficulty: ActionDifficulty;
  guidance: 'free' | 'standard' | 'support';
  simpleHUD: boolean;
  textScale: 1 | 1.25 | 1.5;
  autoHint: boolean;
  reducedMotion: boolean;
  autoCamera: boolean;
  fallProtection: boolean;
  cameraSensitivity: 'low' | 'medium' | 'high';
  slowMove: boolean;
  leftHanded: boolean;
  bgmVolume: number;
  seVolume: number;
  graphics: 'low' | 'standard' | 'high';
  sessionReminderMinutes: 0 | 5 | 10 | 15;
}

export const defaults: Settings = {
  learningDifficulty: 'standard', actionDifficulty: 'standard', guidance: 'standard',
  simpleHUD: false, textScale: 1, autoHint: true, reducedMotion: false,
  autoCamera: true, fallProtection: true, cameraSensitivity: 'medium', slowMove: false,
  leftHanded: false, bgmVolume: 40, seVolume: 65, graphics: 'low', sessionReminderMinutes: 0,
};

export const support: Settings = {
  ...defaults, learningDifficulty: 'basic', actionDifficulty: 'assist', guidance: 'support',
  simpleHUD: true, textScale: 1.25, reducedMotion: true, slowMove: true,
};

export const difficulties = { basic: '基礎', standard: '標準', advanced: '発展' } as const;
export const actionDifficulties = { assist: 'アシスト', standard: '標準', advanced: '発展' } as const;
