import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
}

interface ToastContextType {
  toast: {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string, description?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, description }]);
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000); // Auto close after 4 seconds
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string, description?: string) => addToast('success', message, description),
    error: (message: string, description?: string) => addToast('error', message, description),
    warning: (message: string, description?: string) => addToast('warning', message, description),
    info: (message: string, description?: string) => addToast('info', message, description),
  };

  const getToastStyle = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          wrapper: 'bg-secondary-50 dark:bg-secondary-950/40 border-secondary-100 dark:border-secondary-900/50 text-secondary-800 dark:text-secondary-200 focus:ring-secondary-500',
          icon: <CheckCircle2 className="w-5 h-5 text-secondary-500" />,
          progress: 'bg-secondary-500',
        };
      case 'error':
        return {
          wrapper: 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 focus:ring-rose-500',
          icon: <AlertCircle className="w-5 h-5 text-rose-500" />,
          progress: 'bg-rose-500',
        };
      case 'warning':
        return {
          wrapper: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 focus:ring-amber-500',
          icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
          progress: 'bg-amber-500',
        };
      case 'info':
      default:
        return {
          wrapper: 'bg-primary-50 dark:bg-primary-950/40 border-primary-100 dark:border-primary-900/50 text-primary-800 dark:text-primary-200 focus:ring-primary-500',
          icon: <Info className="w-5 h-5 text-primary-500" />,
          progress: 'bg-primary-500',
        };
    }
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm px-4 md:px-0 pointer-events-none">
        <AnimatePresence>
          {toasts.map((item) => {
            const styles = getToastStyle(item.type);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`w-full pointer-events-auto rounded-xl border p-4 shadow-lg flex gap-3 overflow-hidden relative ${styles.wrapper}`}
              >
                {/* Visual Icon */}
                <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
                
                {/* Message Content */}
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-semibold tracking-wide leading-snug">{item.message}</p>
                  {item.description && (
                    <p className="text-xs opacity-90 mt-1 font-normal leading-relaxed">{item.description}</p>
                  )}
                </div>

                {/* Dismiss Button */}
                <button
                  onClick={() => removeToast(item.id)}
                  className="flex-shrink-0 opacity-60 hover:opacity-100 p-1 rounded-lg transition-colors absolute top-3 right-3"
                  aria-label="ปิดการแจ้งเตือน"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Animated progress bar indicator at the bottom */}
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 4, ease: 'linear' }}
                  className={`absolute bottom-0 left-0 h-1 ${styles.progress}`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
