export const CLOUDFLARE_GUIDE = {
  title: "Nastavení Cloudflare Worker s Cron Triggerem",
  description: "Postup pro zprovoznění automatického hodinového plánovače (bota) na Cloudflare, který každých 60 minut probudí agenta k nové analýze trhu.",
  steps: [
    {
      step: 1,
      title: "Vytvoření Cloudflare Workeru",
      instruction: "Přihlaste se do své Cloudflare administrace, jděte do sekce **Workers & Pages** a klikněte na **Create Application**. Zvolte šablonu **Create Worker** a pojmenujte ho např. `wealth-agent-cron`."
    },
    {
      step: 2,
      title: "Konfigurace Cron Triggeru (Časovače)",
      instruction: "Otevřete nově vytvořený Worker, přejděte na záložku **Triggers** v levém panelu, sjeďte dolů na **Cron Triggers** a klikněte na **Add Trigger**. Nastavte časovač na hodnotu `0 * * * *` (každou celou hodinu) a potvrďte tlačítkem **Add**."
    },
    {
      step: 3,
      title: "Vložení dohledového kódu",
      instruction: "Klikněte na **Quick Edit** ve svém Workeru a vložte do souboru `index.js` přiložený JavaScript kód (viz blok níže). Tento skript provede zabezpečené HTTP volání na náš server, které spustí generování nového plánu."
    },
    {
      step: 4,
      title: "Nastavení tajných proměnných",
      instruction: "Přejděte do záložky **Settings** -> **Variables** ve Workeru a v části **Environment Variables** přidejte tajné proměnné:\n\n- `APP_URL` = Adresa této nasazené aplikace (např. Cloud Run URL)\n- `CRON_SECRET` = Libovolný tajný klíč (např. generovaný token), který chrání endpoint před neoprávněným spouštěním."
    },
    {
      step: 5,
      title: "Přidání klíče do této aplikace",
      instruction: "Stejný klíč `CRON_SECRET` zadejte v **Settings > Secrets** v tomto rozhraní. Aplikace od té chvíle bude od externích spouštěčů vyžadovat tento token v hlavičce `X-Agent-Secret`."
    }
  ],
  workerCode: `export default {
  async scheduled(event, env, ctx) {
    // APP_URL a CRON_SECRET musí být nakonfigurovány v administraci Cloudflare Workerů
    const url = env.APP_URL || "https://ais-pre-n5wxogagni5ukvh5ergodl-708655748313.europe-west2.run.app";
    const secret = env.CRON_SECRET || "default_local_simulation_key";

    console.log("Budím AI Wealth Agenta na adrese:", url);

    try {
      const response = await fetch(\`\${url}/api/agent/pulse\`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Secret": secret
        }
      });

      if (!response.ok) {
        throw new Error(\`Server odpověděl kódem \${response.status}\`);
      }

      const data = await response.json();
      console.log("Plánovač úspěšně spuštěn:", data.newPlan?.topic || "OK");
    } catch (error) {
      console.error("Selhalo buzení agenta:", error.message);
    }
  }
};`
};
