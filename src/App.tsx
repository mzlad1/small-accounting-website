import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";

// Route-level code splitting: each page loads as its own chunk on first
// visit, so the initial bundle only carries the shell (auth + layout).
const named = <T,>(
  loader: () => Promise<T>,
  pick: (m: T) => React.ComponentType
) => lazy(() => loader().then((m) => ({ default: pick(m) })));

const Login = named(() => import("./pages/Login"), (m) => m.Login);
const ResetPassword = named(
  () => import("./pages/ResetPassword"),
  (m) => m.ResetPassword
);
const Dashboard = named(() => import("./pages/Dashboard"), (m) => m.Dashboard);
const Customers = named(() => import("./pages/Customers"), (m) => m.Customers);
const CustomerAccount = named(
  () => import("./pages/CustomerAccount"),
  (m) => m.CustomerAccount
);
const OrderDetails = named(
  () => import("./pages/OrderDetails"),
  (m) => m.OrderDetails
);
const Orders = named(() => import("./pages/Orders"), (m) => m.Orders);
const Payments = named(() => import("./pages/Payments"), (m) => m.Payments);
const Checks = named(() => import("./pages/Checks"), (m) => m.Checks);
const PersonalChecks = named(
  () => import("./pages/PersonalChecks"),
  (m) => m.PersonalChecks
);
const Statements = named(
  () => import("./pages/Statements"),
  (m) => m.Statements
);
const Suppliers = named(() => import("./pages/Suppliers"), (m) => m.Suppliers);
const SupplierDetails = named(
  () => import("./pages/SupplierDetails"),
  (m) => m.SupplierDetails
);
const SupplierPayments = named(
  () => import("./pages/SupplierPayments"),
  (m) => m.SupplierPayments
);
const Reports = named(() => import("./pages/Reports"), (m) => m.Reports);
const Receipts = named(() => import("./pages/Receipts"), (m) => m.Receipts);
const Backup = lazy(() => import("./pages/Backup"));
const CalendarPage = named(
  () => import("./pages/Calendar"),
  (m) => m.CalendarPage
);
const Tasks = named(() => import("./pages/Tasks"), (m) => m.Tasks);
const Apartments = named(
  () => import("./pages/Apartments"),
  (m) => m.Apartments
);
const ApartmentDetails = named(
  () => import("./pages/ApartmentDetails"),
  (m) => m.ApartmentDetails
);
const ApartmentGallery = named(
  () => import("./pages/ApartmentGallery"),
  (m) => m.ApartmentGallery
);
const Lands = named(() => import("./pages/Lands"), (m) => m.Lands);
const LandDetails = named(
  () => import("./pages/LandDetails"),
  (m) => m.LandDetails
);
const LandGallery = named(
  () => import("./pages/LandGallery"),
  (m) => m.LandGallery
);

function PageFallback() {
  return (
    <div className="loading-spinner">
      <div className="spinner"></div>
      <p>جاري التحميل...</p>
    </div>
  );
}

// The sidebar stays painted while a page chunk loads: Suspense sits
// inside Layout, not around the whole route tree.
const page = (element: React.ReactNode) => (
  <ProtectedRoute>
    <Layout>
      <Suspense fallback={<PageFallback />}>{element}</Suspense>
    </Layout>
  </ProtectedRoute>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={page(<Dashboard />)} />
            <Route path="/receipts" element={page(<Receipts />)} />
            <Route path="/calendar" element={page(<CalendarPage />)} />
            <Route path="/tasks" element={page(<Tasks />)} />
            <Route path="/customers" element={page(<Customers />)} />
            <Route
              path="/customers/:customerId"
              element={page(<CustomerAccount />)}
            />
            <Route path="/orders" element={page(<Orders />)} />
            <Route path="/orders/:orderId" element={page(<OrderDetails />)} />
            <Route path="/payments" element={page(<Payments />)} />
            <Route path="/checks" element={page(<Checks />)} />
            <Route path="/personal-checks" element={page(<PersonalChecks />)} />
            <Route path="/statements" element={page(<Statements />)} />
            <Route path="/suppliers" element={page(<Suppliers />)} />
            <Route
              path="/suppliers/:supplierId"
              element={page(<SupplierDetails />)}
            />
            <Route
              path="/supplier-payments"
              element={page(<SupplierPayments />)}
            />
            <Route path="/reports" element={page(<Reports />)} />
            <Route path="/backup" element={page(<Backup />)} />
            <Route path="/apartments" element={page(<Apartments />)} />
            <Route
              path="/apartments/:apartmentId"
              element={page(<ApartmentDetails />)}
            />
            <Route
              path="/apartments/:apartmentId/gallery"
              element={page(<ApartmentGallery />)}
            />
            <Route path="/lands" element={page(<Lands />)} />
            <Route path="/lands/:landId" element={page(<LandDetails />)} />
            <Route
              path="/lands/:landId/gallery"
              element={page(<LandGallery />)}
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
