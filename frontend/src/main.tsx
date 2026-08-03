import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/montserrat'
import App from './App'
import './styles/global.css'
import './styles/product.css'
import './styles/research.css'
import './styles/reels.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
