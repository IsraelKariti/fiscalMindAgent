import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../i18n';
import { MondayWidget } from './MondayWidget';
import '../styles.css';
import '../ripple';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <MondayWidget />
    </I18nProvider>
  </React.StrictMode>,
);
