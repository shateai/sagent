# Autonomní AI Agent pro Cloudflare Workers (TypeScript)

Tento podprojekt reprezentuje kompletní, modulární a produkčně připravený systém autonomního plánovacího AI agenta běžícího na **Cloudflare Workers**. 

Agent funguje plně dlouhodobě: má vlastní paměť, hierarchický seznam úkolů, strategické cíle a logování historie. Pravidelně se probouzí pomocí **Cloudflare Cron Triggers** (každých 5 minut), vyhodnocuje časový harmonogram, provádí hloubkovou analýzu trhu/situace s **Google Gemini**, aktualizuje databázi **Firebase Firestore** a posílá strukturované rich-embed reporty na **Discord Webhook**.

---

## 🏗️ Architektura systému

Projekt využívá čistého oddělení vrstev pro maximální čitelnost a testovatelnost:

1. **`src/types.ts`**: Definice datových modelů (Memory, Goal, Task, Report, settings) a síťových rozhraní.
2. **`src/services/firestore.ts`**: Firestore klient komunikující přes Google REST API. Obsahuje **RS256 JWT generátor** využívající nativní Web Cryptography API pro bezpečné přihlášení přes GCP Service Account.
3. **`src/services/gemini.ts`**: Klient pro **Google Gemini 3.5 Flash** s JSON-schema validátorem, který naskládá cíle, úkoly, reporty i dlouhodobé vzpomínky do kontextu AI.
4. **`src/services/memory.ts`**: Modul pro vyhledávání, řazení a kategorizaci vzpomínek podle důležitosti (Importance 1-10) a tagů.
5. **`src/services/planner.ts`**: Koordinátor plánovací logiky. Zpracovává výstupy z Gemini, vytváří nové úkoly a cíle a uzavírá splněné úkoly.
6. **`src/services/discord.ts`**: Odesílá bohatě formátované zprávy (Rich Embeds) s barvami podle priority a přehlednými tabulkovými poli na Discord Webhook.
7. **`src/services/scheduler.ts`**: Vyhodnocuje časování na základě parametru `nextWakeup` v Firestore a porovnává ho s aktuálním časem. Pokud čas pro další běh ještě nenastal, Worker okamžitě končí.
8. **`src/index.ts`**: Hlavní obsluha Cloudflare Workeru. Implementuje `scheduled` trigger (spouštěný cronem) a `fetch` trigger pro zabezpečené ruční vynucené spuštění.

---

## ⚙️ Požadavky na Firebase Firestore

V databázi Firestore je nutné mít založené následující kolekce:

1. **`goals`**: Seznam strategických cílů.
   - Příklad dokumentu: `{ title: "Dosáhnout 10,000 USD ROI", createdAt: "2026-06-01T08:00:00Z", suggestedBy: "gemini" }`
2. **`tasks`**: Backlog úkolů.
   - Příklad dokumentu: `{ title: "Analyzovat cenovou hladinu BTC", priority: "high", status: "pending", createdAt: "2026-06-01T08:00:00Z" }`
3. **`memories`**: Dlouhodobé poznatky a poučení.
   - Příklad dokumentu: `{ summary: "Špatné načasování nákupu memecoinů vedlo k 2% poplatkové ztrátě.", importance: 8, timestamp: "2026-06-01T08:00:00Z", tags: ["investment", "fees", "lessons"] }`
4. **`reports`**: Historické záznamy úspěšných cyklů.
   - Příklad dokumentu: `{ timestamp: "2026-06-01T08:00:00Z", thoughts: "AI myšlenková úvaha...", report: "Discord markdown text...", nextWakeup: "2026-06-01T09:00:00Z" }`
5. **`settings`**: Globální state a časování.
   - **Musí obsahovat přesně dokument s ID `agent_state`**:
     - `{ nextWakeup: "2026-06-01T08:00:00Z", lastWoken: "2026-06-01T08:00:00Z", mainStrategy: "Úvodní nastavení..." }`

