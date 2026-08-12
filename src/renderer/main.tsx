import React from 'react'
import ReactDOM from 'react-dom/client'
import PublicRouter from './PublicRouter.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PublicRouter />
  </React.StrictMode>,
)
