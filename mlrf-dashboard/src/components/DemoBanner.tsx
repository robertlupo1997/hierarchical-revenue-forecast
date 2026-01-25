import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DemoBannerProps {
  /** Whether the API is returning mock data */
  isDemo: boolean;
  /** Optional custom message */
  message?: string;
}

/**
 * Dismissible banner shown when the API returns mock/demo data.
 * Indicates that the system is running in demo mode without live data.
 */
export function DemoBanner({ isDemo, message }: DemoBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isDemo || isDismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center gap-2',
        'bg-amber-500/10 border-b border-amber-500/20',
        'px-4 py-2 text-sm text-amber-600 dark:text-amber-400'
      )}
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {message ?? 'Demo Mode: Displaying mock data. Connect the API for live predictions.'}
      </span>
      <button
        onClick={() => setIsDismissed(true)}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'rounded p-1 transition-colors',
          'hover:bg-amber-500/20',
          'focus:outline-none focus:ring-2 focus:ring-amber-500/50'
        )}
        aria-label="Dismiss demo mode banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
