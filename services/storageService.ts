import { WordItem, DictationSettings, DEFAULT_SETTINGS } from '../types';

const WORDS_KEY = 'dictation_words';
const SETTINGS_KEY = 'dictation_settings';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const saveWords = (words: WordItem[]) => {
  localStorage.setItem(WORDS_KEY, JSON.stringify(words));
};

export const loadWords = (): WordItem[] => {
  const data = localStorage.getItem(WORDS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveSettings = (settings: DictationSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const loadSettings = (): DictationSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (!data) return DEFAULT_SETTINGS;

  // Merge with default to handle new fields (like silenceThreshold) for existing users
  const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  const safePerChar = Number.isFinite(merged.perCharInterval) ? clamp(merged.perCharInterval, 1, 10) : DEFAULT_SETTINGS.perCharInterval;

  return { ...merged, perCharInterval: safePerChar };
};

// Spaced Repetition Logic (Modified based on user request)
// Correct = Mastered (Long interval)
// Incorrect = Needs Review (Immediate interval)
export const calculateNextReview = (word: WordItem, isCorrect: boolean): WordItem => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let { streak, easeFactor, interval, totalAttempts, totalWrong, lastWrongAt } = word;

  // Initialize stats if they don't exist (migration)
  totalAttempts = (totalAttempts || 0) + 1;
  totalWrong = totalWrong || 0;
  // lastWrongAt stays as is unless updated below

  if (isCorrect) {
    // Logic Changed: Correct now implies "Mastered".
    // We set streak to a high value (e.g., 10) so it appears as Mastered in UI (since >3 is mastered).
    // We set a longer interval (e.g., 14 days) so it doesn't appear in review soon.
    streak = Math.max(streak + 1, 10);
    // If it was already a long interval, keep it, otherwise jump to 14 days
    interval = interval > 14 ? Math.round(interval * 1.3) : 14;

    // Ease factor adjusts slightly
    easeFactor = Math.max(1.3, easeFactor + 0.1);
  } else {
    // Logic: Incorrect implies "Needs Review"
    streak = 0;
    interval = 0; // Review again immediately
    easeFactor = Math.max(1.3, easeFactor - 0.2);

    // Update stats for smart review
    totalWrong += 1;
    lastWrongAt = now;
  }

  // Calculate next review timestamp. 
  // If interval is 0 (wrong answer), we set nextReview to NOW so it appears in "Due" list immediately.
  // Otherwise we add the interval days.
  const nextReviewTime = interval === 0 ? now : now + (interval * ONE_DAY);

  return {
    ...word,
    lastReviewed: now,
    nextReview: nextReviewTime,
    streak,
    easeFactor,
    interval,
    totalAttempts,
    totalWrong,
    lastWrongAt
  };
};