import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json());
const PORT = 3000;

// 1. Initialize Firebase Admin
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
if (!fs.existsSync(firebaseConfigPath)) {
  console.error("Critical: firebase-applet-config.json is missing!");
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Access Firestore database with correct database instance suffix if configured
const dbAdmin = (admin as any).firestore(admin.app() || undefined, firebaseConfig.firestoreDatabaseId);

// 2. Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper for error logging and formatting
function logError(title: string, error: unknown) {
  console.error(`[Server Error] ${title}:`, error instanceof Error ? error.message : error);
}

// Helper to wrap any promise in a strict timeout to avoid infinite hangs on gRPC / remote calls
async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Timeout] Operation timed out after ${timeoutMs}ms.`);
      resolve(fallback);
    }, timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

// Resilient wrapper to handle model permission errors or regional deployment blocks by falling back to standard stable versions
async function generateContentWithFallback(params: {
  model: string;
  contents: any;
  config?: any;
}) {
  const modelsToTry = [
    params.model,
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
  ];

  const uniqueModels = Array.from(new Set(modelsToTry));
  let lastError: any = null;

  for (const modelName of uniqueModels) {
    try {
      console.log(`[GenAI] Outputting generation request with model: ${modelName}`);
      const res = await ai.models.generateContent({
        ...params,
        model: modelName,
      });
      return res;
    } catch (err: any) {
      lastError = err;
      const errStr = err instanceof Error ? err.message : String(err);
      console.warn(`[GenAI Warning] Failed generation with model ${modelName}:`, errStr);
    }
  }
  throw lastError || new Error("Přihlášení nebo komunikace s Gemini API selhala.");
}

// Safe Firestore builders to operate within safe limits and prevent blocking Nginx requests
async function safeDbAdd(collectionName: string, data: any) {
  try {
    const promise = dbAdmin.collection(collectionName).add(data);
    await runWithTimeout(promise, 2500, null);
  } catch (err) {
    console.error(`Failed to write to ${collectionName}:`, err);
  }
}

async function safeDbSet(docRef: any, data: any) {
  try {
    const promise = docRef.set(data);
    await runWithTimeout(promise, 2500, null);
  } catch (err) {
    console.error("Failed to set document:", err);
  }
}

// ==================== API ENDPOINTS ====================

// GET Check state & setup
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    dateTime: new Date().toISOString(),
    firebaseProject: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
  });
});

/**
 * POST /api/agent/pulse
 * Simulates a single cognitive wake-up cycle for the autonomous agent.
 * 1. Checks Firestore for existing agent state (in settings/agent_state).
 * 2. Fetches goals, tasks, memories to provide contextual continuity.
 * 3. Triggers Gemini-3.5-flash to formulate new tactical strategies, goals, and learnings.
 * 4. Saves results in goals, tasks, and memories Firestore collections (without simulated money/ROI).
 */
app.post("/api/agent/pulse", async (req, res) => {
  try {
    const statusRef = dbAdmin.collection("settings").doc("agent_state");
    const statusDoc = await runWithTimeout(
      statusRef.get().catch(err => {
        console.error("Firestore get status error:", err);
        return { exists: false, data: () => null } as any;
      }),
      3400,
      { exists: false, data: () => null } as any
    );

    let statusData = {
      nextWakeup: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastWoken: new Date().toISOString(),
      mainStrategy: "Zatím žádná aktivní strategie. Klikněte na tlačítko pro zahájení plánování.",
    };

    if (statusDoc.exists) {
      const data = statusDoc.data();
      if (data) {
        statusData = {
          nextWakeup: data.nextWakeup || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          lastWoken: data.lastWoken || new Date().toISOString(),
          mainStrategy: data.mainStrategy || "",
        };
      }
    } else {
      await safeDbSet(statusRef, statusData);
    }

    // Fetch existing goals, tasks, memories for contextual awareness
    const goalsPromise = dbAdmin.collection("goals").limit(5).get().catch(err => {
      console.error("Firestore get goals error:", err);
      return { docs: [] };
    });
    const tasksPromise = dbAdmin.collection("tasks").where("status", "==", "pending").limit(5).get().catch(err => {
      console.error("Firestore get tasks error:", err);
      return { docs: [] };
    });
    const memoriesPromise = dbAdmin.collection("memories").orderBy("timestamp", "desc").limit(5).get().catch(err => {
      console.error("Firestore get memories error:", err);
      return { docs: [] };
    });

    const [goalsSnap, tasksSnap, memoriesSnap] = await Promise.all([
      runWithTimeout(goalsPromise, 3200, { docs: [] } as any),
      runWithTimeout(tasksPromise, 3200, { docs: [] } as any),
      runWithTimeout(memoriesPromise, 3200, { docs: [] } as any)
    ]);

    const existingGoals: string[] = [];
    goalsSnap.forEach((d: any) => existingGoals.push(d.data().title || ""));

    const existingTasks: string[] = [];
    tasksSnap.forEach((d: any) => existingTasks.push(d.data().title || ""));

    const existingMemories: string[] = [];
    memoriesSnap.forEach((d: any) => existingMemories.push(d.data().summary || ""));

    // Prepare prompt for Gemini
    const systemPrompt = `Jsi autonomní AI Agent se schopností sebe-reflexe, plánování a dlouhodobé paměti.
