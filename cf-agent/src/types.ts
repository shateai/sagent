export interface Memory {
  id?: string;
  timestamp: string;
  summary: string;
  importance: number; // 1-10
  tags: string[];
}

export interface Goal {
  id?: string;
  title: string;
  createdAt: string;
  suggestedBy: "gemini" | "human";
}

export interface Task {
  id?: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  createdAt: string;
}

export interface Report {
  id?: string;
  timestamp: string;
  thoughts: string;
  report: string;
  nextWakeup: string;
}

export interface AgentSettings {
  nextWakeup: string; // ISO String
  lastWoken: string; // ISO String
  mainStrategy?: string;
}

export interface GeminiOutput {
  thoughts: string;
  newGoals: string[];
  newTasks: Array<{ title: string; priority: "low" | "medium" | "high" }>;
  completedTasks: string[]; // List of task IDs or exact titles completed in this run
  newMemories: Array<{ summary: string; importance: number; tags: string[] }>;
  nextWakeupMinutes: number;
  priority: "low" | "medium" | "high";
  report: string; // Report in styled Markdown for Discord
}

export interface WorkerEnv {
  // Essential configurations
  FIREBASE_PROJECT_ID: string;
  GEMINI_API_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  
  // Optional and secure authorization keys
  CRON_SECRET?: string;
  
  // High security production configurations (supports Service Account Credentials for Firestore REST API)
  FIREBASE_SERVICE_ACCOUNT_JSON?: string; 
}
