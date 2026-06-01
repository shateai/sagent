import { WealthPlan } from "../types";
import { ListFilter, CheckSquare, Target, Hourglass } from "lucide-react";
import { motion } from "motion/react";

interface HistoryListProps {
  plans: WealthPlan[];
  selectedPlanId: string | null;
  onSelectPlan: (planId: string) => void;
  isLoading: boolean;
}

export function HistoryList({ plans, selectedPlanId, onSelectPlan, isLoading }: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-20 w-full animate-pulse rounded-2xl bg-zinc-900 border border-zinc-800" />
        ))}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-850 py-12 text-center">
        <div className="rounded-full bg-zinc-900 p-4 border border-zinc-800 text-zinc-500 mb-3">
          <Hourglass className="h-6 w-6 stroke-1.5" />
        </div>
        <h3 className="font-semibold text-zinc-300">Žádné plány nebyly dosud vygenerovány</h3>
        <p className="max-w-md text-xs text-zinc-500 mt-1 px-4">
          Probuďte agenta stisknutím tlačítka "Probudit Agenta", nebo počkejte na hodinový trigger z Cloudflare.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono flex items-center gap-2">
          <ListFilter className="h-3.5 w-3.5 text-indigo-600" /> Speculační Záznamy ({plans.length})
        </h3>
        <span className="text-[10px] font-mono text-zinc-500">Řazeno od nejnovějšího</span>
      </div>

      <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
        {plans.map((plan, index) => {
          const isSelected = selectedPlanId === plan.id;
          const isPositive = plan.simulatedReturn >= 0;
          const formattedReturn = isPositive 
            ? `+$${plan.simulatedReturn}` 
            : `-$${Math.abs(plan.simulatedReturn)}`;

          // Format UTC string beautifully
          const date = new Date(plan.createdAt);
          const formattedTime = date.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
          const formattedDate = date.toLocaleDateString("cs-CZ", { month: "short", day: "numeric" });

          return (
            <motion.button
              id={`plan-card-${plan.id}`}
              onClick={() => onSelectPlan(plan.id)}
              key={plan.id}
              className={`w-full text-left flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-indigo-600/10 border-indigo-600 shadow-md shadow-indigo-600/5 text-white"
                  : "bg-zinc-850 border-zinc-800 hover:border-zinc-700/60 hover:bg-zinc-850/60 text-zinc-400"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <div className="flex items-center gap-4 min-w-0 pr-4">
                
                {/* Hour Badge */}
                <div className={`flex flex-col items-center justify-center h-12 w-12 rounded-lg border font-mono shrink-0 transition-colors ${
                  isSelected 
                    ? "bg-indigo-600/20 border-indigo-600 text-indigo-400" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}>
                  <span className="text-[9px] uppercase tracking-wider leading-none">Hod</span>
                  <span className="text-lg font-bold leading-none mt-0.5">#{plan.hourlyHour}</span>
                </div>

                {/* Strategy Text */}
                <div className="min-w-0 flex flex-col gap-0.5">
                  <h4 className={`text-sm font-semibold truncate leading-snug ${isSelected ? "text-white" : "text-zinc-200"}`}>
                    {plan.topic}
                  </h4>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3 text-indigo-600" /> 
                      Proveditelnost: {plan.estimatedFeasibility}%
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckSquare className="h-3 w-3 text-zinc-500" />
                      Kroků: {plan.actionSteps?.length || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* simulated return badge */}
              <div className="flex flex-col items-end shrink-0 pl-2">
                <span className={`font-mono text-sm font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                  {formattedReturn}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{formattedDate}, {formattedTime}</span>
              </div>

            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
