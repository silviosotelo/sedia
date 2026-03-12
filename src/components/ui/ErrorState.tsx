import { AlertTriangle } from 'lucide-react';
import { Card } from './TailAdmin';

interface ErrorStateProps {
  /** Main error title. Default: "No se pudo cargar" */
  title?: string;
  /** Error detail message (e.g. the actual error string) */
  message?: string;
  /** Retry callback. If provided, shows "Reintentar" button */
  onRetry?: () => void;
  /** Whether a retry is currently in progress */
  retrying?: boolean;
}

export function ErrorState({
  title = 'No se pudo cargar',
  message,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center animate-fade-in dark:bg-gray-800 dark:border-gray-700">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
        <AlertTriangle className="w-7 h-7 text-amber-500" />
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
      {message && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-5">{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2 px-5 py-2 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-700 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors button-press-feedback"
        >
          {retrying ? 'Cargando...' : 'Reintentar'}
        </button>
      )}
    </Card>
  );
}
