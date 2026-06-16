/**
 * App-level error boundary. Catches render errors in any child route and shows
 * a friendly, accessible fallback instead of a blank white screen.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook for a real logger (Sentry/Crashlytics) — kept console-only for now.
    // eslint-disable-next-line no-console
    console.error("Render error:", error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="error-screen" role="alert">
        <div className="error-card">
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. You can try again or reload the page.</p>
          {this.state.message && <pre className="error-detail">{this.state.message}</pre>}
          <div className="btn-row">
            <button className="btn btn--primary" onClick={this.handleReset}>
              Try again
            </button>
            <button className="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
