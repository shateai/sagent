import { useState, useEffect } from "react";
import { db, auth, googleProvider } from "./firebase";
import { doc, collection, query, orderBy, onSnapshot, limit, where, deleteDoc } from "firebase/firestore";
import { User, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { AdvisorChat } from "./components/AdvisorChat";
import { CloudflareSetup } from "./components/CloudflareSetup";
import { 
  Sparkles, Clock, AlertCircle, ListTodo, Brain, Target, 
  Menu, Plus, Search, HelpCircle, Settings, LogIn, LogOut,
  MapPin, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Play,
  History, Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types for structural safety
interface AgentState {
  nextWakeup: string;
  lastWoken: string;
  mainStrategy: string;
}

interface Goal {
  id: string;
  title: string;
  createdAt: string;
  suggestedBy?: string;
}

interface Task {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  createdAt: string;
}

interface Memory {
  id: string;
  summary: string;
  importance: number;
  tags: string[];
  timestamp: string;
}

export default function App() {
  const [activeView, setActiveView] = useState<string>("chat");
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Real-time states from Firestore
  const [agentState, setAgentState] = useState<AgentState>({
    nextWakeup: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    lastWoken: new Date().toISOString(),
    mainStrategy: "Zatím žádná aktivní strategie. Inicializujte mysl bota pro naplánování strategií.",
  });
  
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  
  const [loadingState, setLoadingState] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<{ id: string; content: string; createdAt: string }[]>([]);
  const [chatInputTrigger, setChatInputTrigger] = useState<{ text: string; timestamp: number } | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("Gemma 4 31B");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  // Sub to user_messages for Left Sidebar Chat History
  useEffect(() => {
    if (!user) {
      setChatHistory([]);
      return;
    }
    const path = "user_messages";
    try {
      const q = query(
        collection(db, path),
        where("ownerId", "==", user.uid)
      );
      const unsubscribe = onSnapshot(q, (snap) => {
        const loaded: { id: string; content: string; createdAt: string }[] = [];
        const seenContents = new Set<string>();
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.role === "user") {
            const rawContent = d.content || "";
            // strip bracket contexts of strategic modules so history lines look clean
            const cleanContent = rawContent.replace(/^\[Kontext:\s*[^\]]+\]\s*/, "");
            if (cleanContent && !seenContents.has(cleanContent)) {
              seenContents.add(cleanContent);
              loaded.push({
                id: docSnap.id,
                content: cleanContent,
                createdAt: d.createdAt || "",
              });
            }
          }
        });
        // Sort in-memory to avoid compound index requirements in Firestore
        loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setChatHistory(loaded.slice(0, 20)); // Limit to most recent 20 distinct prompts
      }, (error) => {
        console.warn("Could not fetch user messages for sidebar history:", error);
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn("Error subscribing to history:", err);
    }
  }, [user]);

  // Sub to Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. Real-time sub to agent settings/state
  useEffect(() => {
    const ref = doc(db, "settings", "agent_state");
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setAgentState({
          nextWakeup: d.nextWakeup || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          lastWoken: d.lastWoken || new Date().toISOString(),
          mainStrategy: d.mainStrategy || "",
        });
      }
      setLoadingState(false);
    }, (error) => {
      console.warn("Could not read settings/agent_state doc, using fallback state:", error);
      setLoadingState(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time sub to strategic goals
  useEffect(() => {
    const q = query(
      collection(db, "goals"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded: Goal[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        loaded.push({
          id: docSnap.id,
          title: d.title || "",
          createdAt: d.createdAt || "",
          suggestedBy: d.suggestedBy,
        });
      });
      setGoals(loaded);
    }, (error) => {
      console.warn("Could not load goals collection, might be uninitialized yet:", error);
    });

    return () => unsubscribe();
  }, []);

  // 3. Real-time sub to tasks
  useEffect(() => {
    const q = query(
      collection(db, "tasks"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded: Task[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        loaded.push({
          id: docSnap.id,
          title: d.title || "",
          priority: d.priority || "medium",
          status: d.status || "pending",
          createdAt: d.createdAt || "",
        });
      });
      setTasks(loaded);
    }, (error) => {
      console.warn("Could not load tasks collection:", error);
    });

    return () => unsubscribe();
  }, []);

  // 4. Real-time sub to memory node logs
  useEffect(() => {
    const q = query(
      collection(db, "memories"),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded: Memory[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        loaded.push({
          id: docSnap.id,
          summary: d.summary || "",
          importance: typeof d.importance === "number" ? d.importance : 5,
          tags: d.tags || [],
          timestamp: d.timestamp || "",
        });
      });
      setMemories(loaded);
    }, (error) => {
      console.warn("Could not load memories collection:", error);
    });

    return () => unsubscribe();
  }, []);

  // Manual Trigger for Cognitive Reflection pulse
  const handleTriggerPulse = async () => {
    if (isTriggering) return;
    setIsTriggering(true);

    try {
      const response = await fetch("/api/agent/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Puls kognitvního cyklu selhal.");
      }

      const data = await response.json();
      if (data.strategy && data.strategy.mainStrategy) {
        setAgentState(data.strategy);
      }
    } catch (err) {
      console.error("Wake up autonomous cycle failed:", err);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleNewChat = () => {
    setSelectedTopic(undefined);
    setActiveView("chat");
    setResetTrigger(prev => prev + 1);
  };

  const toggleSidebar = () => {
    setSidebarExpanded(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-[#131314] font-sans text-zinc-100 flex overflow-hidden">
      
      {/* 1. LEFT SIDEBAR (Gemini Style) */}
      <aside 
        className={`bg-[#1e1f20] h-screen shrink-0 transition-all duration-300 flex flex-col justify-between py-5 px-3 border-r border-[#1e1f20] z-20 ${
          sidebarExpanded ? "w-72" : "w-[68px]"
        }`}
      >
        <div className="flex flex-col gap-6 overflow-hidden">
          
          {/* Logo Brand / Hamburger header */}
          <div className={`flex items-center ${sidebarExpanded ? "justify-between px-2" : "justify-center"}`}>
            {sidebarExpanded && (
              <div className="flex items-center gap-2.5">
                {/* 4-point Gemini star with matching color gradient */}
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6">
                  <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#geminiGradient)" />
                  <defs>
                    <linearGradient id="geminiGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#4285F4" />
                      <stop offset="0.3" stopColor="#9B51E0" />
                      <stop offset="0.6" stopColor="#E040FB" />
                      <stop offset="0.9" stopColor="#FF7043" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="text-[19px] font-medium font-sans text-white tracking-tight antialiased select-none">
                  Gemini
                </span>
                <span className="text-[10px] uppercase tracking-wide bg-[#2a2b2d] px-1.5 py-0.5 text-zinc-400 rounded">
                  Agent
                </span>
              </div>
            )}
            
            <button 
              onClick={toggleSidebar}
              className="p-2.5 rounded-full hover:bg-[#282a2d] text-zinc-300 hover:text-white transition cursor-pointer shrink-0"
              title={sidebarExpanded ? "Sbalit menu" : "Rozbalit menu"}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* "+ Nový chat" pill */}
          <div className="px-1">
            <button
              onClick={handleNewChat}
              className={`flex items-center gap-3 rounded-full bg-[#131314] hover:bg-[#202124] transition duration-200 cursor-pointer shadow-sm ${
                sidebarExpanded 
                  ? "w-full py-3.5 px-5 font-normal text-sm text-[#80868b] hover:text-white border border-zinc-800/80" 
                  : "w-11 h-11 justify-center rounded-full border border-zinc-800/80"
              }`}
              title="Nový chat"
            >
              <Plus className="h-5 w-5 shrink-0 text-zinc-400" />
              {sidebarExpanded && <span className="font-normal tracking-wide">Nový chat</span>}
            </button>
          </div>

          {/* Navigation Links and recent chats */}
          {sidebarExpanded ? (
            <div className="flex flex-col gap-2.5 mt-2 px-3 overflow-hidden flex-1 select-none">
              <span className="text-xs font-semibold text-[#c4c7c5] uppercase tracking-wider block font-sans flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-zinc-400 animate-pulse" />
                Nedávné
              </span>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1 scrollbar-thin scrollbar-thumb-zinc-805 scrollbar-track-transparent">
                {!user ? (
                  <div className="text-xs text-zinc-500 py-3 font-sans leading-relaxed">
                    Pro ukládání historie chatů se přihlaste přes Google.
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-3 font-sans leading-relaxed">
                    Žádné předchozí chaty. Zeptejte se na něco bota nahoře!
                  </div>
                ) : (
                  chatHistory.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex items-center justify-between rounded-lg hover:bg-[#282a2d] text-[13px] text-zinc-350 hover:text-white transition-all duration-150 w-full"
                    >
                      <button
                        onClick={() => {
                          setChatInputTrigger({ text: item.content, timestamp: Date.now() });
                          setSelectedTopic(undefined);
                          setActiveView("chat");
                        }}
                        className="text-left py-2 pl-3 pr-8 flex items-center gap-2.5 w-full cursor-pointer truncate"
                        title={item.content}
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#80868b] group-hover:text-zinc-300 shrink-0">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="truncate">{item.content}</span>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm("Opravdu chcete smazat tento dotaz z historie chatu?")) {
                            try {
                              await deleteDoc(doc(db, "user_messages", item.id));
                            } catch (err) {
                              console.error("Failed to delete chat message:", err);
                            }
                          }
                        }}
                        className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded transition-opacity duration-155 cursor-pointer text-[#80868b] flex items-center justify-center hover:bg-zinc-800"
                        title="Smazat z historie"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 mt-2 px-1">
              <button
                onClick={() => {
                  setSidebarExpanded(true);
                  setActiveView("chat");
                }}
                className="p-2.5 rounded-full hover:bg-[#282a2d] text-zinc-405 hover:text-white transition cursor-pointer"
                title="Zobrazit historii"
              >
                <History className="h-5 w-5" />
              </button>
            </div>
          )}

        </div>

        {/* BOTTOM SIDEBAR ZONE: User controls + location indication */}
        <div className="flex flex-col gap-4 overflow-hidden shrink-0">
          
          {/* User Section */}
          <div className="border-t border-zinc-800/60 pt-4 px-1 flex flex-col gap-2">
            {loadingUser ? (
              <div className="h-10 animate-pulse bg-zinc-800 rounded-full" />
            ) : user ? (
              <div className={`flex items-center justify-between rounded-full bg-[#131314] p-1 ${sidebarExpanded ? "pl-3.5 pr-2" : "justify-center"}`}>
                {sidebarExpanded && (
                  <div className="flex flex-col truncate pr-2 select-none">
                    <span className="text-sm font-semibold text-white truncate max-w-[130px]">
                      {user.displayName || "Host"}
                    </span>
                    <span className="text-[10px] text-[#80868b] truncate max-w-[130px]">
                      {user.email}
                    </span>
                  </div>
                )}
                
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    referrerPolicy="no-referrer"
                    alt="profil"
                    className="h-8 w-8 rounded-full border border-zinc-700 shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-blue-600 text-xs font-bold text-white flex items-center justify-center shrink-0">
                    {user.displayName?.charAt(0) || "U"}
                  </div>
                )}

                {sidebarExpanded && (
                  <button 
                    onClick={handleSignOut}
                    className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-[#282a2d] rounded-full transition ml-1 cursor-pointer"
                    title="Odhlásit se"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className={`flex items-center gap-2.5 text-xs text-white p-3 rounded-full hover:bg-[#282a2d] transition duration-200 cursor-pointer ${
                  sidebarExpanded ? "bg-[#131314] hover:text-[#4285F4] border border-zinc-800 font-semibold shadow-sm justify-center" : "justify-center"
                }`}
                title="Přihlásit se přes Google"
              >
                <LogIn className="h-4.5 w-4.5 shrink-0" />
                {sidebarExpanded && <span>Přihlásit se</span>}
              </button>
            )}
          </div>


        </div>
      </aside>

      {/* 2. MAIN CONTAINER PANEL (RIGHT SIDE) */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#131314]">
        
        {/* TOP TRANSPARENT BAR containing Mode & Upgradovat */}
        <header className="h-[72px] shrink-0 flex items-center justify-between px-6 z-10 border-b border-zinc-900">
          
          {/* Logo element if sidebar is collapsed */}
          <div className="flex items-center gap-2">
            {!sidebarExpanded && (
              <div className="flex items-center gap-2 ml-1 select-none">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
                  <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#headerGeminiGradient)" />
                  <defs>
                    <linearGradient id="headerGeminiGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#4285F4" />
                      <stop offset="0.3" stopColor="#9B51E0" />
                      <stop offset="0.6" stopColor="#E040FB" />
                      <stop offset="0.9" stopColor="#FF7043" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="text-[16px] font-medium tracking-tight text-white antialiased">
                  Gemini
                </span>
              </div>
            )}
            
            {/* Active Subview Title Indicator */}
            <div className="relative z-50">
              <button
                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                className="text-xs justify-start select-none py-1 px-3 bg-[#1e1f20] hover:bg-zinc-800/80 rounded-full text-zinc-300 border border-zinc-800 font-sans sm:inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Model:</span>
                <span className="text-zinc-100 font-bold">{selectedModel}</span>
                <span className="text-[#c4c7c5] text-[9px]">▼</span>
              </button>

              {isModelMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsModelMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-56 rounded-xl bg-[#1e1f20] border border-zinc-800 p-1.5 shadow-2xl z-50 text-sans">
                    <div className="px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-zinc-500 font-bold select-none border-b border-zinc-800/50 mb-1">
                      Vyberte model bota
                    </div>
                    {[
                      "Gemma 4 31B",
                      "Gemma 4 26B",
                      "Gemini 3.1 Flash Lite"
                    ].map((modelName) => (
                      <button
                        key={modelName}
                        onClick={() => {
                          setSelectedModel(modelName);
                          setIsModelMenuOpen(false);
                        }}
                        className={`w-full text-left py-2 px-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                          selectedModel === modelName
                            ? "bg-blue-600/10 text-blue-400"
                            : "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                        }`}
                      >
                        <span>{modelName}</span>
                        {selectedModel === modelName && (
                          <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Action Widgets */}
          <div className="flex items-center gap-3.5">
            {/* Cleaner layout, no unrequested upgrade buttons */}
          </div>
        </header>

        {/* CONTAINER WORKSPACE ROUTER */}
        <section className="flex-1 w-full overflow-hidden relative">
          <AnimatePresence mode="wait">
            
            {/* VIEW A: Active chat */}
            {activeView === "chat" && (
              <motion.div
                key="view-chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full"
              >
                <AdvisorChat 
                  selectedTopic={selectedTopic} 
                  setSelectedTopic={setSelectedTopic}
                  resetTrigger={resetTrigger} 
                  chatInputTrigger={chatInputTrigger}
                  onClearChatInputTrigger={() => setChatInputTrigger(null)}
                  selectedModel={selectedModel}
                />
              </motion.div>
            )}

            {/* VIEW B: Strategic Goals List */}
            {activeView === "goals" && (
              <motion.div
                key="view-goals"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full overflow-y-auto px-6 py-6 scrollbar-thin"
              >
                <div className="max-w-4xl mx-auto flex flex-col gap-6">
                  
                  {/* Strategic objective headers */}
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white font-sans flex items-center gap-2.5">
                      <Target className="h-6 w-6 text-indigo-400" />
                      Strategické Cíle Mojeho Agenta
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed leading-normal">
                      Cíle vytyčené na základě dlouhodobých priorit a kognitivní sebereflexe systému. Kliknutím na cíl zahájíte diskuzi v jeho kontextu.
                    </p>
                  </div>

                  {goals.length === 0 ? (
                    <div className="text-center py-16 px-6 bg-[#1e1f20] rounded-2xl border border-zinc-800 text-zinc-500 text-sm">
                      Zatím nebyly sestaveny žádné strategické cíle. Spusťte mysl agenta k jejich automatickému složení.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {goals.map((g) => (
                        <div
                          key={g.id}
                          onClick={() => {
                            setSelectedTopic(`Cíl: ${g.title}`);
                            setActiveView("chat");
                          }}
                          className="p-5 rounded-2xl bg-[#1e1f20] hover:bg-[#2a2b2d] border border-zinc-800/20 hover:border-indigo-500/30 cursor-pointer shadow-sm transition duration-200 group flex items-start gap-4"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-550/10 text-indigo-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                            <Target className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">
                              {g.title}
                            </h4>
                            <p className="text-xs text-zinc-400 mt-1 font-mono leading-relaxed">
                              Vytvořeno: {new Date(g.createdAt).toLocaleDateString("cs-CZ")} • Suggested: {g.suggestedBy || "System"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* VIEW C: Backlog tasks scheduler */}
            {activeView === "tasks" && (
              <motion.div
                key="view-tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full overflow-y-auto px-6 py-6 scrollbar-thin"
              >
                <div className="max-w-4xl mx-auto flex flex-col gap-6">
                  
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white font-sans flex items-center gap-2.5">
                      <ListTodo className="h-6 w-6 text-emerald-400" />
                      Backlog Plánovaných Úkolů
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed leading-normal">
                      Sada dílčích akčních kroků, které agent naplánoval pro vyřízení strategických cílů.
                    </p>
                  </div>

                  {tasks.length === 0 ? (
                    <div className="text-center py-16 px-6 bg-[#1e1f20] rounded-2xl border border-zinc-800 text-zinc-500 text-sm">
                      V backlogu nejsou prozatím naplánovány žádné úkoly.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {tasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-4 rounded-xl bg-[#1e1f20] border border-zinc-805/30 text-zinc-200"
                        >
                          <div className="flex items-center gap-3.5 truncate">
                            <CheckCircle2 className={`h-5 w-5 shrink-0 ${t.status === "completed" ? "text-emerald-500" : "text-zinc-600"}`} />
                            <span className={`text-[14px] font-normal truncate ${t.status === "completed" ? "line-through text-zinc-500" : "text-zinc-200"}`}>
                              {t.title}
                            </span>
                          </div>
                          
                          <span className={`text-[10px] font-semibold tracking-wide font-mono px-2.5 py-1 rounded-full uppercase shrink-0 ${
                            t.priority === "high" 
                              ? "bg-red-500/15 text-red-400 border border-red-500/20" 
                              : t.priority === "medium"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                              : "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                          }`}>
                            {t.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* VIEW D: Chronological memory feeds */}
            {activeView === "memories" && (
              <motion.div
                key="view-memories"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full overflow-y-auto px-6 py-6 scrollbar-thin"
              >
                <div className="max-w-4xl mx-auto flex flex-col gap-6">
                  
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white font-sans flex items-center gap-2.5">
                      <Brain className="h-6 w-6 text-[#9B51E0]" />
                      Dlouhodobé Poznávání a Paměť
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed leading-normal">
                      Zaznamenané reflexe a ponaučení pocházející z kognitivních procesů robota, které používá jako celkový kontext pro strategické rozhodování.
                    </p>
                  </div>

                  {memories.length === 0 ? (
                    <div className="text-center py-16 px-6 bg-[#1e1f20] rounded-2xl border border-zinc-800 text-zinc-500 text-sm">
                      Zatím nejsou v mezipaměti uloženy žádné vzpomínky ani poznatky.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {memories.map((m) => (
                        <div
                          key={m.id}
                          className="p-5 rounded-2xl bg-[#1e1f20] border border-zinc-800/10 hover:border-zinc-700/40 transition duration-150 leading-relaxed text-zinc-300"
                        >
                          <p className="text-[14px] font-normal leading-relaxed text-zinc-200">
                            {m.summary}
                          </p>
                          <div className="flex items-center justify-between gap-2 mt-3.5 border-t border-zinc-800/50 pt-3 text-[10px] font-semibold font-mono text-[#80868b]">
                            <span>Důležitost ponaučení: {m.importance}/10</span>
                            <div className="flex gap-1">
                              {m.tags.map((t, idx) => (
                                <span key={idx} className="bg-zinc-800/60 px-2 py-0.5 rounded text-zinc-400">#{t}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* VIEW E: Operational Center & Autonomous Cycle Settings */}
            {activeView === "activity" && (
              <motion.div
                key="view-activity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full overflow-y-auto px-6 py-6 scrollbar-thin"
              >
                <div className="max-w-4xl mx-auto flex flex-col gap-6 select-none">
                  
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-white font-sans flex items-center gap-2.5">
                      <RefreshCw className="h-6 w-6 text-pink-400" />
                      Řídící Kognitivní Centrum bota
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed leading-normal">
                      Tato jednotka řídí autonomní plánovací cyklus, analyzuje v reálném čase úkoly a promítá své závěry do databáze Google Firestore.
                    </p>
                  </div>

                  {/* Operational parameters & Pulse Trigger */}
                  <div className="grid gap-6 md:grid-cols-2">
                    
                    {/* Column 1: Live Status Info */}
                    <div className="rounded-2xl border border-zinc-800/65 bg-[#1e1f20] p-6 flex flex-col gap-6 justify-between shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                          <span className="text-xs font-bold uppercase tracking-widest text-[#80868b] font-mono">Běžný status</span>
                          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 font-mono">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Aktivní
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-zinc-500 font-mono block">Poslední uvažování</span>
                            <span className="font-semibold text-white mt-1 block">
                              {new Date(agentState.lastWoken).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 font-mono block">Příští automatický krok</span>
                            <span className="font-semibold text-indigo-400 mt-1 block">
                              {new Date(agentState.nextWakeup).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Manual trigger pulse button */}
                      <button
                        id="btn-trigger-pulse-view"
                        onClick={handleTriggerPulse}
                        disabled={isTriggering}
                        className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-800 border border-transparent font-semibold shadow-md active:scale-98 text-sm py-4 px-4 transition cursor-pointer text-white"
                      >
                        <RefreshCw className={`h-4.5 w-4.5 ${isTriggering ? "animate-spin" : ""}`} />
                        {isTriggering ? "Agent uvažuje a ukládá do databáze..." : "Iniciovat Mysl Agenta (Kognitivní puls)"}
                      </button>
                    </div>

                    {/* Column 2: Strategy thought container */}
                    <div className="rounded-2xl border border-zinc-800/65 bg-[#1e1f20] p-6 flex flex-col gap-4 shadow-sm justify-between">
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-[#80868b] font-mono flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-indigo-400" />
                          Hlavní Myšlenkový Směr
                        </span>
                        <p className="text-sm text-zinc-100 mt-2 font-medium leading-relaxed leading-normal">
                          {agentState.mainStrategy || "Běh dokončen, analýza v pořádku."}
                        </p>
                      </div>

                      <div className="bg-[#131314] rounded-xl p-3.5 border border-zinc-800/30 text-[11px] text-[#80868b] leading-normal font-sans">
                        Když iniciujete mysl agenta, na pozadí dojde k analýze cílů a sestavení nových vzpomínek prostřednictvím modelu Google Gemini.
                      </div>
                    </div>

                  </div>

                </div>
              </motion.div>
            )}

            {/* VIEW F: Cloudflare setup instruction panel */}
            {activeView === "cloudflare" && (
              <motion.div
                key="view-cloudflare"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full overflow-y-auto px-6 py-6 scrollbar-thin"
              >
                <div className="max-w-6xl mx-auto">
                  <CloudflareSetup />
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </section>

      </main>

    </div>
  );
}
