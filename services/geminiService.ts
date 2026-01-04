// This service now wraps the native browser SpeechSynthesis API
// We keep the file name to avoid breaking imports in other files, 
// but the implementation is purely local.

// Fix for Chrome Garbage Collection issue where onend doesn't fire
// We must keep the utterance in memory globally
const activeUtterances: Set<SpeechSynthesisUtterance> = new Set();

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

    // Wait for voiceschanged event
    const handler = () => {
      const loadedVoices = window.speechSynthesis.getVoices();
      console.log('Voices loaded:', loadedVoices.length);
      window.speechSynthesis.onvoiceschanged = null;
      resolve(loadedVoices);
    };

    window.speechSynthesis.onvoiceschanged = handler;

    // Fallback timeout - if event doesn't fire in 2s, try anyway
    setTimeout(() => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Voices loaded via timeout:', voices.length);
        window.speechSynthesis.onvoiceschanged = null;
        resolve(voices);
      }
    }, 2000);
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

    // Find the voice
    const selectedVoice = voices.find(v => v.name === voiceName);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('Using voice:', selectedVoice.name, selectedVoice.lang);
    } else {
      console.warn(`未找到语音: ${voiceName}，可用语音:`, voices.map(v => v.name));
      // Use first Chinese voice as fallback
      const chineseVoice = voices.find(v => v.lang.includes('CN'));
      if (chineseVoice) {
        utterance.voice = chineseVoice;
        console.log('Using fallback Chinese voice:', chineseVoice.name);
      }
    }

    // Attempt to set lang based on text (defaults to zh-CN if not specified)
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9; // Slightly slower for dictation clarity

    utterance.onend = () => {
      console.log('Speech ended successfully');
      activeUtterances.delete(utterance);
      resolve();
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e.error, e);
      activeUtterances.delete(utterance);

      // On some browsers, cancelling triggers an error, we can treat it as resolved or ignore
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`语音播放失败 (${e.error})`));
      }
    };

    utterance.onstart = () => {
      console.log('Speech started');
    };

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
