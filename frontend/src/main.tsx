import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { startCrossTabSync } from './local/db'
import { startOutboxSync } from './local/outboxSync'
import { startReauthCrossTab } from './lib/reauth'
import './i18n'
import './index.css'

// Mirror local writes across open tabs so useLocal subscribers stay consistent,
// and coordinate the re-auth navigation so only the leader tab reloads (phase 6).
startCrossTabSync()
startReauthCrossTab()

// Drain any mutations queued offline (and survivors of a reload) and keep
// draining on reconnect/focus. Only the elected leader tab drains.
startOutboxSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
