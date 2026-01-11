import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppView, WordItem, DictationSettings, DEFAULT_SETTINGS, DictationMode } from './types';
import { loadWords, saveWords, loadSettings, saveSettings, calculateNextReview } from './services/storageService';
import { sendNotification, requestNotificationPermission, getNotificationPermissionState } from './services/notificationService';
import { getSystemVoices } from './services/geminiService';
import InputView from './components/InputView';
import DictationSession from './components/DictationSession';
import CorrectionView from './components/CorrectionView';
import SettingsView from './components/SettingsView';
import WordListView from './components/WordListView';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [words, setWords] = useState<WordItem[]>(() => loadWords());
  const [settings, setSettings] = useState<DictationSettings>(() => loadSettings());
  const [avatar, setAvatar] = useState<string>(() => {
    return localStorage.getItem('userAvatar') || '/photo/duoduo.png';
  });

  // Session State
  const [sessionWords, setSessionWords] = useState<WordItem[]>([]);
  // Editing/Viewing State
  const [editingGroupTitle, setEditingGroupTitle] = useState<string | null>(null);
  const [viewingGroupTitle, setViewingGroupTitle] = useState<string | null>(null);

  // Notification Throttling
  const lastNotificationTimeRef = useRef<number>(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Auto-save words to localStorage whenever they change
  useEffect(() => {
    saveWords(words);
    console.log('Words saved to localStorage:', words.length, 'items');
  }, [words]);

  // Auto-save settings to localStorage whenever they change
  useEffect(() => {
    saveSettings(settings);
    console.log('Settings saved to localStorage');
  }, [settings]);

  // Auto-select a default voice for Safari compatibility if voice is empty
  useEffect(() => {
    if (!settings.voice || settings.voice.trim() === '') {
      const loadVoices = () => {
        const voices = getSystemVoices();
        if (voices.length > 0) {
          // Prefer Chinese voices
          const chineseVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
          const defaultVoice = chineseVoice ? chineseVoice.name : voices[0].name;

          console.log('Auto-selecting default voice:', defaultVoice);
          setSettings(prev => ({ ...prev, voice: defaultVoice }));
        }
      };

      // Try immediately
      loadVoices();

      // Also listen for voiceschanged event (in case voices load late)
      const handler = () => loadVoices();
      window.speechSynthesis.onvoiceschanged = handler;

      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, [settings.voice]);

  // --- Notification Logic ---
  useEffect(() => {
    // Check every minute
    const intervalId = setInterval(() => {
      // 1. Check if notifications are allowed
      if (getNotificationPermissionState() !== 'granted') return;

      // 2. Check if user is inactive (tab is hidden)
      // We assume if the tab is visible, the user sees the dashboard red badges.
      // Notifications are primarily for when the user is doing something else.
      if (!document.hidden) return;

      // 3. Throttle: Only notify once per hour to avoid annoyance
      const now = Date.now();
      if (now - lastNotificationTimeRef.current < 60 * 60 * 1000) return;

      // 4. Check for due words
      const dueCount = words.filter(w => w.nextReview <= now).length;

      if (dueCount > 0) {
        sendNotification(
          "听写小助手提醒",
          `根据艾宾浩斯曲线，你有 ${dueCount} 个词语需要现在复习以加深记忆！`
        );
        lastNotificationTimeRef.current = now;
      }
    }, 60 * 1000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [words]);


  // --- Dashboard Logic: Grouping ---

  // Group words by title
  const groupedWords = useMemo(() => {
    const groups: Record<string, WordItem[]> = {};
    words.forEach(word => {
      const title = word.groupTitle || '默认词库';
      if (!groups[title]) groups[title] = [];
      groups[title].push(word);
    });
    // Sort groups by addedAt of the first item (newest first)
    return Object.entries(groups).sort(([, a], [, b]) => b[0].addedAt - a[0].addedAt);
  }, [words]);

  const allDueWords = useMemo(() => {
    const now = Date.now();
    return words.filter(w => w.nextReview <= now);
  }, [words]);

  // Words that have ever been wrong
  const hasHistoryWords = useMemo(() => {
    return words.filter(w => (w.totalWrong || 0) > 0);
  }, [words]);

  const totalLearned = words.filter(w => w.streak > 3).length; // >3 considered mastered for stats

  // Handlers
  const handleStartInput = () => {
    setEditingGroupTitle(null);
    setView(AppView.INPUT);
  };

  const handleOpenSettings = () => setView(AppView.SETTINGS);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setAvatar(result);
        localStorage.setItem('userAvatar', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleSaveWords = (inputWords: string[], title: string) => {
    const now = Date.now();

    if (editingGroupTitle) {
      // --- EDIT MODE ---
      // 1. Filter out words from the OLD group title (to be replaced/merged)
      // 2. Filter out words from OTHER groups (to be kept as is)
      const otherWords = words.filter(w => (w.groupTitle || '默认词库') !== editingGroupTitle);
      const oldGroupWords = words.filter(w => (w.groupTitle || '默认词库') === editingGroupTitle);

      const mergedWords: WordItem[] = [];

      inputWords.forEach(text => {
        // Try to find if this word already existed in the group (by text)
        const existingWord = oldGroupWords.find(w => w.text === text);

        if (existingWord) {
          // Keep existing stats, just update title if it changed
          mergedWords.push({
            ...existingWord,
            groupTitle: title
          });
        } else {
          // It's a new word added during edit
          mergedWords.push({
            id: uuidv4(),
            text,
            groupTitle: title,
            addedAt: now,
            lastReviewed: null,
            nextReview: now,
            streak: 0,
            easeFactor: 2.5,
            interval: 0,
            totalAttempts: 0,
            totalWrong: 0,
            lastWrongAt: null
          });
        }
      });

      setWords([...otherWords, ...mergedWords]);
      setEditingGroupTitle(null);
      setView(AppView.DASHBOARD);

    } else {
      // --- CREATE MODE ---
      const newItems: WordItem[] = inputWords.map(text => ({
        id: uuidv4(),
        text,
        groupTitle: title,
        addedAt: now,
        lastReviewed: null,
        nextReview: now, // Review immediately
        streak: 0,
        easeFactor: 2.5,
        interval: 0,
        totalAttempts: 0,
        totalWrong: 0,
        lastWrongAt: null
      }));

      const updatedWords = [...words, ...newItems];
      setWords(updatedWords);

      // Start dictation immediately with new words
      setSessionWords(newItems);
      setView(AppView.DICTATION);
    }
  };

  const handleEditGroup = (title: string) => {
    setEditingGroupTitle(title);
    setView(AppView.INPUT);
  };

  const handleViewGroup = (title: string) => {
    setViewingGroupTitle(title);
    setView(AppView.WORD_LIST);
  }

  const handleViewDueWords = () => {
    setView(AppView.VIEW_DUE_WORDS);
  };

  const handleViewErrorWords = () => {
    setView(AppView.VIEW_ERROR_WORDS);
  };

  // New generic status toggler
  const handleUpdateWordStatus = (targetWord: WordItem, status: 'REVIEW' | 'MASTERED') => {
    const updated = words.map(w => {
      if (w.id === targetWord.id) {
        if (status === 'MASTERED') {
          // Mark as mastered (high streak, review in 30 days)
          return {
            ...w,
            streak: 10,
            interval: 30,
            nextReview: Date.now() + (30 * 24 * 60 * 60 * 1000),
            lastReviewed: Date.now()
          };
        } else {
          // Reset to new/review
          return {
            ...w,
            streak: 0,
            interval: 0,
            nextReview: Date.now(),
            easeFactor: 2.5 // Reset ease factor too
          };
        }
      }
      return w;
    });
    setWords(updated);
  };

  const handleDeleteWord = (targetWord: WordItem) => {
    if (window.confirm(`确定删除 "${targetWord.text}" 吗？`)) {
      setWords(prev => prev.filter(w => w.id !== targetWord.id));
    }
  };

  const handleStartGlobalReview = () => {
    if (allDueWords.length === 0) return;
    setSessionWords(allDueWords);
    setView(AppView.DICTATION);
  };

  const handleSmartReview = () => {
    // Logic: Prioritize words that have been wrong before.
    // Score = (TotalWrong * Weight) + (TimeSinceLastError * Weight)
    // "错的越多(Wrong Count High)需要复习的频次越高"
    // "离错误的时间越远(Time Diff High)，越需要复习"

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const candidates = words.filter(w => (w.totalWrong || 0) > 0);

    if (candidates.length === 0) {
      alert("您还没有错词记录，太棒了！继续保持！");
      return;
    }

    const sortedCandidates = candidates.sort((a, b) => {
      const wrongA = a.totalWrong || 0;
      const wrongB = b.totalWrong || 0;

      const timeA = a.lastWrongAt ? (now - a.lastWrongAt) : 0;
      const timeB = b.lastWrongAt ? (now - b.lastWrongAt) : 0;

      // Heuristic Score Calculation
      // 1 Wrong point ~= 1 Day of forgetfulness ? Adjust weights as needed.
      // Let's normalize slightly.
      const daysA = timeA / ONE_DAY;
      const daysB = timeB / ONE_DAY;

      const scoreA = (wrongA * 2) + daysA;
      const scoreB = (wrongB * 2) + daysB;

      return scoreB - scoreA; // Descending order
    });

    const limit = settings.maxReviewBatchSize || 10;
    const selected = sortedCandidates.slice(0, limit);

    setSessionWords(selected);
    setView(AppView.DICTATION);
  };

  const handleReviewGroup = (groupWords: WordItem[], onlyErrors: boolean = false) => {
    let targetWords = groupWords;

    if (onlyErrors) {
      const now = Date.now();
      targetWords = groupWords.filter(w => w.nextReview <= now);

      if (targetWords.length === 0) {
        alert("这个单元没有需要复习的错词！");
        return;
      }
    }

    setSessionWords(targetWords);
    setView(AppView.DICTATION);
  };

  const handleDeleteGroup = (title: string) => {
    if (window.confirm(`确定要删除 "${title}" 及其所有词语吗？`)) {
      setWords(prev => prev.filter(w => (w.groupTitle || '默认词库') !== title));
    }
  };

  // Updated to accept partial results
  const handleDictationComplete = (actualWords?: WordItem[]) => {
    if (actualWords && actualWords.length > 0) {
      setSessionWords(actualWords);
    }
    setView(AppView.CORRECTION);
  };

  const handleCorrectionFinish = (results: { id: string; correct: boolean }[]) => {
    setWords(prevWords => {
      const updatedWords = prevWords.map(word => {
        const result = results.find(r => r.id === word.id);
        if (result) {
          return calculateNextReview(word, result.correct);
        }
        return word;
      });
      return updatedWords;
    });
    setView(AppView.DASHBOARD);
  };

  // Import/Export Handlers
  const handleExportData = () => {
    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      words: words,
      // Exclude TTS engine (voice) from export per requirement
      settings: (() => {
        const { voice, ...rest } = settings;
        return rest;
      })()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dictation-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === 'string') {
          const data = JSON.parse(result);

          let importedWordsCount = 0;

          if (data.words && Array.isArray(data.words)) {
            setWords(data.words);
            importedWordsCount = data.words.length;
          }
          if (data.settings && typeof data.settings === 'object') {
            const { voice: _ignored, ...restSettings } = data.settings;
            setSettings(prev => ({ ...prev, ...restSettings }));
          }

          alert(`成功导入 ${importedWordsCount} 个词语！`);
        }
      } catch (err) {
        console.error("Import Error:", err);
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
  };

  // Helper for date formatting
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render Views
  const renderContent = () => {
    switch (view) {
      case AppView.INPUT:
        let initialTitle = undefined;
        let initialWords = undefined;
        if (editingGroupTitle) {
          initialTitle = editingGroupTitle;
          initialWords = words
            .filter(w => (w.groupTitle || '默认词库') === editingGroupTitle)
            .map(w => w.text);
        }

        return (
          <InputView
            onStart={handleSaveWords}
            onCancel={() => {
              setEditingGroupTitle(null);
              setView(AppView.DASHBOARD);
            }}
            initialTitle={initialTitle}
            initialWords={initialWords}
            settings={settings}
          />
        );

      case AppView.SETTINGS:
        return (
          <SettingsView
            settings={settings}
            onUpdateSettings={setSettings}
            onBack={() => setView(AppView.DASHBOARD)}
            onExport={handleExportData}
            onImport={handleImportData}
          />
        );

      case AppView.WORD_LIST:
        const listWords = words.filter(w => (w.groupTitle || '默认词库') === viewingGroupTitle);
        return (
          <WordListView
            title={viewingGroupTitle || '词库列表'}
            words={listWords}
            onBack={() => {
              setViewingGroupTitle(null);
              setView(AppView.DASHBOARD);
            }}
            onUpdateStatus={handleUpdateWordStatus}
            onDeleteWord={handleDeleteWord}
          />
        );

      case AppView.VIEW_DUE_WORDS:
        return (
          <WordListView
            title="全部需复习的词"
            words={allDueWords}
            onBack={() => setView(AppView.DASHBOARD)}
            onUpdateStatus={handleUpdateWordStatus}
            onDeleteWord={handleDeleteWord}
          />
        );

      case AppView.VIEW_ERROR_WORDS:
        return (
          <WordListView
            title="错词记录"
            words={hasHistoryWords}
            onBack={() => setView(AppView.DASHBOARD)}
            onUpdateStatus={handleUpdateWordStatus}
            onDeleteWord={handleDeleteWord}
          />
        );

      case AppView.DICTATION:
        return (
          <DictationSession
            words={sessionWords}
            settings={settings}
            onComplete={handleDictationComplete}
            onCancel={() => setView(AppView.DASHBOARD)}
            onOpenSettings={() => setView(AppView.SETTINGS)}
          />
        );

      case AppView.CORRECTION:
        return <CorrectionView words={sessionWords} onFinish={handleCorrectionFinish} />;

      case AppView.DASHBOARD:
      default:
        return (
          <div className="w-full space-y-4 md:space-y-8 pb-10">
            {/* Header */}
            <header className="relative bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden">
              {/* Decorative Background Elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-24 -translate-x-24 blur-3xl"></div>

              {/* Content */}
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div
                    className="bg-white/20 backdrop-blur-sm p-1 rounded-2xl cursor-pointer hover:bg-white/30 transition-all"
                    onClick={handleAvatarClick}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
                      <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />

                  <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                      听写小助手
                      <span className="text-xl">✨</span>
                    </h1>
                    <p className="text-white/90 text-sm md:text-base font-medium mt-1">今天也要加油鸭！🎯</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={handleStartInput}
                    className="flex-1 md:flex-none py-3 px-5 bg-white text-indigo-600 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    添加词库
                  </button>
                  <button onClick={handleOpenSettings} className="p-3 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
              </div>
            </header>

            {/* Global Stats & Review */}
            <div className="bg-indigo-600 rounded-3xl p-5 md:p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
              <div className="relative z-10 flex flex-col items-start gap-6">
                <div className="w-full flex justify-between items-end">
                  <div>
                    <p className="text-indigo-200 text-sm font-semibold uppercase tracking-wider mb-1">总复习任务</p>
                    <h2 className="text-4xl md:text-5xl font-extrabold">{allDueWords.length} <span className="text-2xl font-normal opacity-80">个词</span></h2>
                    <p className="mt-2 text-indigo-100 text-sm">已掌握 {totalLearned} / {words.length} 个词语</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  {allDueWords.length > 0 && (
                    <div className="flex-1 flex items-stretch gap-2">
                      <button
                        onClick={handleStartGlobalReview}
                        className="flex-1 py-3 px-6 bg-white text-indigo-700 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-50 transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        复习当前标记为错误的词
                      </button>
                      <button
                        onClick={handleViewDueWords}
                        className="relative px-4 py-3 bg-white text-indigo-700 rounded-xl font-bold shadow-lg hover:bg-indigo-50 transition-all flex items-center justify-center"
                        title="查看标记错误的词"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{allDueWords.length}</span>
                      </button>
                    </div>
                  )}

                  {hasHistoryWords.length > 0 && (
                    <div className="flex-1 flex items-stretch gap-2">
                      <button
                        onClick={handleSmartReview}
                        className="flex-1 py-3 px-6 bg-indigo-800 text-indigo-100 border border-indigo-500 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        巩固曾经错过的词
                      </button>
                      <button
                        onClick={handleViewErrorWords}
                        className="relative px-4 py-3 bg-indigo-800 text-indigo-100 border border-indigo-500 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center"
                        title="查看曾经错词列表"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{hasHistoryWords.length}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* Decoration */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-500 rounded-full opacity-50 blur-2xl"></div>
              <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-indigo-700 rounded-full opacity-50 blur-2xl"></div>
            </div>

            {/* Word Groups List */}
            <div className="mt-8">
              <h3 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                我的词库 ({groupedWords.length})
              </h3>

              {groupedWords.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                  <p className="text-gray-400 mb-4">还没有任何词库哦</p>
                  <button onClick={handleStartInput} className="text-indigo-600 font-bold hover:underline">去添加一个吧</button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupedWords.map(([title, groupWords]) => {
                    const groupDue = groupWords.filter(w => w.nextReview <= Date.now()).length;
                    const groupLearned = groupWords.filter(w => w.streak > 3).length;
                    const percent = Math.round((groupLearned / groupWords.length) * 100);
                    const creationTime = groupWords[0] ? formatDate(groupWords[0].addedAt) : '未知';

                    return (
                      <div key={title} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow relative group">

                        {/* Left Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg md:text-xl font-bold text-gray-800 truncate" title={title}>{title}</h4>
                            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md whitespace-nowrap hidden sm:inline-block">
                              创建于: {creationTime}
                            </span>
                          </div>
                          {/* Mobile creation time */}
                          <div className="text-xs text-gray-400 mb-2 sm:hidden">
                            创建于: {creationTime}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            <span className="font-semibold text-gray-700">{groupWords.length} <span className="text-gray-400 font-normal">个词</span></span>
                            <span className="w-px h-3 bg-gray-200"></span>
                            <span className={`${groupDue > 0 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                              {groupDue > 0 ? `${groupDue} 个需复习` : '暂无复习'}
                            </span>
                          </div>

                          {/* Progress */}
                          <div className="flex items-center gap-3 w-full max-w-sm">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                            </div>
                            <span className="text-xs font-bold text-gray-400">{percent}%</span>
                          </div>
                        </div>

                        {/* Right Actions */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2 md:mt-0">
                          <button
                            onClick={() => handleReviewGroup(groupWords, false)}
                            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 shadow-sm transition-all whitespace-nowrap"
                          >
                            开始听写
                          </button>

                          {groupDue > 0 && (
                            <button
                              onClick={() => handleReviewGroup(groupWords, true)}
                              className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              复习错词
                            </button>
                          )}

                          <div className="flex items-center gap-1 sm:ml-2 sm:pl-3 sm:border-l sm:border-gray-100 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50 justify-end">
                            <button
                              onClick={() => handleViewGroup(title)}
                              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="查看/管理词语"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </button>
                            <button
                              onClick={() => handleEditGroup(title)}
                              className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="编辑"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(title)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      <main className="w-full px-2 md:px-4 py-4 md:py-8 min-h-screen flex flex-col">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;