import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { CustomerAccount } from "./pages/CustomerAccount";
import { OrderDetails } from "./pages/OrderDetails";
import { Orders } from "./pages/Orders";
import { Payments } from "./pages/Payments";
import { Checks } from "./pages/Checks";
import { PersonalChecks } from "./pages/PersonalChecks";
import { Statements } from "./pages/Statements";
import { Suppliers } from "./pages/Suppliers";
import { SupplierDetails } from "./pages/SupplierDetails";
import { SupplierPayments } from "./pages/SupplierPayments";
import { Reports } from "./pages/Reports";
import Backup from "./pages/Backup";
import { CalendarPage } from "./pages/Calendar";
import { Tasks } from "./pages/Tasks";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Layout>
                  <CalendarPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Layout>
                  <Tasks />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Layout>
                  <Customers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:customerId"
            element={
              <ProtectedRoute>
                <Layout>
                  <CustomerAccount />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <Layout>
                  <Orders />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute>
                <Layout>
                  <OrderDetails />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <Layout>
                  <Payments />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/checks"
            element={
              <ProtectedRoute>
                <Layout>
                  <Checks />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/personal-checks"
            element={
              <ProtectedRoute>
                <Layout>
                  <PersonalChecks />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/statements"
            element={
              <ProtectedRoute>
                <Layout>
                  <Statements />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suppliers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers/:supplierId"
            element={
              <ProtectedRoute>
                <Layout>
                  <SupplierDetails />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier-payments"
            element={
              <ProtectedRoute>
                <Layout>
                  <SupplierPayments />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Layout>
                  <Reports />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/backup"
            element={
              <ProtectedRoute>
                <Layout>
                  <Backup />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
