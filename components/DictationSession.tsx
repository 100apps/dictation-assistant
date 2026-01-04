import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordItem, DictationSettings, PlaybackOrder } from '../types';
import { speakText, cancelSpeech } from '../services/geminiService';

interface DictationSessionProps {
  words: WordItem[];
  settings: DictationSettings;
  onComplete: (playedWords?: WordItem[]) => void;
  onCancel: () => void;
}

const DictationSession: React.FC<DictationSessionProps> = ({ words, settings, onComplete, onCancel }) => {
  // Order words based on settings
  const [playQueue, setPlayQueue] = useState<WordItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // States: IDLE (ready to play), PLAYING (audio on), WAITING (writing time), DONE (finished), ERROR (playback failed), PAUSED (paused)
  const [status, setStatus] = useState<'IDLE' | 'PLAYING' | 'WAITING' | 'DONE' | 'ERROR' | 'PAUSED'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // To handle auto-repeat logic per word
  const [repeatCount, setRepeatCount] = useState(0);

  const mountedRef = useRef(true);
  const waitResolveRef = useRef<(() => void) | null>(null);
  const playCurrentWordRef = useRef<(() => Promise<void>) | null>(null);
  const isPausedRef = useRef(false);
  const pauseResolveRef = useRef<(() => void) | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Queue
  useEffect(() => {
    console.log('Initializing queue with', words.length, 'words');
    let queue = [...words];
    if (settings.order === PlaybackOrder.REVERSE) {
      queue.reverse();
    } else if (settings.order === PlaybackOrder.SHUFFLE) {
      queue = queue.sort(() => Math.random() - 0.5);
    }
    setPlayQueue(queue);
    setStatus('IDLE');
    console.log('Queue initialized, status set to IDLE');
  }, [words, settings.order]);

  // Main Loop
  const playCurrentWord = useCallback(async () => {
    console.log('playCurrentWord called, index:', currentIndex, 'queue length:', playQueue.length);
    if (currentIndex >= playQueue.length) {
      setStatus('DONE');
      setTimeout(() => onComplete(playQueue), 1000);
      return;
    }

    const word = playQueue[currentIndex];
    console.log('Playing word:', word.text);
    setError(null);

    try {
      // 1. Play Audio (Imperative call now)
      console.log('Setting status to PLAYING');
      setStatus('PLAYING');

      // Delay slightly to ensure UI updates or previous speech clears
      console.log('Waiting 300ms...');
      await new Promise(r => setTimeout(r, 300));

      console.log('Calling speakText with:', word.text, settings.voice);
      await speakText(word.text, settings.voice);
      console.log('speakText completed');

      // 2. Handle Repeats
      if (repeatCount < settings.autoRepeat - 1) {
        setRepeatCount(prev => prev + 1);
        // Small pause between repeats
        setTimeout(() => playCurrentWord(), 800);
        return;
      }

      // 3. Waiting Interval (Writing time)
      setStatus('WAITING');
      setTimeLeft(settings.intervalSeconds);

      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      intervalIdRef.current = interval;

      // Wait for the full interval OR skip OR pause
      await new Promise<void>(resolve => {
        const timerId = setTimeout(resolve, settings.intervalSeconds * 1000);
        waitResolveRef.current = () => {
          clearTimeout(timerId);
          resolve();
        };
        pauseResolveRef.current = resolve;
      });

      clearInterval(interval);
      intervalIdRef.current = null;
      waitResolveRef.current = null;
      pauseResolveRef.current = null;

      // 4. Move to Next
      setRepeatCount(0);
      setCurrentIndex(prev => prev + 1);

      // Reset status to IDLE to trigger the useEffect for the next word
      setStatus('IDLE');

    } catch (err: any) {
      console.error("Playback error:", err);
      setError(err.message || "播放失败，请检查语音设置");
      setStatus('ERROR'); // Stop the loop and show error state
    }
  }, [currentIndex, playQueue, settings, repeatCount, onComplete]);

  // Store the function in ref
  useEffect(() => {
    playCurrentWordRef.current = playCurrentWord;
  }, [playCurrentWord]);

  // Trigger play when index changes or start
  useEffect(() => {
    console.log('Effect triggered - status:', status, 'playQueue length:', playQueue.length);
    // Only trigger if status is IDLE and we have words.
    // This prevents double-triggering if playCurrentWord is running.
    if (status === 'IDLE' && playQueue.length > 0) {
      console.log('Calling playCurrentWord from effect');
      playCurrentWordRef.current?.();
    }
  }, [status, playQueue.length, currentIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancelSpeech(); // Stop speaking if component unmounts
    };
  }, []);

  const handleFinishEarly = () => {
    cancelSpeech();
    // Include the current word in the correction list if we've started playing it
    const playedWords = playQueue.slice(0, currentIndex + 1);
    onComplete(playedWords);
  };

  const handleSkipWait = () => {
    setTimeLeft(0);
    if (waitResolveRef.current) {
      waitResolveRef.current();
    }
  };

  const handleRetry = () => {
    setStatus('IDLE'); // This will trigger useEffect -> playCurrentWord
  };

  const handlePause = () => {
    isPausedRef.current = true;
    cancelSpeech();
    setStatus('PAUSED');
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setStatus('WAITING');
    // Resume the pause loop by resolving the pause promise
    if (pauseResolveRef.current) {
      pauseResolveRef.current();
      pauseResolveRef.current = null;
    }
  };

  const progress = Math.round(((currentIndex) / playQueue.length) * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-2 md:p-6">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden relative min-h-[400px] md:min-h-[500px] flex flex-col">
        {/* Progress Bar */}
        <div className="w-full h-2 bg-gray-100">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center space-y-8">

          <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            第 {Math.min(currentIndex + 1, playQueue.length)} / {playQueue.length} 个
          </div>

          <div className="relative">
            {/* Visual Indicator */}
            <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-all duration-300 ${status === 'PLAYING'
              ? 'bg-indigo-100 text-indigo-600 scale-110 shadow-indigo-200 shadow-xl'
              : status === 'WAITING'
                ? 'bg-amber-100 text-amber-600'
                : status === 'PAUSED'
                  ? 'bg-blue-100 text-blue-600'
                  : status === 'ERROR'
                    ? 'bg-red-50 text-red-500'
                    : 'bg-gray-100 text-gray-400'
              }`}>

              {status === 'PLAYING' && (
                <svg className="w-16 h-16 md:w-24 md:h-24 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}

              {status === 'WAITING' && (
                <span className="text-4xl md:text-6xl font-mono font-bold">{timeLeft}</span>
              )}

              {status === 'PAUSED' && (
                <svg className="w-16 h-16 md:w-24 md:h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              )}

              {status === 'ERROR' && (
                <svg className="w-12 h-12 md:w-16 md:h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}

              {(status === 'IDLE' || status === 'DONE') && (
                <svg className="w-10 h-10 md:w-14 md:h-14 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
              )}
            </div>

            {status === 'WAITING' && (
              <div className="absolute -bottom-10 left-0 right-0 text-center text-sm md:text-base text-amber-600 font-medium animate-bounce">
                请写下来！
              </div>
            )}
          </div>

          <div className="h-12 flex flex-col items-center justify-center">
            {error && (
              <div className="flex flex-col items-center">
                <p className="text-red-500 text-sm md:text-base font-medium mb-2">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-1 bg-red-100 text-red-600 rounded-full text-sm font-bold hover:bg-red-200 transition-colors"
                >
                  重试
                </button>
              </div>
            )}
            {status === 'PLAYING' && <p className="text-indigo-500 font-medium">请仔细听...</p>}
            {status === 'PAUSED' && <p className="text-blue-500 font-medium">已暂停</p>}
            {status === 'DONE' && <p className="text-green-500 font-bold text-xl">听写完成！</p>}
          </div>

        </div>

        {/* Controls */}
        <div className="p-4 md:p-6 bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleFinishEarly}
            className="text-gray-500 hover:text-indigo-600 font-medium transition-colors px-4 py-2"
          >
            结束听写
          </button>

          <div className="flex gap-2">
            {/* Pause/Resume Button - Show during PLAYING or WAITING */}
            {(status === 'PLAYING' || status === 'WAITING') && (
              <button
                onClick={handlePause}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors px-4 py-2"
              >
                暂停
              </button>
            )}

            {/* Resume Button - Show during PAUSED */}
            {status === 'PAUSED' && (
              <button
                onClick={handleResume}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors px-4 py-2"
              >
                继续
              </button>
            )}

            {/* Skip Button - Show during WAITING (unless paused) */}
            {status === 'WAITING' && (
              <button
                onClick={handleSkipWait}
                className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors px-4 py-2"
              >
                跳过等待
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DictationSession;