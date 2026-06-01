import { useState } from "react";
import { CLOUDFLARE_GUIDE } from "../data/cloudflareGuide";
import { Copy, Check, Server, Terminal, Settings2, Info } from "lucide-react";
import { motion } from "motion/react";

export function CloudflareSetup() {
  const [copied, setCopied] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(CLOUDFLARE_GUIDE.workerCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const toggleStep = (stepNumber: number) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepNumber]: !prev[stepNumber]
    }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12 select-none">
      
      {/* 1. Left documentation panel */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        
        {/* Banner */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600/10 text-orange-400 border border-orange-500/20">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">{CLOUDFLARE_GUIDE.title}</h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{CLOUDFLARE_GUIDE.description}</p>
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono flex items-center gap-2 px-1">
            <Settings2 className="h-4 w-4" /> Kroky Nastavení
          </h3>
          <div className="flex flex-col gap-3">
            {CLOUDFLARE_GUIDE.steps.map((step, idx) => {
              const isChecked = !!completedSteps[step.step];
              return (
                <div 
                  onClick={() => toggleStep(step.step)}
                  key={idx}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition cursor-pointer ${
                    isChecked 
                      ? "bg-zinc-900/40 border-zinc-800 opacity-60 text-zinc-500" 
                      : "bg-zinc-850 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                  }`}
                >
                  <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold shrink-0 transition ${
                    isChecked 
                      ? "bg-emerald-500 text-zinc-950" 
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                  }`}>
                    {isChecked ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : step.step}
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold ${isChecked ? "line-through text-zinc-500" : "text-white"}`}>{step.title}</h4>
                    <p className={`text-xs mt-1 leading-relaxed ${isChecked ? "text-zinc-600" : "text-zinc-400"}`}>{step.instruction}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 2. Worker Code script block */}
      <div className="lg:col-span-5 flex flex-col gap-3">
        
        {/* Code header bar */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono flex items-center gap-2">
            <Terminal className="h-4 w-4 text-orange-400" /> Worker Script (index.js)
          </h3>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white px-3 py-1.5 transition cursor-pointer active:scale-95"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Script
              </>
            )}
          </button>
        </div>

        {/* Script Pre Block */}
        <div className="relative rounded-2xl border border-zinc-800 bg-zinc-850 flex-1 flex flex-col overflow-hidden min-h-[400px]">
          <div className="flex items-center gap-1.5 border-b border-zinc-900 bg-zinc-900/40 px-4 py-2 text-zinc-500 text-[10px] font-mono select-none">
            <span className="h-2 w-2 rounded-full bg-red-500/60" />
            <span className="h-2 w-2 rounded-full bg-yellow-500/60" />
            <span className="h-2 w-2 rounded-full bg-green-500/60" />
            <span className="ml-2 font-semibold">cloudflare-worker.js</span>
          </div>
          <pre className="p-4 overflow-x-auto text-xs font-mono text-zinc-300 select-all leading-normal flex-1">
            <code>{CLOUDFLARE_GUIDE.workerCode}</code>
          </pre>
          <div className="border-t border-zinc-900 bg-zinc-900/30 p-4 flex gap-2">
            <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-500 leading-normal">
              **Zabezpečení:** Kód Workeru přenáší klientský klíč `CRON_SECRET` v HTTP hlavičce. Ujistěte se, že obě strany obdrží stejný klíč.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
