import { GeminiOutput } from "../types";

export class DiscordServiceClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    if (!webhookUrl) {
      throw new Error("DISCORD_WEBHOOK_URL environment variable is required");
    }
    this.webhookUrl = webhookUrl;
  }

  /**
   * Dispatches a highly styled Discord Rich Embed notification detailing the agent cycle metrics
   */
  async sendReport(output: GeminiOutput, nextWakeupTimeIso: string): Promise<boolean> {
    const nextWakeupCzech = new Date(nextWakeupTimeIso).toLocaleString("cs-CZ", {
      timeZone: "Europe/Prague",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Hex Color mappings corresponding to priority highlights
    const colorMap = {
      low: 5220455,       // Indigo-light / cyan
      medium: 16761095,    // Amber / orange
      high: 15548997,      // Crimson / red
    };
    
    const embedColor = colorMap[output.priority] || 5220455;

    // Formatting list of tasks
    let taskListStr = "- Žádné nové úkoly.";
    if (output.newTasks && output.newTasks.length > 0) {
      taskListStr = output.newTasks
        .map((t) => `• **[${t.priority.toUpperCase()}]** ${t.title}`)
        .join("\n");
      if (taskListStr.length > 1024) {
        taskListStr = taskListStr.substring(0, 1000) + "... (zkráceno)";
      }
    }

    // Formatting list of completed tasks
    let completedListStr = "- Žádné splněné úkoly v tomto cyklu.";
    if (output.completedTasks && output.completedTasks.length > 0) {
      completedListStr = output.completedTasks
        .map((t) => `• ✅ ${t}`)
        .join("\n");
      if (completedListStr.length > 1024) {
        completedListStr = completedListStr.substring(0, 1000) + "... (zkráceno)";
      }
    }

    // Formatting list of suggested goals
    let goalsStr = "- Žádné nové cíle.";
    if (output.newGoals && output.newGoals.length > 0) {
      goalsStr = output.newGoals.map((g) => `🎯 ${g}`).join("\n");
    }

    // Ensure main description limits don't overflow Discord maximum boundary (max 4096, target 3000)
    let bodyDescription = output.report;
    if (bodyDescription.length > 3000) {
      bodyDescription = bodyDescription.substring(0, 2900) + "\n\n...(Zpráva zkrácena kvůli limitu Discordu)...";
    }

    const payload = {
      username: "Wealth Planner AI Agent",
      avatar_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60",
      embeds: [
        {
          title: "🤖 Autonomní Cyklus AI Agenta Dokončen",
          description: `${bodyDescription}\n\n**Myšlenkový směr:**\n*${output.thoughts}*`,
          color: embedColor,
          fields: [
            {
              name: "📋 Nově vytvořené úkoly",
              value: taskListStr,
              inline: false,
            },
            {
              name: "✅ Uzavřené úkoly",
              value: completedListStr,
              inline: false,
            },
            {
              name: "🎯 Navržené strategické cíle",
              value: goalsStr,
              inline: true,
            },
            {
              name: "⏰ Další nahlášené probuzení",
              value: `**za ${output.nextWakeupMinutes} minut**\n(${nextWakeupCzech} SEČ)`,
              inline: true,
            },
          ],
          footer: {
            text: "Wealth Planner AI Worker • Běží na Cloudflare Edges",
            icon_url: "https://www.cloudflare.com/img/cf-facebook-card.png",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Discord API rejected the report delivery: ${response.status} - ${await response.text()}`);
        return false;
      }
      return true;
    } catch (error: any) {
      console.error(`Failed sending dispatch to Discord endpoint: ${error.message}`);
      return false;
    }
  }
}