---

## 🔑 Příprava Service Account klíče pro Firestore

Pro zápis do Firestore z Cloudflare Workers bez povolení volného zápisu všem uživatelům (což je bezpečnostní riziko) doporučujeme použít **GCP Service Account**:

1. V GCP Console přejděte do **IAM & Admin > Service Accounts** a vytvořte účet (např. `cloudflare-firestore-agent`).
2. Přiřaďte mu roli **Cloud Datastore User** (která má oprávnění pro čtení a zápis do Firestore).
3. Klikněte na účet, jděte na záložku **Keys**, zvolte **Add Key > Create New Key** a stáhněte formát **JSON**.
4. Celý obsah staženého JSON souboru zkopírujte (budeme jej vkládat jako tajnou proměnnou `FIREBASE_SERVICE_ACCOUNT_JSON`).

---

## 🚀 Postup Nasazení na Cloudflare

### 1. Instalace závislostí a přihlášení
Vstoupit do složky projektu a přihlásit se do Cloudflare CLI:
```bash
cd cf-agent
npm install
npx wrangler login
```

### 2. Úprava konfigurace `wrangler.toml`
Otevřete soubor `wrangler.toml` a nahraďte hodnotu `FIREBASE_PROJECT_ID` vaším skutečným ID projektu na Firebase:
```toml
[vars]
FIREBASE_PROJECT_ID = "vas-firebase-projekt-123"
CRON_SECRET = "libovolny-tajny-klic-pro-manualni-spusteni"
```

### 3. Vložení tajných klíčů do Cloudflare Secrets
Následující citlivé klíče nesmí ležet v textovém souboru `wrangler.toml`, proto je musíte nahrát přes bezpečné Cloudflare Secrets úložiště:

```bash
# Vložení klíče Google Gemini API
npx wrangler secret put GEMINI_API_KEY

# Vložení Webhook URL adresy z Discord kanálu pro zasílání reportů
npx wrangler secret put DISCORD_WEBHOOK_URL

# Vložení kompletního JSON textu staženého GCP Service Account klíče
# (Jakmile wrangler vyzve, vložte celý obsah JSON souboru z kroku 4 výše)
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

### 4. Publikace na Cloudflare Workers
Nyní můžete projekt sestavit a publikovat na Cloudflare edge síť:
```bash
npm run deploy
```

Po úspěšném nasazení získáte adresu Workeru (např. `https://wealth-agent-cron.vasedomena.workers.dev`).

---

## 🧪 Ruční spuštění (Triggering)

### Spouštění přes Cron Trigger (Plánovač)
Cloudflare automaticky spustí Worker každých 5 minut. Pokud ještě neuplynul čas nastavený v `settings/agent_state` -> `nextWakeup`, Worker se okamžitě ukončí s informací v logu:
`Cycle Skipped: Skončeno: Čas probuzení ještě nenastal...`

### Manuální vynucené spuštění přes HTTP POST (Bypass plánovače)
Pro okamžité otestování celé funkčnosti AI plánování se zasláním reportu na Discord můžete zavolat endpoint s parametry bypassu:

```bash
curl -X POST "https://wealth-agent-cron.vasedomena.workers.dev/?force=true" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: vas-konfigurovany-cron-secret-z-toml"
```

Systém okamžitě provede kompletní analýzu a odešle report na váš Discord kanál.

---

## 💡 Výhody tohoto edge řešení
- **Nulový cold-start**: Cloudflare Workers nastartují do 5ms.
- **Bezserverový chod**: Nemusíte udržovat žádný server, platit za RAM ani monitorovat kapacitu.
- **Podpora standardů**: Bezpečný zápis do Firestore přes REST API podepsaný JWT RS256 tokenem přímo na edge.
- **Nulový klientský balík**: Žádné zbytečné kódové závislosti z Node.js, kód je rychlý a lehký.
