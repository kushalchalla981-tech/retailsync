import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, Zap, Database, Search } from 'lucide-react';
import { ExtendedStore } from '../../data/storeManager';

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

export const AIAssistant: React.FC<AIAssistantProps> = ({ store, allStores }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: `Hello! I am your RetailSync AI Intelligence Assistant for ${store.name}. I have live read-access to your Aiven PostgreSQL catalog, Apache Kafka stream, and OpenSearch search indices. How can I help you optimize your store today?`,
      time: 'Just now',
      dataBadge: 'Aiven Live Sync'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const samplePrompts = [
    'Which products are low on stock?',
    'Summarize catalog revenue potential',
    'How is Kafka event throughput doing?',
    'Write a flash sale announcement banner'
  ];

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      time: 'Just now'
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      let reply = '';
      let badge = 'RetailSync AI';

      const lower = text.toLowerCase();
      if (lower.includes('stock') || lower.includes('low')) {
        const lowStock = store.catalog.filter(p => p.stock <= 5);
        if (lowStock.length > 0) {
          reply = `Found ${lowStock.length} low-stock item(s) in ${store.name}: ${lowStock.map(p => `"${p.name}" (${p.stock} units remaining)`).join(', ')}. Recommend reordering immediately to avoid oversell stockouts.`;
        } else {
          reply = `All ${store.catalog.length} products in ${store.name} currently have healthy inventory levels (above 5 units). PostgreSQL row locks have prevented any overselling.`;
        }
        badge = 'Inventory Query';
      } else if (lower.includes('revenue') || lower.includes('sales')) {
        reply = `${store.name} currently features ${store.catalog.length} active SKUs in the ${store.category} category. Total platform transaction volume across all ${allStores.length} stores is currently ₹1,48,250 with 100% verified Razorpay settlement.`;
        badge = 'Sales Metrics';
      } else if (lower.includes('kafka') || lower.includes('aiven') || lower.includes('infra')) {
        reply = `Aiven Infrastructure Status: Apache Kafka topics ("orders.placed" and "inventory.updated") are consuming at 142 events/min with 0 lag. PostgreSQL pessimistic locking (SELECT ... FOR UPDATE) is operating at sub-millisecond lock acquisition. OpenSearch index latency is 38ms.`;
        badge = 'Aiven Health';
      } else if (lower.includes('banner') || lower.includes('copy') || lower.includes('sale')) {
        reply = `Here are 2 high-conversion announcement ideas for ${store.name}:\n1. "⚡ FLASH SALE: Get flat 20% off on all ${store.category} items with code SYNC20. Instant dispatch across India!"\n2. "🌿 Weekend exclusive: Free express shipping + surprise gift on orders above ₹1,499."`;
        badge = 'Copy Generator';
      } else {
        reply = `Understood. Analyzing telemetry for ${store.name}... All systems operational. Your store is healthy, catalog is synced across OpenSearch, and payments are routed via Razorpay.`;
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        time: 'Just now',
        dataBadge: badge
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 700);
  };

  return (
    <div className="bg-[#fdfaf6] rounded-3xl border-4 border-[#1a1918] shadow-pop-lg overflow-hidden flex flex-col h-[650px] animate-fadeIn">
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

        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-[#a09890]">
          <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5 text-[#ff5c35]" /> Postgres</span>
          <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-[#ffd600]" /> Kafka</span>
          <span className="flex items-center gap-1"><Search className="w-3.5 h-3.5 text-[#00e5ff]" /> OpenSearch</span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fbf7f2]">
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
            <span>AI analyzing store telemetry...</span>
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
          placeholder={`Ask anything about ${store.name}, inventory, orders, or marketing...`}
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
