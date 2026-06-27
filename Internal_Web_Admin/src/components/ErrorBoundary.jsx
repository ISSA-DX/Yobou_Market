import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-600 bg-red-50 min-h-screen">
          <h1 className="font-bold text-lg mb-2">Something went wrong</h1>
          <pre className="whitespace-pre-wrap text-sm font-mono">{this.state.error?.toString?.()}</pre>
          <pre className="whitespace-pre-wrap text-xs font-mono mt-4 text-red-500">{this.state.info?.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}