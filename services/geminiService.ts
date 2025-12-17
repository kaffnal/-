import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ApiWeeklyPlanResponse, AppSettings } from "../types";

// --- Google Gemini Schema Definition ---
const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    refinedGoal: {
      type: Type.STRING,
      description: "A professional, concise summary of the remaining goals to be achieved.",
    },
    schedule: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dayName: { type: Type.STRING },
          tasks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          contentIdeas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["dayName", "tasks", "contentIdeas"],
      },
    },
  },
  required: ["refinedGoal", "schedule"],
};

// --- Helper to build prompts (Shared logic) ---
const buildSystemAndUserPrompt = (dateStr: string, goalText: string, isOpenAI = false) => {
  const systemInstruction = `
    你是一个专为创作者服务的专业内容策略AI助手。
    上下文信息：现在是（用户所在时区）：${dateStr}。
    你是一个乐于助人且条理清晰的内容创作效率教练。
    ${isOpenAI ? "IMPORTANT: You MUST return a valid JSON object." : ""}
  `;

  let prompt = `
    用户将提供本周的目标说明。
    你的任务是：
    1. **目标提炼（关键）**：分析用户的输入。如果用户提到某些目标“已经完成”，请**剔除**它们。提取出用户**还需要完成**的核心目标，并将其重写为一段简洁、专业、结果导向的目标陈述（即 refinedGoal）。
    2. **时间感知**：根据今天是 ${dateStr}，**只生成从今天开始到本周日**的日程表。
       - 绝对不要生成今天之前的日期的计划。
       - 如果今天是周日，只生成今天的计划。
    3. **制定计划**：为剩余的每一天制定可操作的清单任务。
    4. **创意灵感**：为每一天生成1-2个具体的、富有创意的选题灵感。
    
    用户的输入："${goalText}"
    
    请务必使用简体中文回复。
  `;

  if (isOpenAI) {
    // For OpenAI, we explicitly describe the JSON structure in the prompt since we can't always rely on strictly enforced Schemas across all 'sk-' providers.
    prompt += `
    \n\n
    **OUTPUT FORMAT REQUIREMENTS:**
    You must output a single valid JSON object strictly following this structure:
    {
      "refinedGoal": "string summary of remaining goals",
      "schedule": [
        {
          "dayName": "string (e.g. 周五)",
          "tasks": ["string", "string"],
          "contentIdeas": ["string", "string"]
        }
      ]
    }
    Do not add Markdown formatting (like \`\`\`json). Just the raw JSON string.
    `;
  }

  return { systemInstruction, prompt };
};

// --- Strategy: Google Gemini SDK ---
const generateWithGemini = async (goalText: string, settings: AppSettings, dateStr: string): Promise<ApiWeeklyPlanResponse> => {
  const apiKeyToUse = settings.apiKey || process.env.API_KEY;
  if (!apiKeyToUse) throw new Error("Gemini API Key is missing.");

  const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
  const { systemInstruction, prompt } = buildSystemAndUserPrompt(dateStr, goalText, false);

  const response = await ai.models.generateContent({
    model: settings.model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      systemInstruction: systemInstruction,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text) as ApiWeeklyPlanResponse;
};

// --- Strategy: Generic OpenAI / Compatible API ---
const generateWithOpenAI = async (goalText: string, settings: AppSettings, dateStr: string): Promise<ApiWeeklyPlanResponse> => {
  const apiKeyToUse = settings.apiKey;
  if (!apiKeyToUse) throw new Error("API Key (sk-...) is required for this provider.");

  // Normalize Base URL (remove trailing slash if present)
  let baseUrl = settings.baseUrl || "https://api.openai.com/v1";
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const endpoint = `${baseUrl}/chat/completions`;

  const { systemInstruction, prompt } = buildSystemAndUserPrompt(dateStr, goalText, true);

  const payload = {
    model: settings.model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt }
    ],
    // Force JSON object mode (Supported by OpenAI, DeepSeek, and most modern endpoints)
    response_format: { type: "json_object" }, 
    temperature: 0.7
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKeyToUse}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from API.");
    }

    // Attempt to parse JSON. 
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '');
    }

    return JSON.parse(jsonStr) as ApiWeeklyPlanResponse;

  } catch (error: any) {
    console.error("OpenAI/Compatible API Error:", error);
    throw error;
  }
};

// --- Connection Validation (New) ---
export const validateGeminiConnection = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) throw new Error("请输入 API Key");
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Use a lightweight model to test the connection
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Ping',
    });
    return true;
  } catch (e: any) {
    console.error("Gemini Validation Failed", e);
    throw new Error(e.message || "验证失败");
  }
}

// --- Main Export ---
export const generateWeeklyPlan = async (goalText: string, settings: AppSettings): Promise<ApiWeeklyPlanResponse> => {
  // Common: Date Calculation
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: settings.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const dateStr = formatter.format(now);

  // Switch Strategy
  if (settings.provider === 'openai') {
    return generateWithOpenAI(goalText, settings, dateStr);
  } else {
    // Default to Gemini
    return generateWithGemini(goalText, settings, dateStr);
  }
};