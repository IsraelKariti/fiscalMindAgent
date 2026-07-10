import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureApi } from '../api';
import { I18nProvider } from '../i18n';
import { MondayObject } from './MondayObject';
import { getSessionToken } from './sdk';
import '../styles.css';
import '../ripple';

// Everything the workspace shell calls goes to the monday-authenticated mount:
// the iframe has no session cookie, so each request carries a fresh (short-
// lived) monday sessionToken, and header-less URLs (SSE, downloads) get it as
// a query parameter.
configureApi({
  basePath: '/api/monday/app',
  getAuthHeaders: async () => ({ Authorization: `Bearer ${await getSessionToken()}` }),
  getUrlToken: getSessionToken,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <MondayObject />
    </I18nProvider>
  </React.StrictMode>,
);
