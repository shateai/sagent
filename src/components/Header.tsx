import { useState, useEffect } from "react";
import { User, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { LogIn, LogOut, Shield, Bot, DollarSign, Cpu } from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  return (
    <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        
        {/* Brand logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded bg-indigo-650 font-bold text-white shadow-lg shadow-indigo-600/20">
            <Bot className="h-4 w-4" />
            <motion.div 
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-zinc-950"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2 uppercase">
              Chytrý AI Agent
              <span className="rounded bg-indigo-600/10 px-2 py-0.5 text-[9px] font-semibold text-indigo-400 border border-indigo-600/20 uppercase tracking-widest">Active</span>
            </h1>
            <p className="text-[10px] text-zinc-400 font-medium">Autonomní asistent s vlastní pamětí, cíli a úkoly</p>
          </div>
        </div>

        {/* Navigation & User controls */}
        <div className="flex flex-wrap items-center gap-4">
          <nav className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              id="tab-chat"
              onClick={() => setActiveTab("chat")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                activeTab === "chat"
                  ? "bg-zinc-850 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Chat s Agentem
            </button>
            <button
              id="tab-cloudflare"
              onClick={() => setActiveTab("cloudflare")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                activeTab === "cloudflare"
                  ? "bg-zinc-850 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Návod na Nasazení
            </button>
          </nav>

          {/* User Sign In and Profile Status */}
          {loading ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-850" />
          ) : user ? (
            <div className="flex items-center gap-3 bg-zinc-950 pl-3 pr-1 py-1 rounded-full border border-zinc-800">
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-white max-w-[120px] truncate">
                  {user.displayName || "Uživatel"}
                </span>
                <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1 leading-none">
                  <Shield className="h-2 w-2 text-indigo-600" />
                  {user.email === "devonkarel@gmail.com" ? "Administrátor" : "Pozorovatel"}
                </span>
              </div>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  referrerPolicy="no-referrer"
                  alt="avatar"
                  className="h-8 w-8 rounded-full border border-zinc-700 bg-zinc-800"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}
              <button
                id="btn-signout"
                onClick={handleSignOut}
                title="Odhlásit se"
                className="p-2 rounded-full text-zinc-400 hover:text-red-400 hover:bg-zinc-850 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              id="btn-signin"
              onClick={handleSignIn}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-600/90 text-white px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-95 border border-zinc-800"
            >
              <LogIn className="h-4 w-4" />
              Přihlásit se přes Google
            </button>
          )}

        </div>

      </div>
    </header>
  );
}
