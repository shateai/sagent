import { DollarSign, Cpu, TrendingUp, Calendar, Zap, AlertCircle } from "lucide-react";
import { AgentStatus } from "../types";
import { motion } from "motion/react";

interface MetricCardsProps {
  status: AgentStatus;
  onTriggerPulse: () => void;
  isTriggering: boolean;
  userEmail: string | undefined;
}

export function MetricCards({ status, onTriggerPulse, isTriggering, userEmail }: MetricCardsProps) {
  // Translate state to Czech with styles
  const getStatusConfig = (state: "sleeping" | "planning" | "acting") => {
    switch (state) {
      case "planning":
        return {
          label: "PROBÍHÁ ANALÝZA TRHU",
          color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          glow: "bg-amber-500",
          desc: "Bot skenuje trendy a počítá matematické modely..."
        };
      case "acting":
        return {
          label: "AKTIVNÍ EXEKUCE",
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          glow: "bg-emerald-500",
          desc: "Nasazování mikro-SaaS, rozesílání obsahu..."
        };
      case "sleeping":
      default:
        return {
          label: "SPÍCÍ REŽIM",
          color: "text-zinc-500 bg-zinc-900 border-zinc-800",
          glow: "bg-indigo-500",
          desc: "Čeká na hodinové zvonění nebo manuální impuls..."
        };
    }
  };

  const statusConfig = getStatusConfig(status.status);

  // Return indicator with proper formatting
  const formattedRate = status.hourlyRate >= 0 
    ? `+$${status.hourlyRate.toFixed(1)}` 
    : `-$${Math.abs(status.hourlyRate).toFixed(1)}`;

  const isEarning = status.hourlyRate >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      
      {/* 1. Total Capital Box */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col justify-between hover:border-zinc-700/60 transition duration-300 relative overflow-hidden group">
        <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-indigo-600/5 blur-2xl group-hover:bg-indigo-600/10 transition duration-500" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Celkový Kapitál</span>
            <div className="rounded bg-indigo-600/10 p-1.5 text-indigo-400 border border-indigo-600/20">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-white tracking-tight leading-none">
              ${status.capital.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="ml-1 text-[10px] text-zinc-500 font-bold font-mono">USD</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-indigo-600 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: "65%" }}
              transition={{ duration: 1.2 }}
            />
          </div>
          <p className="mt-2 text-[10px] text-zinc-500 font-medium">+12.4% od minulého běhu</p>
        </div>
      </div>

      {/* 2. Hourly Speculative Yield Box */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col justify-between hover:border-zinc-700/60 transition duration-300 relative overflow-hidden group">
        <div className="absolute right-0 top-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-indigo-600/5 blur-2xl group-hover:bg-indigo-600/10 transition duration-500" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Hodinový Výtěžek</span>
            <div className={`rounded p-1.5 border ${
              isEarning 
                ? "bg-indigo-600/10 text-indigo-400 border-indigo-600/20" 
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}>
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className={`text-3xl font-extrabold tracking-tight leading-none ${isEarning ? "text-emerald-400" : "text-rose-400"}`}>
              {formattedRate}
            </span>
            <span className="ml-1 text-[10px] text-zinc-500 font-bold font-mono">USD</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
            <motion.div 
              className={`h-full rounded-full ${isEarning ? "bg-emerald-500" : "bg-rose-500"}`} 
              initial={{ width: 0 }}
              animate={{ width: "42%" }}
              transition={{ duration: 1 }}
            />
          </div>
          <p className="mt-2 text-[10px] text-zinc-500 font-medium">Příjmy po odečtení poplatků</p>
        </div>
      </div>

      {/* 3. Agent Waking State Box */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col justify-between hover:border-zinc-700/60 transition duration-300 relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Status AI Agenta</span>
            <div className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusConfig.glow}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusConfig.glow}`} />
            </div>
          </div>
          <div className="mt-4">
            <div className={`inline-flex rounded border px-2.5 py-1 text-[10px] font-bold ${statusConfig.color} tracking-wider font-mono`}>
              {statusConfig.label}
            </div>
          </div>
        </div>
        <div className="mt-4 border-t border-zinc-900 pt-3">
          <p className="text-[10px] text-zinc-400 leading-normal font-medium">{statusConfig.desc}</p>
        </div>
      </div>

      {/* 4. Agent Control / Pulse trigger Grid */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col justify-between hover:border-zinc-700/60 transition duration-300 relative overflow-hidden group">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Simulace časovače</span>
            <div className="rounded bg-indigo-650/10 p-1.5 text-indigo-400 border border-indigo-600/20">
              <Zap className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-4">
          {isTriggering || status.status === "planning" ? (
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 py-2.5 text-xs font-bold font-mono tracking-wider uppercase"
            >
              <svg className="animate-spin h-3.5 w-3.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Přemýšlím...
            </button>
          ) : (
            <button
              id="btn-trigger-pulse"
              onClick={onTriggerPulse}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 py-2.5 text-xs font-semibold tracking-wide cursor-pointer transition shadow hover:shadow-indigo-600/10 active:scale-[0.98] border border-zinc-800"
            >
              Probudit Agenta
            </button>
          )}
          <p className="mt-2 text-[9px] text-zinc-500 text-center leading-normal font-medium">
            Tento trigger odpovídá hodinovému probuzení z Cloudflare.
          </p>
        </div>
      </div>

    </div>
  );
}
