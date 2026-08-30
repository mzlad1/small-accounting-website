import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
// All page styles load globally, in the pre-code-splitting order. Pages
// share bare class recipes across CSS files, so the cascade must never
// depend on which route chunk happens to load first (symptom: a page
// opened directly renders unstyled bits). JS stays code-split per route.
import './pages/Login.css'
import './pages/ResetPassword.css'
import './pages/Dashboard.css'
import './pages/Customers.css'
import './pages/CustomerAccount.css'
import './pages/OrderDetails.css'
import './pages/Orders.css'
import './pages/Payments.css'
import './pages/Checks.css'
import './pages/PersonalChecks.css'
import './pages/Statements.css'
import './pages/Suppliers.css'
import './pages/SupplierDetails.css'
import './pages/SupplierPayments.css'
import './pages/Reports.css'
import './pages/Receipts.css'
import './pages/Backup.css'
import './pages/Documents.css'
// react-calendar's library defaults must load BEFORE Calendar.css so the
// page's overrides win (the lazy chunk's own import dedupes to this one)
import 'react-calendar/dist/Calendar.css'
import './pages/Calendar.css'
import './pages/Tasks.css'
import './pages/Apartments.css'
import './pages/ApartmentDetails.css'
import './pages/ApartmentGallery.css'
import './pages/Lands.css'
import './pages/LandDetails.css'
import './pages/LandGallery.css'
import App from './App.jsx'

// PWA: precache the app shell + auto-update on new deploys
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
