import { FirestoreServiceClient } from "./firestore";
import { GeminiServiceClient } from "./gemini";
import { MemoryManager } from "./memory";
import { Goal, Task, Memory, Report, GeminiOutput } from "../types";

export class PlanningEngine {
  private firestore: FirestoreServiceClient;
  private gemini: GeminiServiceClient;
  private memoryManager: MemoryManager;

  constructor(
    firestore: FirestoreServiceClient,
    gemini: GeminiServiceClient,
    memoryManager: MemoryManager
  ) {
    this.firestore = firestore;
    this.gemini = gemini;
    this.memoryManager = memoryManager;
  }

  /**
   * Runs the entire sequence:
   * 1. Pulls data from goals, tasks, reports, memories
   * 2. Runs Gemini simulation
   * 3. Syncs results (saves reports, creates tasks/goals, clears completed)
   */
  async executeCycle(): Promise<{ output: GeminiOutput; nextWakeupIso: string }> {
    console.log("PlanningEngine: Fetching current systemic goals...");
    const goals = await this.firestore.listDocuments<Goal>("goals");

    console.log("PlanningEngine: Fetching active task backlog...");
    const allTasks = await this.firestore.listDocuments<Task>("tasks");
    const pendingTasks = allTasks.filter((t) => t.status === "pending");

    console.log("PlanningEngine: Requesting historic memory logs...");
    const importantMemories = await this.memoryManager.getImportantMemories(10);

    console.log("PlanningEngine: Retreiving recent workflow reports...");
    const allReports = await this.firestore.listDocuments<Report>("reports");
    const recentReports = allReports
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 3);

    console.log("PlanningEngine: Launching strategic simulation with Gemini AI...");
    const planOutput = await this.gemini.planNextSteps(
      goals,
      pendingTasks,
      importantMemories,
      recentReports
    );

    console.log("PlanningEngine: Simulation parsed successfully. Synchronizing state...");

    // 1. Save new memories
    if (planOutput.newMemories && planOutput.newMemories.length > 0) {
      await this.memoryManager.saveNewMemories(planOutput.newMemories);
    }

    // 2. Add suggested strategic goals
    const timestamp = new Date().toISOString();
    if (planOutput.newGoals && planOutput.newGoals.length > 0) {
      for (const title of planOutput.newGoals) {
        const goalPayload: Omit<Goal, "id"> = {
          title,
          createdAt: timestamp,
          suggestedBy: "gemini",
        };
        await this.firestore.createDocument("goals", goalPayload);
      }
    }

    // 3. Add scheduled tasks
    if (planOutput.newTasks && planOutput.newTasks.length > 0) {
      for (const item of planOutput.newTasks) {
        const taskPayload: Omit<Task, "id"> = {
          title: item.title,
          priority: item.priority || "low",
          status: "pending",
          createdAt: timestamp,
        };
        await this.firestore.createDocument("tasks", taskPayload);
      }
    }

    // 4. Resolve completed tasks
    if (planOutput.completedTasks && planOutput.completedTasks.length > 0) {
      await this.resolveCompletedTasks(pendingTasks, planOutput.completedTasks);
    }

    // 5. Calculate next wakeup moment
    const nextWakeupMs = Date.now() + planOutput.nextWakeupMinutes * 60 * 1000;
    const nextWakeupIso = new Date(nextWakeupMs).toISOString();

    // 6. Save current report history
    const reportPayload: Omit<Report, "id"> = {
      timestamp,
      thoughts: planOutput.thoughts,
      report: planOutput.report,
      nextWakeup: nextWakeupIso,
    };
    await this.firestore.createDocument("reports", reportPayload);

    return {
      output: planOutput,
      nextWakeupIso,
    };
  }

  /**
   * Matches string titles or task IDs to transition tasks from pending to completed in Firestore
   */
  private async resolveCompletedTasks(pendingTasks: Task[], completedIdsOrTitles: string[]): Promise<void> {
    for (const matchToken of completedIdsOrTitles) {
      const matchTokenLower = matchToken.toLowerCase().trim();
      
      // Match by exact ID or substring title matches
      const targetTask = pendingTasks.find((t) => {
        const idMatch = t.id && t.id.toLowerCase() === matchTokenLower;
        const titleMatch = t.title.toLowerCase().trim() === matchTokenLower || t.title.toLowerCase().includes(matchTokenLower);
        return idMatch || titleMatch;
      });

      if (targetTask && targetTask.id) {
        try {
          await this.firestore.updateDocument("tasks", targetTask.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
          });
          console.log(`PlanningEngine: Marked task Completed -> ID: ${targetTask.id} (${targetTask.title})`);
        } catch (error: any) {
          console.error(`PlanningEngine: Error transitioning task state: ${error.message}`);
        }
      }
    }
  }
}
