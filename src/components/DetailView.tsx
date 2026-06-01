import { useState } from "react";
import { WealthPlan } from "../types";
import { Check, Target, Compass, Flame, ArrowUpRight, CheckSquare, DollarSign } from "lucide-react";
import Markdown from "react-markdown";

interface DetailViewProps {
  plan: WealthPlan | null;
}

export function DetailView({ plan }: DetailViewProps) {
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-zinc-805 bg-zinc-950/20 rounded-2xl h-full min-h-[300px]">
        <Compass className="h-8 w-8 text-indigo-500 animate-pulse stroke-1.5 mb-3" />
        <h4 className="font-semibold text-zinc-300">Žádný detail nezvolen</h4>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          Vyberte libovolný spekulační záznam v levém panelu, abyste viděli detailní hodinovou strategii a akční kroky bota.
        </p>
      </div>
    );
  }

  const toggleStep = (stepText: string) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepText]: !prev[stepText]
    }));
  };

  const isNetPositive = plan.simulatedReturn >= 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-850 p-6 flex flex-col gap-6 select-none shadow-xl">
      
      {/* 1. Detail Header */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-2">
          <div className="rounded bg-indigo-600/10 px-2 py-0.5 text-[9px] font-mono font-bold text-indigo-400 border border-indigo-600/20 uppercase tracking-wider">
            Strategie #{plan.hourlyHour}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            Vytvořeno: {new Date(plan.createdAt).toLocaleString("cs-CZ")}
          </span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mt-1 leading-tight">
          {plan.topic}
        </h2>
      </div>

      {/* 2. Micro Bento KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        
        {/* KPI 1: Profit */}
        <div className="rounded-xl bg-zinc-900 p-4 border border-zinc-800">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Simulovaný Zisk</span>
          <div className="flex items-baseline mt-1.5">
            <span className={`text-xl font-bold font-mono ${isNetPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {isNetPositive ? `+$${plan.simulatedReturn}` : `-$${Math.abs(plan.simulatedReturn)}`}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono ml-1">USD</span>
          </div>
        </div>

        {/* KPI 2: Feasibility */}
        <div className="rounded-xl bg-zinc-900 p-4 border border-zinc-800">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Úspěšnost (Feasibility)</span>
          <div className="flex items-baseline mt-1.5 gap-1.5">
            <span className="text-xl font-bold font-mono text-indigo-400">{plan.estimatedFeasibility}%</span>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 self-center overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full" 
                style={{ width: `${plan.estimatedFeasibility}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Action checklist count */}
        <div className="rounded-xl bg-zinc-900 p-4 border border-zinc-800 col-span-2 lg:col-span-1">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Akční plán</span>
          <div className="flex items-baseline mt-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {Object.values(completedSteps).filter(Boolean).length}/{plan.actionSteps?.length || 0}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono ml-1.5">splněno</span>
          </div>
        </div>

      </div>

      {/* 3. Thought Process Markdown Content */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono mb-3 flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-indigo-600 animate-pulse" /> Myšlenkový a strategický proces
        </h3>
        {/* Markdown rendering with safety styling strictly conforming to rules */}
        <div className="prose prose-invert prose-xs max-w-none text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl p-5 overflow-x-auto text-sm leading-relaxed font-sans
          [&>h3]:text-zinc-100 [&>h3]:font-bold [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:text-base
          [&>h4]:text-zinc-200 [&>h4]:font-semibold [&>h4]:mt-3 [&>h4]:mb-1
          [&>p]:mb-3
          [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3
          [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-3
          [&>li]:mb-1
          [&>table]:w-full [&>table]:border-collapse [&>table]:text-xs [&>table]:my-3
          [&>table_th]:bg-zinc-800 [&>table_th]:p-2 [&>table_th]:border [&>table_th]:border-zinc-700 [&>table_th]:text-white [&>table_th]:text-left
          [&>table_td]:p-2 [&>table_td]:border [&>table_td]:border-zinc-800/60 [&>table_td]:bg-zinc-900/40
          [&>strong]:text-white [&>strong]:font-semibold
          [&>code]:font-mono [&>code]:text-xs [&>code]:bg-zinc-800 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-indigo-300
          [&>pre]:bg-zinc-950 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:border [&>pre]:border-zinc-800 [&>pre]:my-3 [&>pre_code]:bg-transparent [&>pre_code]:text-zinc-100 [&>pre_code]:p-0
        ">
          <Markdown>{plan.thoughtProcess}</Markdown>
        </div>
      </div>

      {/* 4. Interactive Checklist Steps */}
      {plan.actionSteps && plan.actionSteps.length > 0 && (
        <div className="border-t border-zinc-800 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono mb-3 flex items-center gap-2">
            <CheckSquare className="h-3.5 w-3.5 text-indigo-600" /> Exekuční milníky (Kliknutím splňte)
          </h3>
          <div className="flex flex-col gap-2">
            {plan.actionSteps.map((step, sIdx) => {
              const isChecked = !!completedSteps[step];
              return (
                <button
                  onClick={() => toggleStep(step)}
                  key={sIdx}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                    isChecked 
                      ? "bg-zinc-900/40 border-zinc-800/60 text-zinc-500 line-through" 
                      : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                  }`}
                >
                  <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                    isChecked 
                      ? "bg-emerald-500 border-emerald-500 text-zinc-950" 
                      : "border-zinc-700 bg-zinc-950"
                  }`}>
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className="text-xs font-semibold leading-normal">{step}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
