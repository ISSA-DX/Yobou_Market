// ErrorBoundary — converts any uncaught render-time exception into a
// visible diagnostic panel instead of a blank screen.
//
// Why this matters: without an error boundary, any runtime throw inside
// a route (e.g. a missing API field, an undefined hook return, a render
// crash in a child component) silently renders nothing — the user sees
// a blank page and has no way to report it. With a boundary, the throw
// becomes a recoverable "Something went wrong" panel with the actual
// error message and a reload button.
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: null, copied: false });
  };

  copy = async () => {
    const text =
      `Error: ${this.state.error?.toString?.() || ''}\n\n` +
      (this.state.info?.componentStack || '');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard blocked — leave the pre tags visible.
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 sm:p-10 max-w-3xl mx-auto" role="alert">
          <div className="card p-6 bg-error/5 border border-error/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-error/15 flex items-center justify-center shrink-0">
                <span className="text-error text-2xl font-bold">!</span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg text-on-surface">Something went wrong on this page</h1>
                <p className="text-sm text-on-surface-variant mt-1">
                  The page hit an unexpected error and couldn't finish rendering. You can try again, or go back to the dashboard.
                </p>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button onClick={this.reset} className="btn-primary py-2 px-4 text-sm">
                    Try again
                  </button>
                  <a href="/admin/dashboard" className="btn-secondary py-2 px-4 text-sm">
                    Back to dashboard
                  </a>
                  <button onClick={this.copy} className="btn-secondary py-2 px-4 text-sm">
                    {this.state.copied ? 'Copied' : 'Copy error'}
                  </button>
                </div>

                <details className="mt-5">
                  <summary className="text-sm text-on-surface-variant cursor-pointer">
                    Technical details
                  </summary>
                  <pre className="whitespace-pre-wrap text-xs font-mono mt-2 p-3 bg-surface-low rounded text-error overflow-auto max-h-64">
                    {this.state.error?.toString?.()}
                  </pre>
                  {this.state.info?.componentStack && (
                    <pre className="whitespace-pre-wrap text-[11px] font-mono mt-2 p-3 bg-surface-low rounded text-on-surface-variant overflow-auto max-h-48">
                      {this.state.info.componentStack}
                    </pre>
                  )}
                </details>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}