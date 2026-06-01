export interface AgentStatus {
  status: "sleeping" | "planning" | "acting";
  capital: number;
  hourlyRate: number;
  lastWoken: string;
  mainStrategy: string;
  updatedAt: string;
}

export interface WealthPlan {
  id: string;
  createdAt: string;
  hourlyHour: number;
  topic: string;
  thoughtProcess: string;
  actionSteps: string[];
  estimatedFeasibility: number;
  simulatedReturn: number;
}

export interface UserMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  ownerId: string;
}