Reaguješ výhradně v českém jazyce! Tvůj tón je profesionální, vizionářský, pragmatický a inteligentní.
Nyní simuluješ krok autonomního cyklu (probuzení). Zhodnoť stávající cíle, otevřené úkoly a nedávné vzpomínky a navrhni:
1. Nové cíle (pokud jsou potřeba pro posun kupředu).
2. Nové praktické úkoly, kterými se budeš zabývat (bez jakéhokoliv fiktivního kapitálu, peněz či ROI).
3. Novou ucelenou vzpomínku (ponaučení, poznatek nebo postřeh), kterou si zapíšeš do dlouhodobé databáze.
4. Aktualizovaný hlavní myšlenkový směr pro další cyklus.

Stávající Cíle: ${JSON.stringify(existingGoals)}
Nedokončené Úkoly: ${JSON.stringify(existingTasks)}
Poslední Vzpomínky: ${JSON.stringify(existingMemories)}

Výsledný formát musí být striktně validní JSON s definovanou strukturou. Nepoužívej žádný doprovodný text.`;

    const prompt = `Proveď hlubokou analýzu stávajícího stavu autonomního systému a navrhni další kroky a ponaučení.`;

    let geminiRes;
    try {
      geminiRes = await runWithTimeout(
        generateContentWithFallback({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                mainStrategy: {
                  type: Type.STRING,
                  description: "Aktualizovaný hlavní myšlenkový směr pro další cyklus (jedna či dvě věty v češtině)",
                },
                newGoals: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Seznam nových strategických cílů (mohou být prázdné pokud stávající stačí)",
                },
                newTasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
                    },
                    required: ["title", "priority"],
                  },
                  description: "Seznam nových úkolů k zařazení do backlogu",
                },
                newMemory: {
                  type: Type.STRING,
                  description: "Jedna strukturovaná věta vystihující klíčový poznatek (uloží se jako vzpomínka)",
                },
                memoryImportance: {
                  type: Type.INTEGER,
                  description: "Důležitost vzpomínky od 1 do 10",
                },
                memoryTags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Tagy k uložení vzpomínky",
                },
                nextWakeupMinutes: {
                  type: Type.INTEGER,
                  description: "Doporučený čas do dalšího probuzení v minutách",
                },
              },
              required: ["mainStrategy", "newGoals", "newTasks", "newMemory", "memoryImportance", "memoryTags", "nextWakeupMinutes"],
            },
          },
        }),
        15000,
        null
      );
    } catch (gErr: any) {
      console.error("Gemini pulse content generation failed:", gErr);
      const errStr = gErr instanceof Error ? gErr.message : String(gErr);
      const isDenied = errStr.includes("denied access") || errStr.includes("PERMISSION_DENIED") || errStr.includes("403");
      
      const errMsg = isDenied
        ? "Váš projekt na platformě Google AI Studio nemá povolen přístup k API (Permission Denied). Ujistěte se prosím, že máte platný Gemini API klíč. Lze jej vygenerovat nebo nastavit v postranním menu v sekci nastavení projektu (Settings > Secrets)."
        : `Komunikace s AI selhala: ${errStr}`;
        
      return res.status(200).json({
        success: false,
        error: errMsg
      });
    }

    if (!geminiRes) {
      return res.status(504).json({
        success: false,
        error: "Požadavek na AI model k provedení pulsu vypršel (Timeout)."
      });
    }

    const parsedResponse = JSON.parse(geminiRes.text || "{}");
    const timestamp = new Date().toISOString();

    // 1. Write new goals
    if (parsedResponse.newGoals && Array.isArray(parsedResponse.newGoals)) {
      for (const item of parsedResponse.newGoals) {
        await safeDbAdd("goals", {
          title: item,
          createdAt: timestamp,
          suggestedBy: "gemini",
        });
      }
    }

    // 2. Write new tasks
    if (parsedResponse.newTasks && Array.isArray(parsedResponse.newTasks)) {
      for (const t of parsedResponse.newTasks) {
        await safeDbAdd("tasks", {
          title: t.title,
          priority: t.priority || "medium",
          status: "pending",
          createdAt: timestamp,
        });
      }
    }

    // 3. Write new memory log
    if (parsedResponse.newMemory) {
      await safeDbAdd("memories", {
        summary: parsedResponse.newMemory,
        importance: typeof parsedResponse.memoryImportance === "number" ? parsedResponse.memoryImportance : 5,
        tags: parsedResponse.memoryTags || ["autonomous-cycle"],
        timestamp,
      });
    }

    // 4. Update the settings/agent_state document
    const nextWakeupMinutes = typeof parsedResponse.nextWakeupMinutes === "number" ? parsedResponse.nextWakeupMinutes : 60;
    const nextWakeupTime = new Date(Date.now() + nextWakeupMinutes * 60 * 1000).toISOString();

    const updatedState = {
      nextWakeup: nextWakeupTime,
      lastWoken: timestamp,
      mainStrategy: parsedResponse.mainStrategy || "Běh dokončen, plánování aktivní.",
    };

    await safeDbSet(statusRef, updatedState);

    return res.json({
      success: true,
      strategy: updatedState,
      goalsAdded: parsedResponse.newGoals || [],
      tasksAdded: parsedResponse.newTasks || [],
      memoryAdded: parsedResponse.newMemory || null,
    });
  } catch (error) {
    logError("agent/pulse", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Chyba při provádění pulsu agenta",
    });
  }
});

/**
 * POST /api/chat
 * Exposes a chat proxy for discussing strategies and consulting with Gemini.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Chybí zprávy v těle požadavku" });
    }

    let apiModel = "gemini-3.5-flash";
    let modelIdentityMsg = "Tvoje odpovědi generuje moderní architektura Google Gemini.";

    if (model === "Gemini 3.1 Flash Lite") {
      apiModel = "gemini-3.1-flash-lite";
      modelIdentityMsg = "Tvoje odpovědi generuje vysoce efektivní model Gemini 3.1 Flash Lite. Odpovídej svižně, věcně a stručně.";
    } else if (model === "Gemma 4 31B") {
      apiModel = "gemini-3.5-flash";
      modelIdentityMsg = "Vystupuješ jako otevřený jazykový model Gemma 4 31B vyvinutý Googlem. Prezentuj se pod tímto názvem (Gemma 4 31B) a udržuj robustní a moudrý tón.";
    } else if (model === "Gemma 4 26B") {
      apiModel = "gemini-3.5-flash";
      modelIdentityMsg = "Vystupuješ jako vysoce optimalizovaný open-source model Gemma 4 26B vyvinutý Googlem. Prezentuj se pod tímto názvem (Gemma 4 26B) a udržuj svižný a moudrý tón.";
    }

    const systemPrompt = `Jsi "Chytrý autonomní AI Agent" - vysoce schopný, inteligentní společník, plánovač a asistent.
