import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateBrowserStore } from './store';
import './theme.css';

type BoundaryProps = { children: React.ReactNode };

class AppErrorBoundary extends React.Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('FinanceHub render failed:', error, info.componentStack);
  }

  render() {
    const children = (this as unknown as { props: BoundaryProps }).props.children;
    if (!this.state.error) return children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div className="card" style={{ maxWidth: 560, padding: 28 }}>
          <div className="brand-mark" style={{ marginBottom: 16 }}>FH</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>FinanceHub could not open this view</h1>
          <p className="muted" style={{ margin: '0 0 18px' }}>
            Your saved budget has not been reset. Reload the app to try again. If the problem continues, restore a known-good backup rather than starting a blank budget.
          </p>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload FinanceHub</button>
        </div>
      </div>
    );
  }
}

const rootElement = document.getElementById('root')!;

async function start() {
  try {
    await hydrateBrowserStore();
  } catch (error) {
    console.error('FinanceHub could not connect to the desktop data store:', error);
    rootElement.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:32px">
        <div class="card" style="max-width:600px;padding:28px">
          <div class="brand-mark" style="margin-bottom:16px">FH</div>
          <h1 style="margin:0 0 8px;font-size:22px">FinanceHub cannot reach its data store</h1>
          <p class="muted" style="margin:0 0 18px">
            Open FinanceHub from the <strong>FinanceHub Browser</strong> shortcut. It starts the local
            store host and then reloads this page. Do not continue with browser-only storage, because
            that would create a separate budget.
          </p>
          <button id="financehub-retry" class="btn primary">Retry connection</button>
        </div>
      </div>`;
    document.getElementById('financehub-retry')?.addEventListener('click', () => window.location.reload());
    return;
  }

  createRoot(rootElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}

void start();
