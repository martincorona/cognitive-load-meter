import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MobileSensor from './MobileSensor.tsx'

const urlParams = new URLSearchParams(window.location.search)
const mode = urlParams.get('mode')
const appElement = mode === 'mobile' ? <MobileSensor /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {appElement}
  </StrictMode>,
)
