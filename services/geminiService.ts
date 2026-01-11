// This service now wraps the native browser SpeechSynthesis API
// We keep the file name to avoid breaking imports in other files, 
// but the implementation is purely local.

// Fix for Chrome Garbage Collection issue where onend doesn't fire
// We must keep the utterance in memory globally
const activeUtterances: Set<SpeechSynthesisUtterance> = new Set();

// Track if TTS has been warmed up
let ttsWarmedUp = false;

/**
 * Warm up TTS engine - required on iPad Safari before first real speech
 * This speaks a silent/empty utterance to "wake up" the speech engine
 */
export const warmupTTS = async (): Promise<void> => {
  if (ttsWarmedUp) {
    console.log('TTS already warmed up');
    return;
  }

  if (!('speechSynthesis' in window)) {
    return;
  }

  console.log('Warming up TTS engine...');

  try {
    // Ensure voices are loaded first
    await ensureVoicesLoaded();

    // Speak a silent utterance to wake up the engine
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0; // Silent

    // Add to active set to prevent GC
    activeUtterances.add(utterance);

    return new Promise<void>((resolve) => {
      utterance.onend = () => {
        console.log('TTS warmup complete');
        ttsWarmedUp = true;
        activeUtterances.delete(utterance);
        resolve();
      };

      utterance.onerror = () => {
        console.log('TTS warmup error (may be normal)');
        ttsWarmedUp = true; // Still mark as done
        activeUtterances.delete(utterance);
        resolve();
      };

      // Timeout fallback
      setTimeout(() => {
        if (!ttsWarmedUp) {
          console.log('TTS warmup timeout');
          ttsWarmedUp = true;
          activeUtterances.delete(utterance);
          resolve();
        }
      }, 1000);

      window.speechSynthesis.speak(utterance);
    });
  } catch (e) {
    console.warn('TTS warmup failed:', e);
    ttsWarmedUp = true; // Mark as done anyway
  }
};

// Ensure voices are loaded before first use
const ensureVoicesLoaded = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      console.log('Voices already loaded:', voices.length);
      resolve(voices);
      return;
    }

    console.log('Waiting for voices to load...');

    let resolved = false;
    const resolveOnce = (voices: SpeechSynthesisVoice[], source: string) => {
      if (resolved) return;
      resolved = true;
      console.log(`Voices loaded via ${source}:`, voices.length);
      window.speechSynthesis.onvoiceschanged = null;
      resolve(voices);
    };

    // Wait for voiceschanged event
    window.speechSynthesis.onvoiceschanged = () => {
      const loadedVoices = window.speechSynthesis.getVoices();
      if (loadedVoices.length > 0) {
        resolveOnce(loadedVoices, 'voiceschanged event');
      }
    };

    // Polling fallback for iPad Safari - voiceschanged may never fire
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds total
    const pollInterval = setInterval(() => {
      attempts++;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        clearInterval(pollInterval);
        resolveOnce(voices, `polling (attempt ${attempts})`);
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.warn('No voices found after polling, resolving with empty array');
        resolveOnce([], 'timeout');
      }
    }, 100);
  });
};

export const speakText = async (text: string, voiceName: string): Promise<void> => {
  if (!('speechSynthesis' in window)) {
    throw new Error("您的浏览器不支持语音合成功能");
  }

  console.log('Starting speech for:', text, 'with voice:', voiceName);

  // Ensure voices are loaded
  const voices = await ensureVoicesLoaded();

  if (voices.length === 0) {
    console.error('No voices available!');
    throw new Error("未找到可用的语音，请检查系统语音设置");
  }

  return new Promise((resolve, reject) => {
    // Cancel any ongoing speech to ensure clean state
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Add to set to prevent Garbage Collection
    activeUtterances.add(utterance);

    // Find the voice - with fallback strategy for Safari compatibility
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (voiceName && voiceName.trim() !== '') {
      selectedVoice = voices.find(v => v.name === voiceName);
    }

    // Fallback 1: If voice not found or empty, prefer Chinese voices
    if (!selectedVoice) {
      console.warn(`未找到语音: ${voiceName}，使用中文语音`);
      selectedVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    }

    // Fallback 2: If no Chinese voice, use first available
    if (!selectedVoice) {
      console.warn('未找到中文语音，使用第一个可用语音');
      selectedVoice = voices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('Using voice:', selectedVoice.name, selectedVoice.lang);
    }

    // Attempt to set lang based on text (defaults to zh-CN if not specified)
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9; // Slightly slower for dictation clarity

    let settled = false;
    let speechStarted = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      settled = true;
      clearTimeout(timeoutId);
      activeUtterances.delete(utterance);
    };

    utterance.onstart = () => {
      console.log('Speech started');
      speechStarted = true;
    };

    utterance.onend = () => {
      if (settled) return;
      console.log('Speech ended successfully');
      cleanup();
      resolve();
    };

    utterance.onerror = (e) => {
      if (settled) return;
      console.error("Speech synthesis error:", e.error, e);
      cleanup();

      // On some browsers, cancelling triggers an error, we can treat it as resolved or ignore
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`语音播放失败 (${e.error})`));
      }
    };

    // Safety timeout - if speech doesn't start within 5s, assume it's stuck (iPad Safari issue)
    timeoutId = setTimeout(() => {
      if (settled) return;
      if (!speechStarted) {
        console.warn('Speech did not start within 5s, assuming stuck - please configure TTS in settings');
        cleanup();
        reject(new Error('语音引擎无响应，请到设置页面选择适配的 TTS 引擎'));
      }
    }, 5000);

    try {
      console.log('Calling speechSynthesis.speak()...');
      window.speechSynthesis.speak(utterance);
      console.log('speechSynthesis.speak() called, speaking:', window.speechSynthesis.speaking, 'pending:', window.speechSynthesis.pending);
    } catch (err) {
      console.error('Error calling speak():', err);
      activeUtterances.delete(utterance);
      reject(err);
    }
  });
};

export const cancelSpeech = () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    activeUtterances.clear();
  }
};

// Helper to get available voices (used in Settings)
export const getSystemVoices = (): SpeechSynthesisVoice[] => {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
};
