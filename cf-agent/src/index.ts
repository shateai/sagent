import { WorkerEnv } from "./types";
import { FirestoreServiceClient } from "./services/firestore";
import { GeminiServiceClient } from "./services/gemini";
import { MemoryManager } from "./services/memory";
import { PlanningEngine } from "./services/planner";
import { AgentScheduler } from "./services/scheduler";
import { DiscordServiceClient } from "./services/discord";

/**
 * Executes the entire lifecycle of the autonomous planner run.
 * Can be shared safely between fetch triggers and cron scheduled triggers.
 */
async function runAutonomousCycle(env: WorkerEnv, isManualTrigger: boolean = false): Promise<{ success: boolean; status: string }> {
  // Validate basic variable requirements
  if (!env.FIREBASE_PROJECT_ID) {
    return { success: false, status: "Missing environment variable: FIREBASE_PROJECT_ID" };
  }
  if (!env.GEMINI_API_KEY) {
    return { success: false, status: "Missing environment variable: GEMINI_API_KEY" };
  }

  // 1. Initializing Service clients
  const firestore = new FirestoreServiceClient(env);
  const gemini = new GeminiServiceClient(env.GEMINI_API_KEY);
  const memoryManager = new MemoryManager(firestore);
  const planner = new PlanningEngine(firestore, gemini, memoryManager);
  const scheduler = new AgentScheduler(firestore);

  try {
    // 2. Evaluate if it represents time to execute the agent cycle
    const wakeupState = await scheduler.evaluateWakeup();

    // If time has not yet arrived (and it's a cron run, not a manual bypass)
    if (!wakeupState.shouldRun && !isManualTrigger) {
      console.log(`Cycle Skipped: ${wakeupState.reason}`);
      return { success: true, status: wakeupState.reason || "Skipped: Not scheduled to run yet." };
    }

    console.log("Autonomous Cycle active! Fetching context and generating next tactical strategies...");
    
    // 3. Planning engine execution
    const cycleResult = await planner.executeCycle();
    const { output, nextWakeupIso } = cycleResult;

    // 4. Update the scheduler data and main state strategy
    await scheduler.recordWakeupSuccess(nextWakeupIso, output.thoughts);

    // 5. Send notifications to Discord Webhook
    if (env.DISCORD_WEBHOOK_URL) {
      console.log("Dispatching formatted cycle embed report to Discord webhook...");
      const discord = new DiscordServiceClient(env.DISCORD_WEBHOOK_URL);
      await discord.sendReport(output, nextWakeupIso);
    } else {
      console.warn("DISCORD_WEBHOOK_URL is missing. Discord output bypassed.");
    }

    console.log("Autonomous agent execution cycle completed successfully!");
    return {
      success: true,
      status: `Úspěšně dokončeno. Další běh plánován na: ${nextWakeupIso}`,
    };
  } catch (error: any) {
    console.error(`Fatal crash in Autonomous Cycle loop: ${error.message}`);
    return {
      success: false,
      status: `Chyba při běhu: ${error.message}`,
    };
  }
}

export default {
  /**
   * HTTP Triggers (Quick manual trigger / integration testing from Dashboard UI)
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Agent-Secret",
      "Content-Security-Policy": "frame-ancestors *;",
    };

    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST request method accepted." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Secure authentication with X-Agent-Secret header
    const requestSecret = request.headers.get("X-Agent-Secret");
    const configuredSecret = env.CRON_SECRET || "default_local_simulation_key";

    if (configuredSecret && requestSecret !== configuredSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid secret credential key" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle the webhook thread asynchronously in Cloudflare context
    const parsedUrl = new URL(request.url);
    const forceBypass = parsedUrl.searchParams.get("force") === "true"; // Bypasses scheduler timezone logic if forced

    console.log(`Manual trigger requested. Force bypass: ${forceBypass}`);

    try {
      if (forceBypass) {
        // Run synchronously to return details directly to the client UI
        const result = await runAutonomousCycle(env, true);
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } else {
        // Run asynchronously via ctx.waitUntil so Cloudflare reports 202 immediately to trigger
        ctx.waitUntil(runAutonomousCycle(env, false));
        return new Response(JSON.stringify({ message: "Agent cycle triggered asynchronously." }), {
          status: 202,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },

  /**
   * Cloudflare Cron Trigger (Runs every 5 minutes by design)
   */
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    console.log(`Cloudflare Cron Trigger fired. Event Time: ${new Date(event.scheduledTime).toISOString()}`);
    ctx.waitUntil(runAutonomousCycle(env, false));
  },
};
