import React, { useState, useEffect } from 'react';
import { AppSettings, ApiProvider } from '../types';
import { validateGeminiConnection } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const TIMEZONES = [
  { value: 'Asia/Shanghai', label: '北京时间 (Asia/Shanghai)' },
  { value: 'Asia/Tokyo', label: '东京时间 (Asia/Tokyo)' },
  { value: 'America/New_York', label: '纽约时间 (America/New_York)' },
  { value: 'America/Los_Angeles', label: '洛杉矶时间 (America/Los_Angeles)' },
  { value: 'Europe/London', label: '伦敦时间 (Europe/London)' },
  { value: 'UTC', label: '协调世界时 (UTC)' },
];

const PROVIDERS: { value: ApiProvider; label: string }[] = [
  { value: 'gemini', label: 'Google Gemini (官方 SDK)' },
  { value: 'openai', label: 'OpenAI 兼容接口 (ChatGPT, DeepSeek, OneAPI等)' },
];

// Model presets based on provider
const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-2.0-pro-exp-0211', label: 'Gemini 2.0 Pro Experimental' },
];

const DEFAULT_OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'deepseek-chat', label: 'DeepSeek V3' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentSettings, onSave }) => {
  const [formData, setFormData] = useState<AppSettings>(currentSettings);
  
  // New state for verification/fetching
  const [isLoading, setIsLoading] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{value: string, label: string}[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(currentSettings);
      setConnectionStatus('idle');
      setStatusMessage('');
    }
  }, [isOpen, currentSettings]);

  // Handle provider change
  const handleProviderChange = (newProvider: ApiProvider) => {
    let newModel = formData.model;
    let newBaseUrl = formData.baseUrl;

    if (newProvider === 'gemini') {
      newModel = 'gemini-2.5-flash';
      newBaseUrl = ''; 
    } else {
      // Switch to OpenAI defaults if current model is a gemini model
      if (newModel.startsWith('gemini')) {
        newModel = 'gpt-4o-mini';
      }
      if (!newBaseUrl) newBaseUrl = 'https://api.openai.com/v1'; 
    }

    setFormData({
      ...formData,
      provider: newProvider,
      model: newModel,
      baseUrl: newBaseUrl
    });
    // Reset fetching state
    setFetchedModels([]);
    setConnectionStatus('idle');
    setStatusMessage('');
  };

  // Logic to verify OpenAI and Fetch Models
  const handleVerifyOpenAI = async () => {
    if (!formData.apiKey) {
      setConnectionStatus('error');
      setStatusMessage('请先输入 API Key');
      return;
    }

    setIsLoading(true);
    setConnectionStatus('idle');
    setStatusMessage('正在连接...');

    try {
      let baseUrl = formData.baseUrl || "https://api.openai.com/v1";
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${formData.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data && Array.isArray(data.data)) {
        const modelsFromApi = data.data.map((m: any) => ({
          value: m.id,
          label: m.id
        })).sort((a: any, b: any) => a.value.localeCompare(b.value));

        if (modelsFromApi.length === 0) throw new Error("未找到模型");

        setFetchedModels(modelsFromApi);
        setConnectionStatus('success');
        setStatusMessage(`验证成功，获取到 ${modelsFromApi.length} 个模型`);
      } else {
        throw new Error("格式错误");
      }
    } catch (error: any) {
      console.error("Fetch models error:", error);
      setConnectionStatus('error');
      setStatusMessage(error.message || "连接失败");
    } finally {
      setIsLoading(false);
    }
  };

  // Logic to verify Gemini
  const handleVerifyGemini = async () => {
    if (!formData.apiKey) {
      setConnectionStatus('error');
      setStatusMessage('请先输入 API Key');
      return;
    }

    setIsLoading(true);
    setConnectionStatus('idle');
    setStatusMessage('正在验证 Key...');

    try {
      await validateGeminiConnection(formData.apiKey);
      setConnectionStatus('success');
      setStatusMessage('验证成功！Key 有效');
    } catch (error: any) {
       console.error("Gemini verify error:", error);
       setConnectionStatus('error');
       setStatusMessage('验证失败，请检查 Key');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const isOpenAI = formData.provider === 'openai';

  // Determine list for Dropdown
  let dropdownOptions = isOpenAI ? DEFAULT_OPENAI_MODELS : GEMINI_MODELS;
  if (isOpenAI && fetchedModels.length > 0) {
    dropdownOptions = fetchedModels;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">设置</h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">服务提供商</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleProviderChange(p.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                    formData.provider === p.value
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-medium ring-1 ring-indigo-500'
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label.split(' ')[0]} <br/> <span className="text-xs opacity-75">{p.value === 'gemini' ? 'Google SDK' : 'OpenAI 协议'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Base URL (Only for OpenAI) */}
          {isOpenAI && (
            <div className="space-y-2 animate-fade-in">
              <label className="block text-sm font-medium text-slate-700">
                API 接口地址 (Base URL)
              </label>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="例如: https://api.deepseek.com/v1"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
              />
            </div>
          )}

          {/* API Key Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              API Key ({isOpenAI ? 'sk-...' : 'Google AI Key'})
            </label>
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={isOpenAI ? "sk-..." : "留空则使用环境变量"}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-mono"
            />
          </div>

          {/* Connection Test Button */}
           <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={isOpenAI ? handleVerifyOpenAI : handleVerifyGemini}
                disabled={isLoading || !formData.apiKey}
                className={`w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  isLoading 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                }`}
              >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      {isOpenAI ? '连接中...' : '验证中...'}
                    </span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {isOpenAI ? '验证链接并获取模型列表' : '验证 API Key 有效性'}
                  </>
                )}
              </button>
              {statusMessage && (
                <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  connectionStatus === 'success' ? 'text-green-700 bg-green-50' : 
                  connectionStatus === 'error' ? 'text-red-700 bg-red-50' : 'text-slate-500'
                }`}>
                  {connectionStatus === 'success' && <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                  {statusMessage}
                </div>
              )}
           </div>

          {/* Model Selection - SPLIT VIEW */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              选择模型
            </label>
            <div className="flex gap-2">
              {/* Left: Dropdown Select */}
              <div className="w-1/2">
                <div className="relative">
                  <select
                    // Try to match current model to list, otherwise show empty/custom indicator
                    value={dropdownOptions.some(o => o.value === formData.model) ? formData.model : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                         setFormData({ ...formData, model: e.target.value })
                      }
                    }}
                    className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white text-sm"
                  >
                    <option value="" disabled>快速选择...</option>
                    {dropdownOptions.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 pl-1">列表选择</p>
              </div>

              {/* Right: Text Input */}
              <div className="w-1/2">
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="模型 ID"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-50"
                />
                <p className="text-[10px] text-slate-400 mt-1 pl-1">实际 ID (可手动修改)</p>
              </div>
            </div>
            {isOpenAI && !fetchedModels.length && (
              <p className="text-xs text-amber-600 mt-1">
                * 提示：如果列表为空，请先点击验证按钮获取模型。
              </p>
            )}
          </div>

          {/* Timezone Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              时区
            </label>
            <div className="relative">
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white text-sm"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
            >
              保存设置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};