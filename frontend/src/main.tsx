import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/montserrat'
import App from './App'
import './styles/global.css'
import './styles/cabinet.css'
import './styles/studio.css'
import './styles/research.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
