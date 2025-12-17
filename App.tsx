import React, { useState, useEffect } from 'react';
import { generateWeeklyPlan } from './services/geminiService';
import { WeeklyPlan, DayPlan, TaskItem, ApiWeeklyPlanResponse, AppSettings } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { SettingsModal } from './components/SettingsModal';

const STORAGE_KEY = 'contentflow_plan_v1';
const SETTINGS_KEY = 'contentflow_settings_v2'; // Bump version to force refresh if needed, or handle migration

// Default Settings
const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  timezone: 'Asia/Shanghai',
  baseUrl: ''
};

// Clock Component
const WorldClock = ({ timezone }: { timezone: string }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getFormattedTime = () => {
    try {
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(time);
      const p: Record<string, string> = {};
      parts.forEach(part => p[part.type] = part.value);
      
      // Construct: yyyy-mm-dd 星期x HH:mm:ss
      return `${p.year}-${p.month}-${p.day} ${p.weekday} ${p.hour}:${p.minute}:${p.second}`;
    } catch (e) {
      return "时区错误";
    }
  };

  return (
    <div className="bg-slate-800 text-white text-xs sm:text-sm px-4 py-2 rounded-full shadow-md flex items-center justify-center gap-2 font-mono whitespace-nowrap border border-slate-700">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{getFormattedTime()}</span>
    </div>
  );
};

export default function App() {
  const [goalInput, setGoalInput] = useState('');
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Load data from local storage on mount
  useEffect(() => {
    // Force set title
    document.title = "日程规划小助手";

    // Load Plan
    const savedPlan = localStorage.getItem(STORAGE_KEY);
    if (savedPlan) {
      try {
        setPlan(JSON.parse(savedPlan));
      } catch (e) {
        console.error("Failed to parse saved plan", e);
      }
    }

    // Load Settings
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Merge with default to ensure new fields (like provider/baseUrl) exist if loading old settings
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse saved settings", e);
      }
    }
  }, []);

  // Save to local storage whenever plan changes
  useEffect(() => {
    if (plan) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    }
  }, [plan]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  };

  const handleGenerate = async () => {
    if (!goalInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiResponse: ApiWeeklyPlanResponse = await generateWeeklyPlan(goalInput, settings);
      
      // Transform API response to stateful object
      const newPlan: WeeklyPlan = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        originalGoal: goalInput,
        refinedGoal: apiResponse.refinedGoal,
        days: apiResponse.schedule.map((day, dayIndex) => ({
          dayName: day.dayName,
          contentIdeas: day.contentIdeas,
          tasks: day.tasks.map((taskText, taskIndex) => ({
            id: `day-${dayIndex}-task-${taskIndex}-${Date.now()}`,
            text: taskText,
            completed: false
          }))
        }))
      };

      setPlan(newPlan);
      setGoalInput('');
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes("API Key") || err.message.includes("401"))) {
        setError("API 认证失败。请在设置中检查您的 Key 和接口地址。");
        setIsSettingsOpen(true);
      } else {
        setError(err.message || "生成计划失败，请检查设置。");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTask = (dayIndex: number, taskId: string) => {
    if (!plan) return;

    const newDays = [...plan.days];
    const day = newDays[dayIndex];
    const taskIndex = day.tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex !== -1) {
      day.tasks[taskIndex] = {
        ...day.tasks[taskIndex],
        completed: !day.tasks[taskIndex].completed
      };
      
      setPlan({
        ...plan,
        days: newDays
      });
    }
  };

  const resetPlan = () => {
    if (window.confirm("确定要清空当前的计划吗？此操作无法撤销。")) {
      setPlan(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={handleSaveSettings}
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm/50">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* 
            Flex Wrap Strategy:
            Mobile: 
              - Logo (Order 1) --left
              - Actions (Order 2) --right
              - Clock (Order 3) --center, full width new line
            Desktop (md):
              - Logo (Order 1)
              - Clock (Order 2)
              - Actions (Order 3)
          */}
          <div className="flex flex-wrap items-center justify-between gap-y-3 md:gap-y-0">
            
            {/* 1. Logo & Title (Left) */}
            <div className="flex items-center gap-2 order-1">
              <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">日程规划小助手</h1>
            </div>
            
            {/* 2. Actions (Right on Mobile, Far Right on Desktop) */}
            <div className="flex items-center gap-3 order-2 md:order-3">
              {plan && (
                <button 
                  onClick={resetPlan}
                  className="text-sm text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap font-medium"
                >
                  新建
                </button>
              )}
               {/* Settings Button */}
               <button
                 onClick={() => setIsSettingsOpen(true)}
                 className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-all active:scale-95"
                 title="设置"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                 </svg>
               </button>
            </div>

            {/* 3. Clock (Center Bottom on Mobile, Middle on Desktop) */}
            <div className="w-full flex justify-center order-3 md:w-auto md:order-2 md:mx-auto">
               <WorldClock timezone={settings.timezone} />
            </div>

          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Intro / Input Section */}
        {!plan && !isLoading && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 mb-8 text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">几秒钟内搞定本周内容规划</h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto">
              输入您的目标（例如：“写完科幻小说第三章，发3篇笔记”）。<br/>
              <span className="text-indigo-600 font-medium">您可以告诉小助手哪些已经做完了，小助手会帮忙自动规划剩下的任务！</span>
            </p>
            
            <div className="max-w-xl mx-auto space-y-4">
              <textarea
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="例如：这周我要写5篇文章。周一和周二的文章我已经写好了，帮我规划剩下的..."
                className="w-full p-4 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all resize-none text-lg min-h-[120px]"
              />
              <button
                onClick={handleGenerate}
                disabled={!goalInput.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.01] active:scale-[0.99]"
              >
                生成我的计划 ✨
              </button>
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingSpinner />}

        {/* Results Section */}
        {plan && !isLoading && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center mb-8">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">本周剩余核心目标</p>
              <h2 className="text-2xl font-bold text-slate-800 mt-1">
                {plan.refinedGoal || plan.originalGoal}
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-1">
              {plan.days.map((day, dayIndex) => (
                <div key={dayIndex} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                  {/* Day Header */}
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">{day.dayName}</h3>
                    <span className="text-xs font-medium px-2 py-1 bg-white border border-slate-200 rounded-full text-slate-500">
                      {day.tasks.filter(t => t.completed).length}/{day.tasks.length} 完成
                    </span>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Content Ideas - The "Special" Request */}
                    {day.contentIdeas.length > 0 && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2 text-amber-700">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                          </svg>
                          <span className="font-semibold text-sm uppercase tracking-wide">今日灵感选题</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 ml-1">
                          {day.contentIdeas.map((idea, i) => (
                            <li key={i} className="text-slate-700 text-sm italic">"{idea}"</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tasks Checklist */}
                    <div className="space-y-3">
                      {day.tasks.map((task) => (
                        <div 
                          key={task.id} 
                          className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer group ${
                            task.completed ? 'bg-slate-50' : 'hover:bg-indigo-50/50'
                          }`}
                          onClick={() => toggleTask(dayIndex, task.id)}
                        >
                          <div className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                            task.completed 
                              ? 'bg-indigo-600 border-indigo-600' 
                              : 'border-slate-300 bg-white group-hover:border-indigo-400'
                          }`}>
                            {task.completed && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm leading-6 select-none transition-all ${
                            task.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                          }`}>
                            {task.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}