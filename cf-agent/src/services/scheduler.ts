import { FirestoreServiceClient } from "./firestore";
import { AgentSettings } from "../types";

export class AgentScheduler {
  private firestore: FirestoreServiceClient;
  private collection = "settings";
  private documentId = "agent_state";

  constructor(firestore: FirestoreServiceClient) {
    this.firestore = firestore;
  }

  /**
   * Determines if the agent must execute its run or skip immediately.
   * If DB settings are missing, automatically bootstraps the first-run configuration.
   */
  async evaluateWakeup(): Promise<{ shouldRun: boolean; settings: AgentSettings; reason?: string }> {
    console.log("Scheduler: Checking agent state inside settings collection...");
    
    let settingsDoc = await this.firestore.getDocument<AgentSettings>(this.collection, this.documentId);
    
    const now = new Date();
    
    if (!settingsDoc) {
      console.log("Scheduler: Settings document not found. Bootstrapping first autonomous run...");
      const bootstrappedSettings: AgentSettings = {
        nextWakeup: now.toISOString(),
        lastWoken: now.toISOString(),
        mainStrategy: "Zahájení učení, analýzy trhu a plánování autonomní cesty na zbohatnutí.",
      };
      
      settingsDoc = await this.firestore.createDocument<AgentSettings>(
        this.collection,
        bootstrappedSettings,
        this.documentId
      );
      
      return {
        shouldRun: true,
        settings: settingsDoc,
      };
    }

    const nextWakeupTime = Date.parse(settingsDoc.nextWakeup || "");
    if (isNaN(nextWakeupTime)) {
      console.warn("Scheduler: Found corrupted or missing timestamp in nextWakeup. Resolving to force run.");
      return {
        shouldRun: true,
        settings: settingsDoc,
      };
    }

    if (now.getTime() < nextWakeupTime) {
      const minutesRemaining = Math.ceil((nextWakeupTime - now.getTime()) / 60000);
      return {
        shouldRun: false,
        settings: settingsDoc,
        reason: `Skončeno: Čas probuzení ještě nenastal. Další start za ${minutesRemaining} minut (${new Date(nextWakeupTime).toLocaleString("cs-CZ")}).`,
      };
    }

    return {
      shouldRun: true,
      settings: settingsDoc,
    };
  }

  /**
   * Updates settings with new timetables once planning completes
   */
  async recordWakeupSuccess(nextWakeupIso: string, mainStrategy: string): Promise<void> {
    const updatedPayload: AgentSettings = {
      nextWakeup: nextWakeupIso,
      lastWoken: new Date().toISOString(),
      mainStrategy,
    };

    console.log(`Scheduler: Recording successful cycle setup. Next Wakeup: ${nextWakeupIso}`);
    await this.firestore.updateDocument(this.collection, this.documentId, updatedPayload);
  }
}
