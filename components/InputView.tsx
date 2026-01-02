import React, { useState, useRef, useEffect } from 'react';
import { DictationSettings } from '../types';

interface InputViewProps {
  onStart: (words: string[], title: string) => void;
  onCancel: () => void;
  initialTitle?: string;
  initialWords?: string[];
  settings: DictationSettings;
}

const InputView: React.FC<InputViewProps> = ({ onStart, onCancel, initialTitle, initialWords, settings }) => {
  // Default title logic
  const [title, setTitle] = useState(() => {
    if (initialTitle) return initialTitle;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  // Default text logic
  const [text, setText] = useState(() => {
    if (initialWords) return initialWords.join('\n');
    return '';
  });

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestInterimRef = useRef<string>('');
  const manualStopRef = useRef(false);

  const isEditing = !!initialTitle;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Use abort for cleaner exit
      }
    };
  }, []);

  const handleStart = () => {
    // Stop recording if it's active to prevent conflicts
    if (isListening) {
      stopListening();
    }

    const words = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
    if (words.length > 0) {
      onStart(words, title || '未命名词库');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const stopListening = () => {
    manualStopRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // Manual stop should ideally finish the current sentence
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsListening(false);
    setInterimText('');
    latestInterimRef.current = '';
  };

  const cleanAndSplit = (raw: string): string[] => {
    // Replace punctuation with newlines, split, trim, and filter empty strings
    return raw
      .split(/[，,。.;；?？!！、\n]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  };

  const commitInterim = () => {
    if (latestInterimRef.current.trim().length > 0) {
      const newParts = cleanAndSplit(latestInterimRef.current);
      if (newParts.length > 0) {
        setText(prev => {
          const cleanPrev = prev.trim();
          const newBlock = newParts.join('\n');
          return cleanPrev ? `${cleanPrev}\n${newBlock}` : newBlock;
        });
      }
    }
    latestInterimRef.current = '';
    setInterimText('');
  };

  const startListening = () => {
    // Check for speech recognition support (both standard and webkit prefixed)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("您的浏览器不支持语音识别功能。\n\n建议使用：\n• Chrome 浏览器\n• Edge 浏览器\n• Safari 浏览器");
      return;
    }

    manualStopRef.current = false;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true; // IMPORTANT: We need interim results to detect flow

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      // If not manually stopped, restart (logic for auto-splitting often requires restart to clear buffer)
      // Or simple network glitch
      if (!manualStopRef.current) {
        recognition.start();
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error, event);

      // Ignore "no-speech" errors or "aborted" which we intentionally trigger
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      manualStopRef.current = true;
      setIsListening(false);

      // Provide helpful error messages
      switch (event.error) {
        case 'not-allowed':
          alert("❌ 请允许麦克风权限\n\n在浏览器设置中允许此网站使用麦克风。");
          break;
        case 'network':
          alert("❌ 网络错误\n\n语音识别需要网络连接，请检查您的网络。");
          break;
        case 'service-not-allowed':
          alert("❌ 服务不可用\n\n您的浏览器或设备可能不支持语音识别。\n\n建议：\n• 使用 Chrome 或 Edge 浏览器\n• 或手动输入词语");
          break;
        default:
          alert(`❌ 语音识别出错 (${event.error})\n\n请尝试：\n• 重新点击麦克风按钮\n• 或手动输入词语`);
      }
    };

    recognition.onresult = (event: any) => {
      // Get the latest result
      // With continuous=true, results array grows. We look at the last one.
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript;
      const isFinal = lastResult.isFinal;

      // Update refs and UI
      latestInterimRef.current = transcript;
      setInterimText(transcript);

      // Debounce Logic for Silence
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      if (isFinal) {
        // If browser finalized it itself (e.g. very long pause or internal logic)
        commitInterim();
      } else {
        // If it's interim, wait for silence
        const threshold = settings.silenceThreshold || 500; // Use setting or default

        silenceTimerRef.current = setTimeout(() => {
          // Silence detected!
          commitInterim();

          // CRITICAL FIX: Use abort() instead of stop().
          recognition.abort();

        }, threshold);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="w-full h-screen flex items-center justify-center p-2 md:p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-full max-h-screen overflow-hidden">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
          {isEditing ? '编辑词库' : '录入新词'}
        </h2>

        {/* Title Input */}
        <div className="mb-4 flex-shrink-0 px-4 md:px-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">标题 / 日期</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 font-medium"
          />
        </div>

        <p className="text-gray-500 mb-2 text-xs md:text-sm flex-shrink-0 px-4 md:px-6">
          每行输入一个词语。录音时停顿超过<span className="font-bold text-indigo-600">{settings.silenceThreshold || 500}ms</span>会自动换行。
        </p>

        {/* Textarea Container - grows to fill space */}
        <div className="flex-1 flex flex-col min-h-0 mx-4 md:mx-6 mb-4">
          <div className="relative w-full h-full flex flex-col">
            <textarea
              className="flex-1 w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none text-base md:text-lg leading-loose overflow-y-auto block"
              placeholder="苹果&#10;香蕉&#10;计算机"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            {/* Interim Text Overlay (Visual Feedback) */}
            {isListening && interimText && (
              <div className="absolute bottom-4 left-4 right-16 p-2 bg-indigo-100/80 text-indigo-800 rounded-lg backdrop-blur-sm border border-indigo-200 shadow-sm z-10 text-sm md:text-base animate-pulse">
                <span className="font-bold mr-2">正在听:</span>
                {interimText} ...
              </div>
            )}

            {/* Mic Button - positioned absolutely within textarea container */}
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 z-20">
              {isListening && (
                <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-80 animate-pulse">
                  正在录音...
                </span>
              )}
              <button
                onClick={toggleListening}
                className={`p-3 md:p-4 rounded-full shadow-lg transition-all transform duration-200 flex items-center justify-center ${isListening
                  ? 'bg-red-500 text-white hover:bg-red-600 scale-110 ring-4 ring-red-100'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1'
                  }`}
                title={isListening ? "停止录音" : "开始录音"}
              >
                {isListening ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-shrink-0 px-4 md:px-6 pb-3 md:pb-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-6 rounded-xl text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleStart}
            disabled={!text.trim()}
            className="flex-1 py-3 px-6 rounded-xl bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isEditing ? '保存修改' : '开始听写'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputView;