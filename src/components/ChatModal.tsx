import { useState, useEffect, useRef } from 'react';
import { http } from '../lib/api';
import { openTicketedStream, rideStreamUrl, type TicketedStreamHandle } from '../lib/sseTicket';

export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderRole: 'Customer' | 'Driver';
  senderName: string;
  text: string;
  timestamp: string;
  isAutoArrival?: boolean;
}

export interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  currentUserId: string;
  currentUserRole: 'Customer' | 'Driver';
  currentUserName: string;
  peerName: string;
  peerPhone?: string;
  peerRole?: string;
}

export default function ChatModal({
  isOpen,
  onClose,
  requestId,
  currentUserId,
  currentUserRole,
  currentUserName,
  peerName,
  peerPhone,
  peerRole = currentUserRole === 'Customer' ? 'كابتن توصيله' : 'الراكب',
}: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const quickChips =
    currentUserRole === 'Customer'
      ? ['أنا نازل حالاً 🏃‍♂️', 'أنا عند الباب 🚪', 'تمام كابتن 👍', 'أي سيارة أنت؟ 🚗']
      : ['وصلت لموقعك 📍', 'دقيقة وأكون عندك ⏳', 'أنا بانتظارك 🚖', 'تمام يا هلا 👍'];

  // التمرير لأسفل عند وصول رسائل جديدة
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isOpen || !requestId) return;

    let isMounted = true;
    const fetchMessages = async () => {
      if (document.hidden) return;
      try {
        const { data } = await http.get<{ success: boolean; messages: ChatMessage[] }>(
          `/chat/messages?requestId=${encodeURIComponent(requestId)}`
        );
        if (isMounted && data?.success && Array.isArray(data.messages)) {
          setMessages((prev) => {
            const serverMsgs = data.messages;
            // Retain optimistic messages that haven't yet been confirmed/matched by server
            const unconfirmedOptimistic = prev.filter(
              (p) =>
                p.id.startsWith('opt-') &&
                !serverMsgs.some((s) => s.text === p.text && s.senderRole === p.senderRole)
            );
            return [...serverMsgs, ...unconfirmedOptimistic];
          });
        }
      } catch (_) {}
    };

    void fetchMessages();
    const interval = setInterval(fetchMessages, 2500);

    // Real-time SSE listener for instant message delivery without waiting for polling
    let stream: TicketedStreamHandle | null = null;
    try {
      stream = openTicketedStream({
        buildUrl: (authParam) => rideStreamUrl(requestId, authParam),
        setup: (es) => {
      es.addEventListener('chat_message', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          const newMsg = (payload.message || payload) as ChatMessage;
          if (newMsg && newMsg.text && isMounted) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              const hasOpt = prev.some(
                (m) => m.id.startsWith('opt-') && m.text === newMsg.text && m.senderRole === newMsg.senderRole
              );
              if (hasOpt) {
                return prev.map((m) =>
                  m.id.startsWith('opt-') && m.text === newMsg.text && m.senderRole === newMsg.senderRole ? newMsg : m
                );
              }
              return [...prev, newMsg];
            });
          }
        } catch (_) {}
      });
        },
      });
    } catch (_) {}

    return () => {
      isMounted = false;
      clearInterval(interval);
      stream?.close();
    };
  }, [isOpen, requestId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!isOpen) return null;

  async function handleSend(textOverride?: string) {
    const textToSend = (textOverride || inputText).trim();
    if (!textToSend || !requestId || sending) return;

    if (!textOverride) setInputText('');

    const optimisticMsg: ChatMessage = {
      id: 'opt-' + Date.now(),
      requestId,
      senderId: currentUserId || 'me',
      senderRole: currentUserRole,
      senderName: currentUserName,
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    try {
      const { data } = await http.post<{ success: boolean; message: ChatMessage }>('/chat/send', {
        requestId,
        senderId: currentUserId || 'me',
        senderRole: currentUserRole,
        senderName: currentUserName,
        text: textToSend,
      });

      if (data?.success && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMsg.id ? data.message : m))
        );
      }
    } catch (_) {
      // إبقاء الرسالة لتجربة مستخدم سلسة
    } finally {
      setSending(false);
    }
  }

  function formatTime(isoString: string) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs font-cairo select-none transition-opacity animate-fade-in"
      dir="rtl"
    >
      <div
        className="flex h-[92dvh] sm:h-[82vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-sheet overflow-hidden border border-slate-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط السحب على شاشات الموبايل */}
        <div className="flex sm:hidden justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {/* 1. الترويسة العلوية */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#1B4965] font-black text-[18px] border border-slate-200/60">
              {currentUserRole === 'Customer' ? '🚖' : '👤'}
            </div>
            <div>
              <p className="text-[15px] font-black text-gray-900 leading-tight">{peerName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11.5px] font-bold text-gray-500">{peerRole}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {peerPhone && (
              <>
                <button
                  type="button"
                  onClick={() => window.open(`tel:${peerPhone}`)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
                  title="اتصال هاتفي"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const clean = String(peerPhone).replace(/[^0-9]/g, '').replace(/^0+/, '');
                    const intlPhone = clean.startsWith('964') ? clean : `964${clean}`;
                    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent('السلام عليكم، بخصوص رحلة توصيلة')}`, '_blank', 'noopener,noreferrer');
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition active:scale-95 cursor-pointer"
                  title="مراسلة عبر واتساب"
                >
                  <span className="text-base">💬</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition active:scale-95 cursor-pointer"
              title="إغلاق المحادثة"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* 2. منطقة عرض الرسائل */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fafc]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-gray-400">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-3xl mb-3 shadow-inner">
                💬
              </div>
              <p className="text-[15px] font-bold text-gray-700">المحادثة المباشرة للرحلة</p>
              <p className="text-[12px] text-gray-400 mt-1 max-w-xs">
                يمكنك التنسيق مع الطرف الآخر فوراً حول موقع الركوب والوقت.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe =
                msg.senderId === currentUserId ||
                msg.senderRole === currentUserRole;

              if (msg.isAutoArrival) {
                return (
                  <div
                    key={msg.id}
                    className="mx-auto my-2 max-w-[90%] rounded-2xl bg-amber-50 border border-amber-200/80 p-3.5 text-center shadow-xs animate-fade-in"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-amber-800 font-black text-[13px] mb-1">
                      <span className="text-base">🚖</span>
                      <span>إشعار وصول الكابتن</span>
                    </div>
                    <p className="text-[13.5px] font-bold text-gray-800">{msg.text}</p>
                    <span className="mt-1 block text-[10px] font-medium text-gray-400">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[78%] rounded-xl px-4 py-2.5 text-[14px] leading-relaxed shadow-card ${
                      isMe
                        ? 'bg-[#1B4965] text-white rounded-br-xs'
                        : 'bg-white text-[#1A1A1A] border border-slate-200 rounded-bl-xs'
                    }`}
                  >
                    <p className="font-semibold">{msg.text}</p>
                  </div>
                  <span className="mt-1 px-1 text-[10px] font-medium text-[#6C757D]">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 3. الردود السريعة */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2 bg-white border-t border-slate-100 no-scrollbar shrink-0">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(chip)}
              className="whitespace-nowrap rounded-lg bg-slate-100 hover:bg-slate-200/80 hover:text-[#1B4965] px-3 py-1.5 text-[12px] font-bold text-[#1A1A1A] transition active:scale-95 cursor-pointer shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* 4. حقل كتابة الرسالة */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-3.5 pb-safe shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              currentUserRole === 'Customer'
                ? 'اكتب رسالة للكابتن...'
                : 'اكتب رسالة للراكب...'
            }
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] font-semibold text-[#1A1A1A] focus:bg-white focus:border-[#1B4965] focus:ring-2 focus:ring-[#1B4965]/10 focus:outline-none transition"
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!inputText.trim() || sending}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1B4965] text-white shadow-subtle transition hover:bg-[#14364A] active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
            title="إرسال"
          >
            <svg
              className="h-5 w-5 transform -rotate-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
