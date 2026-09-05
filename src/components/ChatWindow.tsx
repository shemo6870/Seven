import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, X, Smile, Loader2, User, Image as ImageIcon, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { auth } from '../lib/firebase';
import { getOrCreateChat, sendMessage, fetchMessages, Message as MessageType, Chat as ChatType, markAsRead, fetchChats, setTypingStatus, listenToChats, listenToMessages } from '../services/chatService';
import { compressImage } from '../lib/image-utils';

export default function ChatWindow() {
  const [isOpen, setIsOpen] = useState(false);
  const [chat, setChat] = useState<ChatType | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = auth.currentUser;
  const [isSeller, setIsSeller] = useState(false);

  useEffect(() => {
    if (user) {
      // Check if user is seller by email or phone
      const sellerEmails = ['mahmoudmasry165@gmail.com', '201115454823@seven.store', '01115454823@seven.store'];
      const isS = sellerEmails.includes(user.email || '') || 
                  user.phoneNumber === '+201115454823' || 
                  user.phoneNumber === '201115454823';
      setIsSeller(isS);
    }
  }, [user]);

  // Listen to the user's chat to track unread messages
  useEffect(() => {
    if (!user) return;
    
    // Use real-time listener for chats
    const unsubscribe = listenToChats(false, user.uid, (chats) => {
      if (chats && chats.length > 0) {
        setChat(chats[0]);
      }
    });
    
    return () => unsubscribe();
  }, [user]);

  // Mark as read when window is open and there are unread messages
  useEffect(() => {
    if (isOpen && chat?.id && chat.buyerUnreadCount && chat.buyerUnreadCount > 0) {
      markAsRead(chat.id, false);
    }
  }, [isOpen, chat?.id, chat?.buyerUnreadCount]);

  useEffect(() => {
    if (isOpen && user && !chat) {
      const initChat = async () => {
        setLoading(true);
        setChatError(null);
        try {
          const c = await getOrCreateChat(user.uid);
          setChat(c);
        } catch (error: any) {
          console.error('Error initializing chat:', error);
          setChatError(error.message || 'Error occurred');
        } finally {
          setLoading(false);
        }
      };
      initChat();
    }
  }, [isOpen, user, chat]);

  useEffect(() => {
    if (chat?.id) {
      // Use real-time listener for messages
      const unsubscribe = listenToMessages(chat.id, (msgs) => {
        setMessages(msgs);
      });
      
      return () => unsubscribe();
    }
  }, [chat?.id]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  // Scroll to bottom whenever messages or isOpen changes
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // Short delay to ensure DOM is rendered
      const timeoutId = setTimeout(scrollToBottom, 100);
      const timeoutId2 = setTimeout(scrollToBottom, 500); // Additional delay for images
      return () => {
        clearTimeout(timeoutId);
        clearTimeout(timeoutId2);
      };
    }
  }, [isOpen, messages.length, chat?.sellerTyping]);

  // Typing status logic
  useEffect(() => {
    if (!chat?.id || !isOpen) return;
    
    let typingTimeout: NodeJS.Timeout;
    const isTyping = inputText.trim().length > 0;
    
    // Update status in Firestore
    setTypingStatus(chat.id, false, isTyping);
    
    // If user is typing, set a timeout to clear it after a period of inactivity
    if (isTyping) {
      typingTimeout = setTimeout(() => {
        setTypingStatus(chat.id, false, false);
      }, 3000);
    }

    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [inputText, chat?.id, isOpen]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chat?.id || !user) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        try {
          const compressed = await compressImage(dataUrl, 600, 0.5);
          await sendMessage(chat.id, '', user.uid, compressed);
        } catch (err) {
          console.error('Compression error:', err);
          await sendMessage(chat.id, '', user.uid, dataUrl);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chat?.id || !user) return;

    const text = inputText.trim();
    setInputText('');
    setShowEmoji(false);
    try {
      await sendMessage(chat.id, text, user.uid);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  if (!user || isSeller) return null;

  return (
    <div className="relative z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-4 w-[90vw] sm:w-[380px] h-[550px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">دردشة مباشرة مع Seven</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-[10px] opacity-80 uppercase tracking-widest font-black">متصل الآن</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <Loader2 className="animate-spin" size={32} />
                  <span className="text-sm font-medium">جاري بدء الدردشة...</span>
                </div>
              ) : chatError ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
                    <MessageCircle size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">عذراً، الدردشة غير متاحة حالياً</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      الرجاء المحاولة لاحقاً.
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <MessageCircle size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">أهلاً بك في دردشة Seven</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      يسعدنا خدمتك! اترك رسالتك وسنقوم بالرد عليك في أقرب وقت ممكن.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] flex flex-col ${msg.senderId === user.uid ? 'items-end' : 'items-start'}`}>
                      <span className={`text-[10px] mb-1 font-black ${msg.senderId === user.uid ? 'text-blue-600' : 'text-gray-400'}`}>
                        {msg.senderId === user.uid ? 'أنت' : 'Seven (المتجر)'}
                      </span>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                        msg.senderId === user.uid 
                          ? 'bg-blue-600 text-white rounded-bl-none shadow-md shadow-blue-200' 
                          : 'bg-white text-gray-800 border border-gray-100 rounded-br-none shadow-sm'
                      }`}>
                      {msg.imageUrl ? (
                        <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                          <img 
                            src={msg.imageUrl} 
                            alt="Chat image" 
                            onLoad={scrollToBottom}
                            className="max-w-full h-auto object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : null}
                      {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                      <div className={`text-[10px] mt-1 opacity-60 ${msg.senderId === user.uid ? 'text-white/80' : 'text-gray-400'}`}>
                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
              )}
              {chat?.sellerTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-400 px-4 py-2 rounded-2xl rounded-br-none border border-gray-100 shadow-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] font-bold">Seven يكتب الآن...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input & Emoji Picker Area */}
            {!chatError && (
            <div className="p-4 bg-white border-t border-gray-100 relative">
              {/* Emoji Picker Overlay */}
              {showEmoji && (
                <div className="absolute bottom-full left-4 right-4 z-50 mb-2">
                  <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden h-[300px]">
                    <EmojiPicker 
                      onEmojiClick={onEmojiClick} 
                      width="100%" 
                      height="100%" 
                      previewConfig={{ showPreview: false }}
                      searchDisabled
                      skinTonesDisabled
                    />
                  </div>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                <button 
                  type="button"
                  onClick={() => setShowEmoji(!showEmoji)}
                  className={`p-2 transition-colors ${showEmoji ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                  title="رموز تعبيرية"
                >
                  <Smile size={22} />
                </button>
                
                <label className="p-2 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer relative">
                  {isUploading ? (
                    <Loader2 size={22} className="animate-spin text-blue-600" />
                  ) : (
                    <ImageIcon size={22} />
                  )}
                  <input 
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>

                <input 
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => setShowEmoji(false)}
                  placeholder="اكتب رسالتك هنا..."
                  className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  <Send size={18} className="translate-x-0.5" />
                </button>
              </form>
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative ${
          isOpen ? 'bg-white text-blue-600 border border-gray-100' : 'bg-blue-600 text-white'
        }`}
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
        
        {/* Unread Count Badge */}
        {!isOpen && chat?.buyerUnreadCount && chat.buyerUnreadCount > 0 ? (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-sm shadow-red-200"
          >
            {chat.buyerUnreadCount > 9 ? '+9' : chat.buyerUnreadCount}
          </motion.div>
        ) : null}

        {!isOpen && (
          <span className="absolute right-full mr-4 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none -translate-x-2 group-hover:translate-x-0">
            دردش معنا
          </span>
        )}
      </button>
    </div>
  );
}
