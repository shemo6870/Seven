import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

interface ReceiptModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export default function ReceiptModal({ imageUrl, onClose }: ReceiptModalProps) {
  const [zoom, setZoom] = React.useState(1);

  if (!imageUrl) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 md:p-10 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative max-w-5xl w-full h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-0 right-0 left-0 flex justify-between p-4 z-10 pointer-events-none">
             <div className="flex gap-2 pointer-events-auto">
                <button 
                  onClick={() => setZoom(prev => Math.min(prev + 0.5, 3))}
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-all"
                  title="تكبير"
                >
                  <ZoomIn size={24} />
                </button>
                <button 
                  onClick={() => setZoom(prev => Math.max(prev - 0.5, 0.5))}
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-all"
                  title="تصغير"
                >
                  <ZoomOut size={24} />
                </button>
                <a 
                  href={imageUrl} 
                  download="receipt.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-all"
                  title="تحميل"
                >
                  <Download size={24} />
                </a>
             </div>
             <button 
               onClick={onClose}
               className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-all pointer-events-auto"
               title="إغلاق"
             >
               <X size={24} />
             </button>
          </div>

          <div className="w-full h-full overflow-auto flex items-center justify-center custom-scrollbar">
            <motion.img
              src={imageUrl}
              alt="Receipt Full View"
              animate={{ scale: zoom }}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
