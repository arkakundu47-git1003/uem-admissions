import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page-loader" role="alert" style={{ padding: 24, textAlign: 'center' }}>
        <div className="stack">
          <h1 style={{ fontSize: '1.75rem' }}>Something went wrong</h1>
          <p className="muted">An unexpected error occurred. Reloading usually fixes it.</p>
          <div><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button></div>
        </div>
      </div>
    );
  }
}
