import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../i18n';

function CrashScreen() {
  const { t } = useT();
  return (
    <div className="crash-screen" role="alert">
      <h2>{t.crashTitle}</h2>
      <p className="muted">{t.crashText}</p>
      <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
        {t.crashReload}
      </button>
    </div>
  );
}

/**
 * Last line of defense around a whole surface (SPA, monday object): React
 * unmounts the entire tree on an uncaught render error, which leaves a blank
 * page that a hash navigation cannot recover — only a reload can.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render crash', error, info.componentStack);
  }

  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}
