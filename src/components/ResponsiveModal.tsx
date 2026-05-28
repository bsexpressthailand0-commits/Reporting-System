import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

const widthClasses: Record<string, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-xl',
  '2xl': 'md:max-w-2xl',
  '3xl': 'md:max-w-3xl',
  '4xl': 'md:max-w-4xl',
  '5xl': 'md:max-w-5xl',
  '6xl': 'md:max-w-6xl',
  '7xl': 'md:max-w-7xl',
  full: 'md:max-w-full',
  
  // Also support full max-w-X string formats for backwards compatibility
  'max-w-sm': 'md:max-w-sm',
  'max-w-md': 'md:max-w-md',
  'max-w-lg': 'md:max-w-lg',
  'max-w-xl': 'md:max-w-xl',
  'max-w-2xl': 'md:max-w-2xl',
  'max-w-3xl': 'md:max-w-3xl',
  'max-w-4xl': 'md:max-w-4xl',
  'max-w-5xl': 'md:max-w-5xl',
  'max-w-6xl': 'md:max-w-6xl',
  'max-w-7xl': 'md:max-w-7xl',
  'max-w-full': 'md:max-w-full',
};

export default function ResponsiveModal({ isOpen, onClose, title, children, footer, maxWidth = '2xl' }: ResponsiveModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const widthClass = widthClasses[maxWidth] || 'md:max-w-2xl';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className={`relative bg-white dark:bg-gray-900 w-full h-full md:h-auto ${widthClass} md:rounded-2xl md:shadow-2xl flex flex-col md:max-h-[90vh]`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900 md:rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">{title}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-gray-800/50 md:bg-white dark:bg-gray-900 relative">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900 md:bg-gray-50 dark:bg-gray-800/50 md:rounded-b-2xl sticky bottom-0 z-10 safe-area-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
