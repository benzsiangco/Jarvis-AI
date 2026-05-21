import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0a0a0f',
          color: '#f87171', fontFamily: 'monospace', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠ Render Error</div>
          <div style={{ fontSize: '12px', color: '#9898b0', marginBottom: '16px' }}>
            {this.state.error?.message}
          </div>
          <pre style={{
            background: '#16161e', padding: '12px', borderRadius: '8px',
            fontSize: '11px', color: '#e4e4ef', maxWidth: '600px',
            overflow: 'auto', textAlign: 'left',
          }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '16px', padding: '8px 16px', background: '#7c6ef6',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
