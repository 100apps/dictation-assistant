import React, { useRef, useEffect, useState } from 'react';
import { DictationSettings, PlaybackOrder } from '../types';
import { getSystemVoices, speakText } from '../services/geminiService';
import { requestNotificationPermission, getNotificationPermissionState } from '../services/notificationService';

interface SettingsViewProps {
  settings: DictationSettings;
  onUpdateSettings: (s: DictationSettings) => void;
  onBack: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings, onBack, onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // Load voices and permissions
  useEffect(() => {
    setNotifPermission(getNotificationPermissionState());

    const loadVoices = () => {
      const voices = getSystemVoices();
      // Prioritize Chinese voices, then English, then others
      const sorted = voices.sort((a, b) => {
        const aZh = a.lang.includes('zh') || a.lang.includes('CN');
        const bZh = b.lang.includes('zh') || b.lang.includes('CN');
        if (aZh && !bZh) return -1;
        if (!aZh && bZh) return 1;
        return a.name.localeCompare(b.name);
      });

      // 去重，基于语音名称
      const unique = sorted.filter((voice, index, self) =>
        index === self.findIndex(v => v.name === voice.name)
      );

      setAvailableVoices(unique);
    };

    loadVoices();

    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTestVoice = (voiceName: string) => {
    speakText("听写小助手", voiceName);
    onUpdateSettings({ ...settings, voice: voiceName });
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? 'granted' : 'denied');
  };

  const perChar = settings.perCharInterval.toFixed(1);
  const exampleEnglish = ((7 * settings.perCharInterval) / 2).toFixed(1);
  const exampleChinese = (2 * settings.perCharInterval).toFixed(1);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-2 md:p-6">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden relative min-h-[400px] md:min-h-[500px] flex flex-col">
        {/* 头部 */}
        <div className="p-4 md:p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">设置</h2>
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors p-2">
            ✕
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

          {/* Notification Permission */}
          <div className="bg-indigo-50 p-4 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-800">复习提醒</h3>
              <p className="text-xs text-gray-500 mt-1">根据遗忘曲线提醒复习</p>
            </div>
            {notifPermission === 'granted' ? (
              <span className="text-green-600 font-bold text-sm bg-green-100 px-3 py-1 rounded-full flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                已开启
              </span>
            ) : (
              <button
                onClick={handleRequestPermission}
                className="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {notifPermission === 'denied' ? '权限已禁止' : '开启提醒'}
              </button>
            )}
          </div>

          {/* Voice Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">发音人 (本地语音)</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {availableVoices.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  未检测到语音包，请检查系统设置。
                </div>
              )}
              {availableVoices.map((v) => (
                <button
                  key={v.name}
                  onClick={() => handleTestVoice(v.name)}
                  className={`w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 transition-all text-left ${settings.voice === v.name
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'hover:bg-gray-50 text-gray-700'
                    }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{v.name}</span>
                    <span className="text-xs text-gray-400">{v.lang}</span>
                  </div>
                  {settings.voice === v.name && <span className="text-indigo-600 font-bold">✓</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">提示：如果没有中文语音，请在电脑或手机的系统设置中添加“中文语音包”。</p>
          </div>

          {/* Per Character Interval Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              每字间隔: <span className="text-indigo-600 font-bold">{settings.perCharInterval.toFixed(1)}秒</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={settings.perCharInterval}
              onChange={(e) => onUpdateSettings({ ...settings, perCharInterval: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>快 (1秒)</span>
              <span>慢 (10秒)</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              每个中文字=1个单位，每个英文字母=0.5个单位
              <br />
              例如：{perChar}秒/字，"abandon"(7字母) = 7×{perChar}÷2 ≈ {exampleEnglish}秒，"电脑"(2字) = 2×{perChar} ≈ {exampleChinese}秒
            </p>
          </div>

          {/* Silence Threshold Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              录音自动换行间隔 (灵敏度): <span className="text-indigo-600 font-bold">{settings.silenceThreshold || 500}ms</span>
            </label>
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={settings.silenceThreshold || 500}
              onChange={(e) => onUpdateSettings({ ...settings, silenceThreshold: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>极快 (200ms)</span>
              <span>慢 (2秒)</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">录音时，停顿超过此时间会自动换行，开始记录下一个词。</p>
          </div>

          {/* Playback Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">播放顺序</label>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              {Object.values(PlaybackOrder).map((order) => (
                <button
                  key={order}
                  onClick={() => onUpdateSettings({ ...settings, order })}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${settings.order === order
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {order === PlaybackOrder.SEQUENTIAL && '顺序'}
                  {order === PlaybackOrder.REVERSE && '倒序'}
                  {order === PlaybackOrder.SHUFFLE && '随机'}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Repeat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">重复朗读次数</label>
            <div className="flex gap-4">
              {[1, 2, 3].map(count => (
                <button
                  key={count}
                  onClick={() => onUpdateSettings({ ...settings, autoRepeat: count })}
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border transition-all ${settings.autoRepeat === count
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                  {count}x
                </button>
              ))}
            </div>
          </div>

          {/* Smart Review Batch Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              巩固复习每次推荐数量: <span className="text-indigo-600 font-bold">{settings.maxReviewBatchSize || 10}个</span>
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={settings.maxReviewBatchSize || 10}
              onChange={(e) => onUpdateSettings({ ...settings, maxReviewBatchSize: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Data Backup/Restore */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-3">数据备份与恢复</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onExport}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 font-medium hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                导出数据
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 font-medium hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                导入数据
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleFileChange}
              />
            </div>
          </div>

        </div>

        {/* 底部按钮 */}
        <div className="p-4 md:p-6 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onBack}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-md hover:bg-indigo-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;