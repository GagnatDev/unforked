import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { startCrossTabSync } from './local/db'
import { startLiveEvents } from './local/liveEvents'
import { startOutboxSync } from './local/outboxSync'
import { startPushMessages } from './lib/pushMessages'
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

// Live updates: the leader tab holds one SSE connection to /api/events and
// re-pulls changed weeks, so a family member's (or Aivo's) edit reaches every
// open tab within seconds. Connects once AuthContext supplies an identity.
startLiveEvents()

// Push messages from the service worker (public/push-sw.js): in-page display
// of pushes that arrive while a window is focused, and client-side routing of
// notification-click deep links.
startPushMessages()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
