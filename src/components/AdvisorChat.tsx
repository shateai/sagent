import { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import { collection, addDoc, query, where, orderBy, onSnapshot, getDocs, deleteDoc } from "firebase/firestore";
import { UserMessage } from "../types";
import { Send, ArrowUp, Sparkles, Mic, History, X, Compass, Code, PenTool, LayoutGrid, AlertTriangle, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";

interface AdvisorChatProps {
  selectedTopic: string | undefined;
  setSelectedTopic: (topic: string | undefined) => void;
  resetTrigger?: number;
  chatInputTrigger?: { text: string; timestamp: number } | null;
  onClearChatInputTrigger?: () => void;
  selectedModel?: string;
}

// Security error-handling infrastructure as mandated by rules
enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
}

const PRESETS = [
  {
    text: "Jaké jsou tvé současné strategické cíle a jak jich hodláš dosáhnout?",
    icon: Compass,
    iconColor: "text-blue-400"
  },
  {
    text: "Napiš mi jednoduchý Python skript pro stažení a analýzu dat z libovolného webu.",
    icon: Code,
    iconColor: "text-emerald-400"
  },
  {
    text: "Jak si mohu vybudovat ucelenou znalostní bázi a automatizovat běžnou denní rutinu?",
    icon: PenTool,
    iconColor: "text-amber-400"
  },
  {
    text: "Pomoz mi naplánovat nový projekt a rozdělit ho na jednotlivé podúkoly.",
    icon: LayoutGrid,
    iconColor: "text-purple-400"
  }
];

export function AdvisorChat({ selectedTopic, setSelectedTopic, resetTrigger, chatInputTrigger, onClearChatInputTrigger, selectedModel = "Gemma 4 31B" }: AdvisorChatProps) {
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [localMessages, setLocalMessages] = useState<UserMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ahoj! Jsem tvůj inteligentní společník. Pomohu ti naplánovat strategii, napsat kód, analyzovat cíle nebo odpovědět na jakékoliv zvídavé otázky. Čím začneme?",
      createdAt: new Date().toISOString(),
      ownerId: "system"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Set input from history select
  useEffect(() => {
    if (chatInputTrigger) {
      setInputText(chatInputTrigger.text);
      if (onClearChatInputTrigger) {
        onClearChatInputTrigger();
      }
    }
  }, [chatInputTrigger, onClearChatInputTrigger]);

  // Monitor user state
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubAuth();
  }, []);

  // Sync real-time Firestore database for logged-in tenants
  useEffect(() => {
    if (!user) {
      setMessages([]);
      return;
    }

    const path = "user_messages";
    try {
      // Secure "Query Enforcer" - must match the exact security rule filter 'ownerId == uid'
      const q = query(
        collection(db, path),
        where("ownerId", "==", user.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loaded: UserMessage[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          loaded.push({
            id: doc.id,
            role: d.role,
            content: d.content,
            createdAt: d.createdAt,
            ownerId: d.ownerId,
          });
        });
        
        // Sort in-memory to prevent missing Firestore index errors
        loaded.sort((a, b) => {
          const timeA = a.createdAt || "";
          const timeB = b.createdAt || "";
          return timeA.localeCompare(timeB);
        });

        setMessages(loaded);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      });

      return () => unsubscribe();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }, [user]);

  // Handle reset trigger
  useEffect(() => {
    if (resetTrigger) {
      setLocalMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Spuštěna nová konverzace. Zeptej se mě na cokoliv!",
          createdAt: new Date().toISOString(),
          ownerId: "system"
        }
      ]);
      setErrorAlert(null);
    }
  }, [resetTrigger]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, localMessages, isSending]);

  const activeMessages = user ? messages : localMessages;

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isSending) return;
    setIsSending(true);
    setInputText("");
    setErrorAlert(null);

    const timestamp = new Date().toISOString();
    const cleanText = selectedTopic 
      ? `[Kontext: ${selectedTopic}] ${textToSend}`
      : textToSend;

    try {
      // 1. Save user message
      if (user) {
        const path = "user_messages";
        try {
          await addDoc(collection(db, path), {
            role: "user",
            content: cleanText,
            createdAt: timestamp,
            ownerId: user.uid,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        setLocalMessages(prev => [
          ...prev,
          {
            id: `usr_${Date.now()}`,
            role: "user",
            content: cleanText,
            createdAt: timestamp,
            ownerId: "local"
          }
        ]);
      }

      // 2. Fetch from Gemini endpoint
      const bodyMessages = user 
        ? [...messages, { role: "user", content: cleanText }]
        : [...localMessages, { role: "user", content: cleanText }];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: bodyMessages,
          model: selectedModel
        }),
      });

      let responseData: any = null;
      let textResponse = "";
      try {
        textResponse = await response.text();
        if (textResponse.trim().startsWith("<")) {
          // It's an HTML response from Nginx/platform - usually happens on 403 / 500 blocked proxies
          throw new Error("Ahoj! Zeptat se bota se nepodařilo, protože váš Google AI Studio projekt nemá přístup k Gemini API (Permission Denied/403). Ujistěte se prosím, že máte platný Gemini API klíč v postranním menu v sekci Settings > Secrets.");
        }
        responseData = JSON.parse(textResponse);
      } catch (jsonErr: any) {
        console.error("Failed to parse response JSON", jsonErr);
        throw new Error(jsonErr.message || "Nepodařilo se dekódovat odpověď ze serveru.");
      }

      if (!response.ok || responseData?.success === false) {
        const errorMsg = responseData?.error || "Při komunikaci s AI nastala chyba.";
        throw new Error(errorMsg);
      }

      const aiContent = responseData?.content || "Omlouvám se, nepodařilo se získat odpověď.";

      // 3. Save assistant response
      if (user) {
        const path = "user_messages";
        try {
          await addDoc(collection(db, path), {
            role: "assistant",
            content: aiContent,
            createdAt: new Date().toISOString(),
            ownerId: user.uid,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        setLocalMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: "assistant",
            content: aiContent,
            createdAt: new Date().toISOString(),
            ownerId: "local"
          }
        ]);
      }

    } catch (error) {
      console.error(error);
      const errMsg = error instanceof Error ? error.message : "Chyba: Nepodařilo se dokončit požadavek s AI.";
      setErrorAlert(errMsg);
    } finally {
      setIsSending(false);
    }
  };

  const handlePresetClick = (preset: string) => {
    sendMessage(preset);
  };

  const greetingName = user?.displayName ? `, ${user.displayName.split(" ")[0]}` : "";

  return (
    <div className="flex flex-col flex-1 h-full select-none bg-[#131314] relative">
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        
        {activeMessages.length <= 1 && !isSending ? (
          /* Empty Chat / Welcome screen identical to Gemini */
          <div className="max-w-3xl w-full mx-auto flex flex-col justify-center pt-32 md:pt-48 pb-10">
            
            {/* Main Welcome gradient headers */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight font-sans leading-tight bg-gradient-to-r from-[#4285F4] via-[#9B51E0] via-[#E040FB] to-[#FF7043] bg-clip-text text-transparent">
                Ahoj{greetingName}
              </h1>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight font-sans leading-tight text-[#444746] mt-3">
                V čem vám mohu dnes pomoci?
              </h2>
            </motion.div>
          </div>
        ) : (
          /* Dialog Stream */
          <div className="max-w-3xl w-full mx-auto flex flex-col gap-6 pt-4 pb-20">
            {activeMessages.map((msg, index) => {
              const isBot = msg.role === "assistant";
              return (
                <div
                  key={msg.id || index}
                  className={`flex gap-4 md:gap-6 ${isBot ? "items-start w-full" : "justify-end"}`}
                >
                  {isBot && (
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-transparent">
                      {/* Gradient Sparkle SVG matching Gemini */}
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6">
                        <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#chatGeminiGradient)" />
                        <defs>
                          <linearGradient id="chatGeminiGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#4285F4" />
                            <stop offset="0.3" stopColor="#9B51E0" />
                            <stop offset="0.6" stopColor="#E040FB" />
                            <stop offset="0.9" stopColor="#FF7043" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  )}

                  <div className={`text-sm leading-relaxed ${
                    isBot 
                      ? "text-[#dfdfdf] flex-1 pt-1 md:text-[15px]" 
                      : "bg-[#1e1f20] text-zinc-100 rounded-[24px] px-6 py-3.5 max-w-[80%] break-words md:text-[15px]"
                  }`}>
                    {isBot ? (
                      <div className="markdown-body prose prose-invert max-w-none
                        [&>p]:mb-4 [&>p:last-child]:mb-0 [&>p]:leading-relaxed
                        [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4
                        [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4
                        [&>strong]:text-white [&>strong]:font-semibold
                        [&>code]:font-mono [&>code]:text-xs [&>code]:bg-[#2a2b2d] [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-[#c1c7f4]
                        [&>pre]:bg-[#0c0d0e] [&>pre]:p-4 [&>pre]:rounded-2xl [&>pre]:border [&>pre]:border-zinc-800 [&>pre]:my-4 [&>pre_code]:text-zinc-200 [&>pre_code]:text-xs [&>pre_code]:bg-transparent [&>pre_code]:p-0
                      ">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex gap-4 md:gap-6 items-start w-full">
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-transparent">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 animate-pulse">
                    <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#typingGeminiGradient)" />
                    <defs>
                      <linearGradient id="typingGeminiGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#4285F4" />
                        <stop offset="0.3" stopColor="#9B51E0" />
                        <stop offset="0.6" stopColor="#E040FB" />
                        <stop offset="0.9" stopColor="#FF7043" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  <span className="h-2 w-2 rounded-full bg-[#4285F4] animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-2 w-2 rounded-full bg-[#9B51E0] animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-2 w-2 rounded-full bg-[#FF7043] animate-bounce"></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Persistent floating indicator / Context overlay above input */}
      {selectedTopic && (
        <div className="w-full max-w-3xl mx-auto px-4 shrink-0 transition-all">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#1e1f20] border border-zinc-800/60 mb-2 text-xs">
            <span className="text-[#a8b3cf] flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              Dotaz v kontextu: <strong className="text-white">{selectedTopic}</strong>
            </span>
            <button 
              onClick={() => setSelectedTopic(undefined)}
              className="text-[#a8b3cf] hover:text-red-400 p-1 rounded-full hover:bg-zinc-800/50 transition cursor-pointer"
              title="Zrušit kontext"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating error box */}
      {errorAlert && (
        <div className="w-full max-w-3xl mx-auto px-4 shrink-0">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex flex-col gap-1.5 mb-2">
            <span className="font-bold flex items-center gap-1.5"><AlertTriangle className="h-4.5 w-4.5 text-red-500 shrink-0" /> Chyba:</span>
            <p className="leading-relaxed">{errorAlert}</p>
          </div>
        </div>
      )}

      {/* Centered Sticky Bottom Input Panel */}
      <div className="w-full shrink-0 bg-[#131314] pb-6 pt-3 px-4 z-10 border-t border-zinc-900">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText);
          }}
          className="max-w-3xl w-full mx-auto"
        >
          
          <div className="flex items-center w-full bg-[#1e1f20] rounded-[32px] px-6 py-2.5 shadow-md relative group hover:bg-[#202124] transition duration-250">
            {/* Input box */}
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Napište zprávu pro ${selectedModel}...`}
              className="flex-1 text-[15px] text-zinc-100 placeholder-[#80868b] bg-transparent outline-none border-none py-2 w-full focus:ring-0 focus:outline-none"
            />

            {/* Controls right-aligned inside the pill */}
            <div className="flex items-center gap-4 text-[#c4c7c5] shrink-0 font-sans">
              <span className="text-[11px] bg-[#131314] px-3 py-1.5 rounded-full text-zinc-400 border border-zinc-800 select-none hidden md:inline-flex items-center gap-1 font-semibold">
                {selectedModel}
              </span>
              <button 
                type="button"
                className="hover:text-white transition p-1.5 rounded-full hover:bg-zinc-800/40 cursor-pointer" 
                title="Hlasové zadávání"
              >
                <Mic className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
              
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className={`p-2 rounded-full transition duration-200 shrink-0 ${
                  inputText.trim() && !isSending
                    ? "bg-[#4285F4] text-white hover:bg-[#357ae8]"
                    : "text-zinc-600 cursor-not-allowed"
                }`}
                title="Odeslat zprávu"
              >
                <ArrowUp className="h-5 w-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Under input Gemini disclaimer banner */}
          <p className="text-[11px] text-center text-[#80868b] mt-3 tracking-normal leading-normal font-sans select-none">
            Gemini může dělat chyby. Ověřujte si proto důležité informace.{" "}
            <a href="https://support.google.com/gemini" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400 transition ml-0.5">
              Vaše soukromí a aplikace Gemini
            </a>
          </p>
        </form>
      </div>

    </div>
  );
}
