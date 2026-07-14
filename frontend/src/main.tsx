import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { startOutboxSync } from './local/outboxSync'
import './i18n'
import './index.css'

// Drain any mutations queued offline (and survivors of a reload) and keep
// draining on reconnect/focus.
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
