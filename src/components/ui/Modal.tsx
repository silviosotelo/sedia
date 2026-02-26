import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-[50] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
          onClick={onClose}
        />

        <div
          className={`relative w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-2xl shadow-black/20 border border-zinc-200/60 animate-pop-in flex flex-col`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100/80 bg-white/80 backdrop-blur-md rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">{title}</h2>
              {description && (
                <p className="text-sm font-medium text-zinc-500 mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 min-h-[100px]">
            {children}
          </div>

          {footer && (
            <div className="px-6 py-4 border-t border-zinc-100/80 bg-zinc-50/50 flex items-center justify-end gap-3 rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
