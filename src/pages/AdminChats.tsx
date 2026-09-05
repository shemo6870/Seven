import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  addDoc 
} from 'firebase/firestore';
import { 
  MessageCircle, 
  User, 
  Search, 
  Send, 
  Clock, 
  ChevronLeft,
  Loader2,
  CheckCheck,
  Image as ImageIcon,
  Smile,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Chat, Message, fetchChats, fetchMessages, sendMessage, deleteChat, markAsRead, setTypingStatus, listenToChats, listenToMessages, getOrCreateChat } from '../services/chatService';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { compressImage } from '../lib/image-utils';

export default function AdminChats({ initialUserId }: { initialUserId?: string | null }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    
    // Initialize initial chat if provided
    if (initialUserId) {
      getOrCreateChat(initialUserId).then(chatDoc => {
         if (chatDoc) {
           setSelectedChat(chatDoc);
         }
      }).catch(err => console.error("Error creating/getting initial chat:", err));
    }
  }, [user, initialUserId]);

  useEffect(() => {
    if (!user) return;

    // Use real-time listener for chats list
    const unsubscribe = listenToChats(true, user.uid, (data) => {
      setChats(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Keep selectedChat in sync with chats list (for unread counts)
  useEffect(() => {
    if (selectedChat) {
      const updated = chats.find(c => c.id === selectedChat.id);
      if (updated && (updated.sellerUnreadCount !== selectedChat.sellerUnreadCount || updated.lastMessageAt !== selectedChat.lastMessageAt || updated.buyerTyping !== selectedChat.buyerTyping)) {
        setSelectedChat(updated);
      }
    }
  }, [chats, selectedChat]);

  useEffect(() => {
    if (selectedChat?.id) {
      // Mark as read if there are unread messages for seller
      if (selectedChat.sellerUnreadCount && selectedChat.sellerUnreadCount > 0) {
        markAsRead(selectedChat.id, true);
      }

      // Use real-time listener for messages in current chat
      const unsubscribe = listenToMessages(selectedChat.id, (msgs) => {
        setMessages(msgs);
      });

      return () => unsubscribe();
    }
  }, [selectedChat?.id]);

  // Scroll to bottom whenever messages or selectedChat changes
  useEffect(() => {
    if (selectedChat?.id && scrollRef.current) {
      const scroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      };
      // Short delay to ensure DOM is rendered
      const timeoutId = setTimeout(scroll, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedChat?.id, messages, selectedChat?.buyerTyping]);

  // Typing status logic
  useEffect(() => {
    if (!selectedChat?.id || !user) return;
    
    let typingTimeout: NodeJS.Timeout;
    const isTyping = inputText.trim().length > 0;
    
    // Update status in Firestore (as seller)
    setTypingStatus(selectedChat.id, true, isTyping);
    
    // If user is typing, set a timeout to clear it after a period of inactivity
    if (isTyping) {
      typingTimeout = setTimeout(() => {
        setTypingStatus(selectedChat.id, true, false);
      }, 3000);
    }

    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [inputText, selectedChat?.id, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChat?.id || !user) return;

    const text = inputText.trim();
    setInputText('');
    setShowEmoji(false);
    try {
      await sendMessage(selectedChat.id, text, user.uid);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat?.id || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً (أكثر من 5 ميجابايت)');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        try {
          const compressed = await compressImage(dataUrl, 600, 0.5);
          await sendMessage(selectedChat.id, '', user.uid, compressed);
        } catch (err) {
          console.error('Compression error:', err);
          await sendMessage(selectedChat.id, '', user.uid, dataUrl);
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      setIsUploading(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedChat?.id) return;
    if (confirm('هل أنت متأكد من حذف هذه المحادثة نهائياً؟')) {
      try {
        await deleteChat(selectedChat.id);
        setSelectedChat(null);
        alert('تم حذف المحادثة بنجاح');
      } catch (error) {
        console.error('Error deleting chat:', error);
        alert('حدث خطأ أثناء حذف المحادثة');
      }
    }
  };

  const filteredChats = chats.filter(c => 
    c.buyerName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-200px)] bg-white rounded-3xl shadow-sm border border-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full md:w-80 border-l border-gray-100 flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-black text-gray-900 mb-4">المحادثات</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث في المحادثات..."
              className="w-full bg-gray-50 border-none rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-xs font-medium">جاري التحميل...</span>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
              <MessageCircle size={40} className="mb-2 opacity-20" />
              <p className="text-sm">لا توجد محادثات هاهنا</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`w-full p-4 flex gap-3 transition-colors text-right relative border-b border-gray-50/50 ${
                  selectedChat?.id === chat.id ? 'bg-blue-50/50 border-r-4 border-r-blue-600' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-gray-100 uppercase font-black text-lg">
                  {chat.buyerName?.[0]}
                </div>
                <div className="flex-1 min-w-0 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-gray-900 truncate">{chat.buyerName}</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium">
                        <Clock size={10} />
                        {chat.lastMessageAt?.toDate ? new Date(chat.lastMessageAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className={`text-xs truncate line-clamp-1 ${selectedChat?.id !== chat.id && chat.sellerUnreadCount && chat.sellerUnreadCount > 0 ? 'font-black text-gray-900' : 'text-gray-500'}`}>
                      {chat.lastMessage || 'ابدأ المحادثة الآن...'}
                    </p>
                  </div>
                  {selectedChat?.id !== chat.id && chat.sellerUnreadCount && chat.sellerUnreadCount > 0 && (
                    <div className="bg-blue-600 text-white min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-black px-1 mt-2 animate-bounce">
                      {chat.sellerUnreadCount}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-gray-50/30 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <>
            {/* Header */}
            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold">
                  {selectedChat.buyerName?.[0]}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{selectedChat.buyerName}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">متصل الآن</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={handleDeleteChat}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                title="حذف المحادثة"
              >
                <Trash2 size={20} />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={msg.id}
                    className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] group ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] mb-1 font-black ${msg.senderId === user?.uid ? 'text-blue-600' : 'text-gray-500'}`}>
                        {msg.senderId === user?.uid ? 'أنت (المسؤول)' : selectedChat.buyerName}
                      </div>
                      <div className={`px-5 py-3 rounded-2xl text-sm shadow-sm transition-all hover:scale-[1.02] ${
                        msg.senderId === user?.uid 
                          ? 'bg-blue-600 text-white rounded-bl-none shadow-blue-100' 
                          : 'bg-white text-gray-800 border border-gray-100 rounded-br-none'
                      }`}>
                        {msg.imageUrl ? (
                          <div className="space-y-2">
                            <img 
                              src={msg.imageUrl} 
                              alt="Message Content" 
                              className="rounded-xl max-w-full h-auto shadow-sm"
                              onLoad={() => {
                                if (scrollRef.current) {
                                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                                }
                              }}
                            />
                            {msg.text && <p>{msg.text}</p>}
                          </div>
                        ) : (
                          msg.text
                        )}
                      </div>
                      <div className={`text-[10px] mt-1.5 flex items-center gap-1 px-1 ${msg.senderId === user?.uid ? 'flex-row-reverse text-blue-600' : 'text-gray-400'} font-medium`}>
                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                        {msg.senderId === user?.uid && <CheckCheck size={12} className="opacity-60" />}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {selectedChat?.buyerTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-400 px-4 py-2 rounded-2xl rounded-br-none border border-gray-100 shadow-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] font-bold">العميل يكتب الآن...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input & Emoji Picker Area */}
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
                  className={`p-3 rounded-2xl transition-all ${showEmoji ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400 hover:text-blue-600'}`}
                >
                  <Smile size={20} />
                </button>

                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-2xl transition-all"
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={20} />}
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex-1 flex gap-2 items-center bg-gray-50 rounded-2xl p-1 px-3 border border-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onFocus={() => setShowEmoji(false)}
                    placeholder="اكتب ردك هنا..."
                    className="flex-1 bg-transparent border-none py-3 text-sm outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={!inputText.trim() || isUploading}
                    className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
              <MessageCircle size={48} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">مركز الرسائل</h3>
            <p className="text-gray-500 max-w-sm leading-relaxed">
              اختر محادثة من القائمة الجانبية للبدء في التواصل مع عملائك وتقديم الدعم اللازم لهم.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
