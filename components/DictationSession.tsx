import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordItem, DictationSettings, PlaybackOrder } from '../types';
import { speakText, cancelSpeech } from '../services/geminiService';

interface DictationSessionProps {
  words: WordItem[];
  settings: DictationSettings;
  onComplete: (playedWords?: WordItem[]) => void;
  onCancel: () => void;
}

/**
 * 核心逻辑说明：
 * 
 * 状态流程：
 * IDLE -> PLAYING -> WAITING -> (下一个词) -> IDLE
 *           |
 *           + -> PAUSED (可在PLAYING或WAITING时暂停)
 * 
 * 每个单词的流程：
 * 1. PLAYING: 播放单词(可能重复autoRepeat次)
 * 2. WAITING: 等待用户书写(可跳过或暂停)
 * 3. 移动到下一个单词，状态回到IDLE触发自动播放
 * 
 * 核心设计：
 * - 使用currentRepeatRef来追踪当前单词的播放进度（重复次数）
 * - 使用waitingStartTimeRef来准确追踪等待时间（支持暂停恢复）
 * - 使用timersRef保管所有定时器ID，确保清理
 * - 避免复杂的递归调用，使用简单的条件判断
 */

const DictationSession: React.FC<DictationSessionProps> = ({ words, settings, onComplete, onCancel }) => {
  // ==================== 状态定义 ====================

  // 有序单词列表
  const [playQueue, setPlayQueue] = useState<WordItem[]>([]);

  // 当前播放的单词索引
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // 当前播放状态
  const [status, setStatus] = useState<'IDLE' | 'PLAYING' | 'WAITING' | 'PAUSED' | 'DONE' | 'ERROR'>('IDLE');

  // 错误信息
  const [error, setError] = useState<string | null>(null);

  // 等待倒计时显示
  const [timeLeft, setTimeLeft] = useState(0);

  // ==================== Refs定义 ====================

  // 当前单词已重复的次数（0表示第一次）
  const currentRepeatRef = useRef(0);

  // 等待开始时间戳（用于暂停恢复时计算剩余时间）
  const waitingStartTimeRef = useRef(0);

  // 所有定时器ID，用于清理
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // 是否暂停中
  const isPausedRef = useRef(false);

  // 是否正在播放中（防止重复触发）
  const isPlayingRef = useRef(false);


  // ==================== 工具函数 ====================

  /**
   * 注册定时器，确保cleanup时能清理
   */
  const setTimer = useCallback((fn: () => void, delay: number) => {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  /**
   * 注册计时器，确保cleanup时能清理
   */
  const setInterval_ = useCallback((fn: () => void, interval: number) => {
    const timer = setInterval(fn, interval);
    timersRef.current.push(timer as any);
    return timer;
  }, []);

  /**
   * 清理所有定时器
   */
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current = [];
  }, []);

  // ==================== 初始化 ====================

  useEffect(() => {
    // 初始化播放队列
    let queue = [...words];
    if (settings.order === PlaybackOrder.REVERSE) {
      queue.reverse();
    } else if (settings.order === PlaybackOrder.SHUFFLE) {
      queue = queue.sort(() => Math.random() - 0.5);
    }

    setPlayQueue(queue);
    setCurrentWordIndex(0);
    setStatus('IDLE');
    currentRepeatRef.current = 0;
    isPausedRef.current = false;
    setError(null);

    console.log('DictationSession initialized with', queue.length, 'words');
  }, [words, settings.order]);

  // ==================== 核心播放逻辑 ====================

  /**
   * 播放当前单词（可能重复多次）
   */
  const playCurrentWord = useCallback(async () => {
    // 防止重复播放
    if (isPlayingRef.current) {
      console.log('Already playing, ignoring duplicate call');
      return;
    }

    // 检查是否已完成所有单词
    if (currentWordIndex >= playQueue.length) {
      setStatus('DONE');
      return;
    }

    isPlayingRef.current = true;

    try {
      const word = playQueue[currentWordIndex];
      setError(null);

      // 1. 播放音频
      setStatus('PLAYING');

      // 小延迟确保UI更新
      await new Promise(r => setTimer(r, 300));

      // 如果在等待中被暂停，则不播放
      if (isPausedRef.current) {
        isPlayingRef.current = false;
        return;
      }

      // 执行语音合成
      await speakText(word.text, settings.voice);

      // 如果需要重复播放
      if (currentRepeatRef.current < settings.autoRepeat - 1) {
        currentRepeatRef.current += 1;
        isPlayingRef.current = false;
        // 重复之间的短暂暂停
        setTimer(() => playCurrentWord(), 800);
        return;
      }

      // 2. 进入等待阶段
      currentRepeatRef.current = 0;
      setStatus('WAITING');
      waitingStartTimeRef.current = Date.now();
      setTimeLeft(settings.intervalSeconds);

      // 启动倒计时
      const countdownInterval = setInterval_(() => {
        if (!isPausedRef.current) {
          const elapsed = Math.floor((Date.now() - waitingStartTimeRef.current) / 1000);
          const remaining = Math.max(0, settings.intervalSeconds - elapsed);
          setTimeLeft(remaining);
        }
      }, 1000);

      // 等待指定时间或被中断
      const waitPromise = new Promise<void>(resolve => {
        const checkComplete = () => {
          if (isPausedRef.current) {
            // 暂停中，稍后重新检查
            setTimer(checkComplete, 500);
            return;
          }

          const elapsed = Math.floor((Date.now() - waitingStartTimeRef.current) / 1000);
          if (elapsed >= settings.intervalSeconds) {
            resolve();
          } else {
            // 继续等待
            const remaining = settings.intervalSeconds - elapsed;
            setTimer(checkComplete, remaining * 1000);
          }
        };

        checkComplete();
      });

      await waitPromise;
      clearInterval(countdownInterval);

      // 3. 移动到下一个单词
      setCurrentWordIndex(prev => prev + 1);
      setStatus('IDLE');

    } catch (err: any) {
      console.error('Playback error:', err);
      setError(err.message || '播放失败，请检查语音设置');
      setStatus('ERROR');
    } finally {
      isPlayingRef.current = false;
    }
  }, [currentWordIndex, playQueue, settings, setTimer, setInterval_]);


  // ==================== 自动播放触发 ====================

  useEffect(() => {
    // 当状态变为IDLE且有单词时，自动播放下一个
    if (status === 'IDLE' && playQueue.length > 0 && currentWordIndex < playQueue.length && !isPlayingRef.current) {
      const timer = setTimeout(async () => {
        if (!isPlayingRef.current) {
          await playCurrentWord();
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    // 当所有单词播放完毕时进入DONE状态
    if (status === 'IDLE' && playQueue.length > 0 && currentWordIndex >= playQueue.length) {
      setStatus('DONE');
    }
  }, [status, playQueue.length, currentWordIndex, playCurrentWord]);

  // ==================== 完成处理 ====================

  useEffect(() => {
    // 当进入DONE状态时，立即跳转到订正环节
    if (status === 'DONE') {
      clearAllTimers();
      onComplete(playQueue);
    }
  }, [status, playQueue, onComplete, clearAllTimers]);

  // ==================== 用户操作 ====================

  const handleFinishEarly = () => {
    clearAllTimers();
    cancelSpeech();
    const playedWords = playQueue.slice(0, currentWordIndex + 1);
    onComplete(playedWords);
  };

  const handleSkipWait = () => {
    setTimeLeft(0);
    // 强制跳出等待
    setCurrentWordIndex(prev => prev + 1);
    setStatus('IDLE');
  };

  const handleRetry = () => {
    clearAllTimers();
    setStatus('IDLE');
    currentRepeatRef.current = 0;
  };

  const handlePause = () => {
    isPausedRef.current = true;
    cancelSpeech();
    setStatus('PAUSED');
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setStatus('WAITING');
  };

  // ==================== 清理 ====================

  useEffect(() => {
    return () => {
      clearAllTimers();
      cancelSpeech();
    };
  }, [clearAllTimers]);

  // ==================== 渲染 ====================

  const progress = playQueue.length > 0 ? Math.round((currentWordIndex / playQueue.length) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-2 md:p-6">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden relative min-h-[400px] md:min-h-[500px] flex flex-col">
        {/* 进度条 */}
        <div className="w-full h-2 bg-gray-100">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 主内容 */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center space-y-8">
          {/* 进度信息 */}
          <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
            第 {Math.min(currentWordIndex + 1, playQueue.length)} / {playQueue.length} 个
          </div>

          {/* 状态指示器 */}
          <div className="relative">
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

              {/* 播放中 */}
              {status === 'PLAYING' && (
                <svg className="w-16 h-16 md:w-24 md:h-24 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}

              {/* 等待中 */}
              {status === 'WAITING' && (
                <span className="text-4xl md:text-6xl font-mono font-bold">{timeLeft}</span>
              )}

              {/* 暂停中 */}
              {status === 'PAUSED' && (
                <svg className="w-16 h-16 md:w-24 md:h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              )}

              {/* 错误 */}
              {status === 'ERROR' && (
                <svg className="w-12 h-12 md:w-16 md:h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              )}

              {/* 空闲或完成 */}
              {(status === 'IDLE' || status === 'DONE') && (
                <svg className="w-10 h-10 md:w-14 md:h-14 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
              )}
            </div>

            {/* 提示文字 */}
            {status === 'WAITING' && (
              <div className="absolute -bottom-10 left-0 right-0 text-center text-sm md:text-base text-amber-600 font-medium animate-bounce">
                请写下来！
              </div>
            )}
          </div>

          {/* 状态信息 */}
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

        {/* 控制按钮 */}
        <div className="p-4 md:p-6 bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleFinishEarly}
            className="text-gray-500 hover:text-indigo-600 font-medium transition-colors px-4 py-2"
          >
            结束听写
          </button>

          <div className="flex gap-2">
            {/* 暂停按钮 */}
            {(status === 'PLAYING' || status === 'WAITING') && (
              <button
                onClick={handlePause}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors px-4 py-2"
              >
                暂停
              </button>
            )}

            {/* 继续按钮 */}
            {status === 'PAUSED' && (
              <button
                onClick={handleResume}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors px-4 py-2"
              >
                继续
              </button>
            )}

            {/* 跳过等待按钮 */}
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