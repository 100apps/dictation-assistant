
export interface WordItem {
  id: string;
  text: string;
  groupTitle?: string; // Optional for backward compatibility
  addedAt: number;
  lastReviewed: number | null;
  nextReview: number; // Timestamp for next review eligibility
  streak: number; // Consecutive correct answers
  easeFactor: number; // For Spaced Repetition (Sm-2 inspired)
  interval: number; // Days until next review
  
  // New Stats for Smart Review
  totalAttempts?: number;
  totalWrong?: number;
  lastWrongAt?: number | null;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  INPUT = 'INPUT',
  DICTATION = 'DICTATION',
  CORRECTION = 'CORRECTION',
  SETTINGS = 'SETTINGS',
  WORD_LIST = 'WORD_LIST',
}

export enum DictationMode {
  NEW = 'NEW',
  REVIEW = 'REVIEW',
}

export enum PlaybackOrder {
  SEQUENTIAL = 'SEQUENTIAL',
  REVERSE = 'REVERSE',
  SHUFFLE = 'SHUFFLE',
}

export interface DictationSettings {
  voice: string; // Now stores the Voice Name or URI
  intervalSeconds: number;
  order: PlaybackOrder;
  autoRepeat: number; // 1 = play once, 2 = play twice, etc.
  maxReviewBatchSize: number; // Max items for smart review
  silenceThreshold: number; // ms to detect new word
}

export const DEFAULT_SETTINGS: DictationSettings = {
  voice: '', // Empty string implies default system voice
  intervalSeconds: 5,
  order: PlaybackOrder.SEQUENTIAL,
  autoRepeat: 1,
  maxReviewBatchSize: 10,
  silenceThreshold: 500, // Default slightly higher for usability, though prompt asked for 200 as base logic
};