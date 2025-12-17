export interface WeeklyGoalInput {
  text: string;
}

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface DayPlan {
  dayName: string; // e.g., "Monday"
  tasks: TaskItem[];
  contentIdeas: string[]; // 1-2 ideas per day
}

export interface WeeklyPlan {
  id: string;
  createdAt: number;
  originalGoal: string;
  refinedGoal?: string; // The AI-summarized version of the goal
  days: DayPlan[];
}

// API Response Types
export interface ApiDayPlan {
  dayName: string;
  tasks: string[];
  contentIdeas: string[];
}

export interface ApiWeeklyPlanResponse {
  refinedGoal: string; // New field for the summarized goal
  schedule: ApiDayPlan[];
}

// User Configuration
export type ApiProvider = 'gemini' | 'openai';

export interface AppSettings {
  provider: ApiProvider; // 'gemini' or 'openai'
  apiKey: string;
  model: string;
  timezone: string;
  baseUrl?: string; // Optional custom base URL for OpenAI-compatible APIs
}