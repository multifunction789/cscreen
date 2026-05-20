'use client'
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <div style={{
            background: '#FEE2E2', border: '1px solid #FECACA',
            borderRadius: 10, padding: 20,
          }}>
            <h2 style={{ color: '#991B1B', fontSize: 16, marginBottom: 8 }}>⚠️ เกิดข้อผิดพลาด</h2>
            <pre style={{
              fontSize: 12, color: '#7F1D1D',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              background: '#FEF2F2', padding: 10, borderRadius: 6,
            }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack?.split('\n').slice(0,5).join('\n')}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false })}
              style={{ marginTop: 12, padding: '8px 16px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              ลองใหม่
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
