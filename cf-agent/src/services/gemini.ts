import { GeminiOutput, Goal, Task, Memory, Report } from "../types";

export class GeminiServiceClient {
  private apiKey: string;
  private model: string = "gemini-3.5-flash";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * Generates the autonomous strategic planning action using Gemini 3.5 Flash
   */
  async planNextSteps(
    goals: Goal[],
    tasks: Task[],
    memories: Memory[],
    reports: Report[]
  ): Promise<GeminiOutput> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const systemInstruction = `You are an elite, highly competent, autonomous AI Agent executing long-term wealth, investment, and operational planning.
You run in a continuous loop, waking up periodically to analyze situations, manage memories, complete pending tasks, and plan the future.

YOUR RULES:
1. Carefully evaluate current high-level GOALS. Assess if progress is being made. Suggest new goals ONLY if they strongly align with long-term strategic directions.
2. Review pending TASKS. Determine if any tasks are solved based on recent history or can be marked as completed. Create practical, concrete new tasks to move closer to your goals.
3. Examine past MEMORIES (previous insights, failures, and knowledge) and read the last REPORTS to gain contextual continuity.
4. Record NEW MEMORIES (insights, observations, data points) with an objective importance score (1 to 10) and relevant semantic tags.
5. Schedule your next wakeup delay (nextWakeupMinutes). Choose an optimal interval (usually 30 to 180 minutes) depending on your workload priority. Max 1440 minutes.
6. Write a professional, detailed, human-readable report in Czech language summarising what was accomplished, what you learned, and next actions. This report will be broadcasted to Discord.
7. You MUST reply ONLY with a single valid JSON object strictly matching the schema. No markup outside the JSON structure.

JSON Response Schema:
{
  "thoughts": "String detailing your detailed reasoning, strategy, and self-reflection.",
  "newGoals": ["List of suggested new goals to pursue"],
  "newTasks": [
    { "title": "Specific task title", "priority": "low" | "medium" | "high" }
  ],
  "completedTasks": ["Exactly matching titles or IDs of tasks in the active task list that you resolved in this run."],
  "newMemories": [
    { "summary": "Short concise summary of what was learned or accomplished.", "importance": 8, "tags": ["tag1", "tags2"] }
  ],
  "nextWakeupMinutes": 60,
  "priority": "low" | "medium" | "high",
  "report": "Double-escaped Discord-formatted markdown report in Czech detailing what you accomplished, what tasks were created, and when you wake up next."
}`;

    const prompt = `--- CONTEXT FOR CURRENT CYCLE ---

CURRENT STRATEGIC GOALS:
${goals.length === 0 ? "- None" : goals.map((g) => `- [ID: ${g.id}] ${g.title} (Created: ${g.createdAt})`).join("\n")}

ACTIVE TASK BACKLOG:
${tasks.length === 0 ? "- None" : tasks.map((t) => `- [ID: ${t.id}] ${t.title} [Priority: ${t.priority}, Status: ${t.status}]`).join("\n")}

IMPORTANT HISTORIC MEMORIES:
${memories.length === 0 ? "- None" : memories.map((m) => `- [Importanace: ${m.importance}/10] ${m.summary} (${m.tags.join(", ")})`).join("\n")}

RECENT EXECUTION ACTIONS & REPORTS:
${reports.length === 0 ? "- None" : reports.slice(0, 3).map((r) => `- [Run Time: ${r.timestamp}]\n  Thoughts: ${r.thoughts}\n  Report: ${r.report}`).join("\n")}

-------------------------------

Your assignment:
1. Formulate your strategic planning for this run.
2. Output a strictly compliant JSON matching the system instructions.`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        systemInstruction: {
          parts: [
            {
              text: systemInstruction,
            },
          ],
        },
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "aistudio-build",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Gemini API request failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      throw new Error("Gemini returned an empty response candidate");
    }

    return this.parseAndValidateOutput(textOutput);
  }

  /**
   * Safe JSON parse & field validation with detailed fallback
   */
  private parseAndValidateOutput(rawText: string): GeminiOutput {
    let cleanText = rawText.trim();
    
    // De-shroud potential markdown blocks if LLM ignored configuration
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7);
    }
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    
    cleanText = cleanText.trim();

    try {
      const parsed = JSON.parse(cleanText) as GeminiOutput;

      // Assert basic structural integrity with valid defaults
      return {
        thoughts: parsed.thoughts || "No explicit reasoning provided.",
        newGoals: Array.isArray(parsed.newGoals) ? parsed.newGoals : [],
        newTasks: Array.isArray(parsed.newTasks)
          ? parsed.newTasks.map((t) => ({
              title: t.title || "Bez názvu",
              priority: ["low", "medium", "high"].includes(t.priority) ? t.priority : "low",
            }))
          : [],
        completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : [],
        newMemories: Array.isArray(parsed.newMemories)
          ? parsed.newMemories.map((m) => ({
              summary: m.summary || "No description",
              importance: typeof m.importance === "number" ? Math.max(1, Math.min(10, m.importance)) : 5,
              tags: Array.isArray(m.tags) ? m.tags : [],
            }))
          : [],
        nextWakeupMinutes: typeof parsed.nextWakeupMinutes === "number" ? Math.max(5, parsed.nextWakeupMinutes) : 60,
        priority: ["low", "medium", "high"].includes(parsed.priority) ? parsed.priority : "low",
        report: parsed.report || "Běh úspěšně dokončen bez vytvoření zprávy.",
      };
    } catch (parseError: any) {
      console.error("Failed to parse Gemini output text: ", cleanText);
      throw new Error(`Failed to validate Gemini JSON structure: ${parseError.message}`);
    }
  }
}