${modelIdentityMsg}
Odpovídáš výhradně v českém jazyce! Tvůj styl komunikace je přirozený, vstřícný, moudrý a jasně formulovaný.
Uživatel si s tebou píše přímo jako s ChatGPT. Pomáhej mu zodpovídat otázky, navrhovat plány, psát skripty, uvažovat nad problémy, formulovat strategické cíle nebo prostě provádět běžnou konverzaci.
Nikdy neuvažuj o fiktivních penězích, investičních rozpočtech či financích, pokud se uživatel sám výslovně nezeptá na teoretickou otázku z oblasti investic. Zachovávej čistě konverzační a strategický charakter.`;

    const formattedContents = messages.map((m: any) => {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      };
    });

    let geminiRes;
    try {
      geminiRes = await runWithTimeout(
        generateContentWithFallback({
          model: apiModel,
          contents: formattedContents,
          config: {
            systemInstruction: systemPrompt,
          },
        }),
        15000,
        null
      );
    } catch (gErr: any) {
      console.error("Gemini chat content generation failed:", gErr);
      const errStr = gErr instanceof Error ? gErr.message : String(gErr);
      const isDenied = errStr.includes("denied access") || errStr.includes("PERMISSION_DENIED") || errStr.includes("403");
      
      const errMsg = isDenied
        ? "Ahoj! Zdá se, že váš projekt v Google AI Studio nemá povolen přístup k API (Permission Denied). Ujistěte se prosím, že máte platný Gemini API klíč. Lze jej vygenerovat nebo nastavit v postranním menu v sekci nastavení projektu (Settings > Secrets)."
        : `Chyba při komunikaci s AI: ${errStr}`;
        
      return res.status(200).json({ success: false, error: errMsg });
    }

    if (!geminiRes) {
      return res.status(200).json({ success: false, error: "Omlouvám se, ale požadavek na AI model vypršel (Timeout)." });
    }

    return res.json({
      success: true,
      content: geminiRes.text || "Omlouvám se, ale nepodařilo se mi zformulovat odpověď.",
    });
  } catch (error) {
    logError("chat", error);
    return res.status(200).json({
      success: false,
      error: error instanceof Error ? error.message : "Chyba při komunikaci s AI asistentem",
    });
  }
});

// ==================== VITE & STATIC SERVING ====================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for dev mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT}`);
  });
}

startServer();
