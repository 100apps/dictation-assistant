import React from 'react';
import { WordItem } from '../types';

interface WordListViewProps {
  title: string;
  words: WordItem[];
  onBack: () => void;
  onUpdateStatus: (word: WordItem, status: 'REVIEW' | 'MASTERED') => void;
  onDeleteWord: (word: WordItem) => void;
}

const WordListView: React.FC<WordListViewProps> = ({ title, words, onBack, onUpdateStatus, onDeleteWord }) => {
  const now = Date.now();

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
           <p className="text-gray-500 text-sm mt-1">共 {words.length} 个词语</p>
        </div>
        <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3">
        {words.length === 0 ? (
             <div className="text-center py-12 text-gray-400">没有词语</div>
        ) : (
            words.map((word) => {
                const isMastered = word.streak > 3;
                const isReview = !isMastered;
                
                // Status labels
                const isDue = word.nextReview <= now && isReview;
                const isNew = word.streak === 0 && word.lastReviewed === null;

                return (
                    <div key={word.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all gap-4">
                        <div className="flex items-center gap-4">
                             {/* Delete Button (Small x) */}
                            <button 
                                onClick={() => onDeleteWord(word)}
                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                title="删除此词"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>

                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-gray-800">{word.text}</span>
                                    {isNew && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-600">新词</span>}
                                    {isDue && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">该复习了</span>}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    熟练度: Lv.{word.streak}
                                </div>
                            </div>
                        </div>

                        {/* Control Buttons */}
                        <div className="flex items-center gap-2">
                             {/* Needs Review Button */}
                            <button
                                onClick={() => onUpdateStatus(word, 'REVIEW')}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1 border ${
                                    isReview
                                    ? 'bg-red-50 border-red-200 text-red-600 shadow-sm ring-1 ring-red-100'
                                    : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                                }`}
                                title="标记为需要复习/生词"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                需复习
                            </button>

                            {/* Mastered Button */}
                            <button
                                onClick={() => onUpdateStatus(word, 'MASTERED')}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1 border ${
                                    isMastered
                                    ? 'bg-green-50 border-green-200 text-green-600 shadow-sm ring-1 ring-green-100'
                                    : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                                }`}
                                title="标记为已掌握，暂停复习"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                已掌握
                            </button>
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
};

export default WordListView;