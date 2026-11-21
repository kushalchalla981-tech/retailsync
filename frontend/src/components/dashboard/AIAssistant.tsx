import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Bot, User, Zap, Database, Search, Trash2 } from 'lucide-react';
import { ExtendedStore, STOCK_BASELINE, STOCK_TOPLINE, storeManager } from '../../data/storeManager';
import { answer } from '../../utils/assistantBrain';
import { recentTelemetry } from '../../utils/telemetry';

interface AIAssistantProps {
  store: ExtendedStore;
  allStores: ExtendedStore[];
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  dataBadge?: string;
}

const MAX_SAVED = 100;
const chatKey = (storeId: string) => `retailsync_ai_chat_${storeId}`;
const stamp = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const greeting = (store: ExtendedStore): ChatMessage => ({
  id: 'm1',
  sender: 'ai',
  text: `Hello! I'm the RetailSync assistant for ${store.name}. Ask me about product prices, stock levels, orders, storefront copy and themes, or the Aiven services behind your store.`,
  time: stamp(),
  dataBadge: 'Store intelligence',
});

function loadChat(store: ExtendedStore): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatKey(store.id));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* storage unavailable */ }
  return [greeting(store)];
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ store }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(store));
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const loadedFor = useRef(store.id);

  // Switching stores loads that store's own history.
  useEffect(() => {
    if (loadedFor.current === store.id) return;
    loadedFor.current = store.id;
    setMessages(loadChat(store));
    setConfirmClear(false);
  }, [store]);

  useEffect(() => {
    try { localStorage.setItem(chatKey(loadedFor.current), JSON.stringify(messages.slice(-MAX_SAVED))); } catch { /* ignore */ }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const samplePrompts = [
    'Which products are low on stock?',
    'Show items under ₹1,000',
    'How are orders doing?',
    'How is Kafka doing?',
    'Write a flash sale announcement banner'
  ];

  const clearChat = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false);
    try { localStorage.removeItem(chatKey(store.id)); } catch { /* ignore */ }
    setMessages([greeting(store)]);
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isTyping) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, sender: 'user', text, time: stamp() }]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    window.setTimeout(() => {
      const reply = answer(text, {
        storeName: store.name,
        category: store.category,
        tagline: store.tagline,
        catalog: store.catalog,
        orders: storeManager.getOrders().filter(o => o.storeId === store.id),
        telemetry: recentTelemetry(),
        baseline: STOCK_BASELINE,
        topline: STOCK_TOPLINE,
      });
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, sender: 'ai', text: reply.text, time: stamp(), dataBadge: reply.badge }]);
      setIsTyping(false);
    }, 450);
  };

  return (
    <div className="bg-[#fdfaf6] rounded-3xl border-4 border-[#1a1918] shadow-pop-lg overflow-hidden flex flex-col h-[min(650px,calc(100dvh-10rem))] min-h-[420px] animate-fadeIn">
      {/* Header */}
      <div className="bg-[#1a1918] text-white p-5 border-b-4 border-[#1a1918] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#a7f432] border-2 border-[#1a1918] rounded-2xl flex items-center justify-center text-[#1a1918] shadow-pop">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg uppercase tracking-tight text-white">
                RetailSync AI Assistant
              </h3>
              <span className="bg-[#a7f432] text-[#1a1918] text-[10px] font-mono font-black px-2 py-0.5 rounded-full">
                ONLINE
              </span>
            </div>
            <p className="text-xs font-mono text-[#a09890]">
              Real-time intelligence for <span className="text-[#00e5ff] font-bold">{store.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-[#a09890]">
          <span className="hidden lg:flex items-center gap-1"><Database className="w-3.5 h-3.5 text-[#ff5c35]" /> Postgres</span>
          <span className="hidden lg:flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-[#ffd600]" /> Kafka</span>
          <span className="hidden lg:flex items-center gap-1"><Search className="w-3.5 h-3.5 text-[#00e5ff]" /> OpenSearch</span>
          <div className="relative">
            <button
              type="button"
              onClick={clearChat}
              onBlur={() => setConfirmClear(false)}
              aria-label={confirmClear ? 'Confirm clearing the chat history' : 'Clear chat history'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 font-black uppercase text-[10px] tracking-wider transition-colors ${confirmClear ? 'bg-[#ff5c35] border-[#ff5c35] text-white' : 'border-white/30 text-white hover:bg-white/10'}`}
            >
              <Trash2 className="w-3.5 h-3.5" /> {confirmClear ? 'Confirm' : 'Clear chat'}
            </button>
            {confirmClear && (
              <span role="tooltip" className="absolute right-0 top-full mt-2 w-48 z-10 bg-white text-[#1a1918] border-2 border-[#1a1918] rounded-xl p-2 text-[11px] shadow-pop">
                Delete this store's chat history? Click Confirm.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scroller} aria-live="polite" className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4 bg-[#fbf7f2]">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-8 h-8 rounded-xl border-2 border-[#1a1918] flex items-center justify-center shrink-0 ${
                m.sender === 'ai' ? 'bg-[#a7f432] text-[#1a1918]' : 'bg-[#1a1918] text-white'
              }`}
            >
              {m.sender === 'ai' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[80%] rounded-2xl p-4 border-2 border-[#1a1918] shadow-pop ${
                m.sender === 'ai'
                  ? 'bg-white text-[#1a1918]'
                  : 'bg-[#1a1918] text-[#fdfaf6]'
              }`}
            >
              {m.dataBadge && (
                <span className="inline-block bg-[#f0e5d8] text-[#ff5c35] text-[10px] font-mono font-black px-2 py-0.5 rounded border border-[#1a1918]/20 mb-2 uppercase">
                  {m.dataBadge}
                </span>
              )}
              <p className="text-xs sm:text-sm font-mono leading-relaxed whitespace-pre-line">
                {m.text}
              </p>
              <span className="block text-[9px] font-mono opacity-60 text-right mt-1.5">
                {m.time}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs font-mono text-[#786f66] bg-white w-fit px-3 py-1.5 rounded-full border border-[#1a1918]">
            <Sparkles className="w-3.5 h-3.5 text-[#ff5c35] animate-spin" />
            <span>Checking {store.name}'s data…</span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="p-3 bg-[#f0e5d8] border-t-2 border-[#1a1918] flex gap-2 overflow-x-auto">
        {samplePrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            className="px-3 py-1 bg-white hover:bg-[#1a1918] hover:text-white rounded-full border border-[#1a1918] font-mono text-[11px] font-bold text-[#1a1918] whitespace-nowrap transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-white border-t-2 border-[#1a1918] flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Ask about ${store.name}'s prices, stock, orders, marketing or infrastructure…`}
          aria-label="Ask the store assistant"
          className="flex-1 px-4 py-2.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="bg-[#1a1918] text-white p-2.5 rounded-xl border-2 border-[#1a1918] shadow-pop hover:bg-[#ff5c35] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
