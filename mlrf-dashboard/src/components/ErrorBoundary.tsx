import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Displays a user-friendly error message instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="card p-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>

              <h1 className="text-xl font-semibold text-foreground mb-2">
                Something went wrong
              </h1>

              <p className="text-sm text-muted-foreground mb-6">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={this.handleReset}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg px-4 py-2',
                    'bg-secondary text-secondary-foreground',
                    'transition-colors duration-200',
                    'hover:bg-secondary/80'
                  )}
                >
                  Try Again
                </button>

                <button
                  onClick={this.handleReload}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg px-4 py-2',
                    'bg-primary text-primary-foreground',
                    'transition-colors duration-200',
                    'hover:bg-primary/90'
                  )}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </button>
              </div>

              {/* Show stack trace in development */}
              {import.meta.env.DEV && this.state.errorInfo && (
                <details className="mt-6 text-left">
                  <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                    Error details
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-auto max-h-48">
                    {this.state.error?.stack}
                    {'\n\nComponent Stack:\n'}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
