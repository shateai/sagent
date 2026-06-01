import { FirestoreServiceClient } from "./firestore";
import { Memory } from "../types";

export class MemoryManager {
  private firestore: FirestoreServiceClient;
  private collection = "memories";

  constructor(firestore: FirestoreServiceClient) {
    this.firestore = firestore;
  }

  /**
   * Retrieves high-importance memories to feed into Gemini's prompt context
   */
  async getImportantMemories(limit: number = 8): Promise<Memory[]> {
    try {
      const allMemories = await this.firestore.listDocuments<Memory>(this.collection);
      
      // Sort primarily by importance descending, then by timestamp descending
      return allMemories
        .sort((a, b) => {
          if (b.importance !== a.importance) {
            return b.importance - a.importance;
          }
          return Date.parse(b.timestamp) - Date.parse(a.timestamp);
        })
        .slice(0, limit);
    } catch (error: any) {
      console.error(`MemoryManager: Failed to request memories list: ${error.message}`);
      return [];
    }
  }

  /**
   * Decides tags, compiles and saves newly formulated learnings into memory nodes
   */
  async saveNewMemories(newMemories: Array<{ summary: string; importance: number; tags: string[] }>): Promise<Memory[]> {
    const saved: Memory[] = [];
    const timestamp = new Date().toISOString();

    for (const item of newMemories) {
      const memoryPayload: Omit<Memory, "id"> = {
        timestamp,
        summary: item.summary,
        importance: item.importance,
        tags: item.tags || ["autonomous-insight"],
      };

      try {
        const doc = await this.firestore.createDocument<Memory>(this.collection, memoryPayload);
        saved.push(doc);
      } catch (error: any) {
        console.error(`MemoryManager: Failed writing memory entry: ${error.message}`);
      }
    }

    return saved;
  }
}
