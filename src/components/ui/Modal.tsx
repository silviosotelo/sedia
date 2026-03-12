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
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [open, onClose]);

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
        {/* ECME overlay: bg-black/60 backdrop-blur-md */}
        <div
          className="dialog-overlay"
          onClick={onClose}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={`dialog-content w-full ${sizeClasses[size]} animate-pop-in flex flex-col !my-0`}
        >
          {/* Header */}
          <div className="card-header card-header-border flex items-center justify-between">
            <div>
              <h5 id="modal-title">{title}</h5>
              {description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="card-body min-h-[100px]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="card-footer card-footer-border flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
