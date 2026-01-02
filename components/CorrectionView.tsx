import React, { useState } from 'react';
import { WordItem } from '../types';

interface CorrectionViewProps {
  words: WordItem[];
  onFinish: (results: { id: string; correct: boolean }[]) => void;
}

const CorrectionView: React.FC<CorrectionViewProps> = ({ words, onFinish }) => {
  // Default all to correct
  const [results, setResults] = useState<Record<string, boolean>>(
    Object.fromEntries(words.map(w => [w.id, true]))
  );

  const setStatus = (id: string, status: boolean) => {
    setResults(prev => ({ ...prev, [id]: status }));
  };

  const setAll = (correct: boolean) => {
    setResults(Object.fromEntries(words.map(w => [w.id, correct])));
  };

  const handleFinish = () => {
    const finalResults = Object.entries(results).map(([id, correct]) => ({ id, correct }));
    onFinish(finalResults);
  };

  const correctCount = Object.values(results).filter(Boolean).length;
  const score = Math.round((correctCount / words.length) * 100);

  return (
    <div className="max-w-5xl mx-auto w-full h-full flex flex-col">
      <div className="bg-white p-3 md:p-8 rounded-2xl shadow-lg border border-gray-100 flex-1 flex flex-col">
        <div className="text-center mb-6 md:mb-8 pt-2">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">订正环节</h2>
            <div className={`inline-block px-4 py-1 rounded-full font-bold text-sm transition-colors ${
                score === 100 ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-700'
            }`}>
                得分: {score}%
            </div>
            <p className="text-gray-500 text-sm mt-2">请根据听写情况，标记写错的词语</p>
        </div>

        {/* Global Controls */}
        <div className="flex gap-3 mb-6 md:mb-8">
            
            <button 
                onClick={() => setAll(false)}
                className="flex-1 py-3 bg-red-50 text-red-700 rounded-xl font-bold border border-red-200 hover:bg-red-100 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                全部错误
            </button>
            
            <button 
                onClick={() => setAll(true)}
                className="flex-1 py-3 bg-green-50 text-green-700 rounded-xl font-bold border border-green-200 hover:bg-green-100 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                全部正确
            </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 md:space-y-4">
          {words.map((word) => {
            const isCorrect = results[word.id];
            return (
                <div
                key={word.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 rounded-xl border transition-all gap-3 sm:gap-6 ${
                    isCorrect
                    ? 'border-gray-100 bg-white hover:border-indigo-100 hover:bg-indigo-50/10'
                    : 'border-red-100 bg-red-50'
                }`}
                >
                    <span className={`text-lg md:text-xl font-bold break-all ${isCorrect ? 'text-gray-800' : 'text-red-600 line-through'}`}>
                        {word.text}
                    </span>
                
                    <div className="flex gap-2 w-full sm:w-auto">
                         {/* Wrong Button */}
                        <button
                            onClick={() => setStatus(word.id, false)}
                            className={`flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-lg transition-all flex items-center gap-1 font-bold text-sm ${
                                !isCorrect
                                ? 'bg-red-500 text-white shadow-md ring-2 ring-red-200' 
                                : 'bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-400 hover:border-red-200'
                            }`}
                        >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             写错
                        </button>

                         {/* Correct Button */}
                        <button
                            onClick={() => setStatus(word.id, true)}
                            className={`flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-lg transition-all flex items-center gap-1 font-bold text-sm ${
                                isCorrect
                                ? 'bg-green-500 text-white shadow-md ring-2 ring-green-200' 
                                : 'bg-white border border-gray-200 text-gray-400 hover:bg-green-50 hover:text-green-400 hover:border-green-200'
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            正确
                        </button>
                    </div>
                </div>
            );
          })}
        </div>

        <div className="mt-6 md:mt-8 pt-4 border-t border-gray-100">
          <button
            onClick={handleFinish}
            className="w-full py-3 md:py-4 bg-gray-900 text-white rounded-xl font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 text-base md:text-lg"
          >
            保存订正结果
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorrectionView;