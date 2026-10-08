import { Component } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

// Production error boundary for customer routes. Catches render-time
// crashes so a single component never whitescreen the whole app, and
// gives the shopper an actionable recovery path instead of a stack trace.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface p-6 flex items-center justify-center">
          <div className="card p-8 max-w-sm w-full text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
              <Icon name="error" className="text-[28px] text-error" />
            </div>
            <div>
              {/* text-on-surface dropped — v0.3.20 h1 default = brand blue
                  so the error hero header picks up the brand primary
                  tint used across all other page titles. */}
              <h1 className="font-bold text-lg">Something went wrong</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                We hit a snag loading this screen. Tap retry to give it another go, or head back home.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="btn-primary py-3"
              >
                Retry
              </button>
              <Link to="/home" className="btn-secondary py-3 inline-flex items-center justify-center">
                Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
