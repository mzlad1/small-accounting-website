import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Users,
  Package,
  CreditCard,
  FileText,
  BarChart3,
  Receipt,
  LogOut,
  User,
  Banknote,
} from "lucide-react";
import React from "react";
import { useAuth } from "../contexts/AuthContext";
import "./Layout.css";

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "لوحة التحكم", href: "/", icon: Home },
  { name: "العملاء", href: "/customers", icon: Users },
  { name: "الطلبات", href: "/orders", icon: Package },
  { name: "المدفوعات", href: "/payments", icon: CreditCard },
  { name: "شيكات العملاء", href: "/checks", icon: FileText },
  { name: "الشيكات الشخصية", href: "/personal-checks", icon: Banknote },
  { name: "كشف الحساب", href: "/statements", icon: Receipt },
  { name: "التقارير", href: "/reports", icon: BarChart3 },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { currentUser, logout } = useAuth();

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <div className="sidebar">
        {/* Blue Top Section */}
        <div className="sidebar-header">
          <h1 className="sidebar-title">إدارة الإنشاءات</h1>
          <div className="user-info">
            <User className="user-icon" />
            <span className="user-email">{currentUser?.email}</span>
          </div>
        </div>

        {/* White Bottom Section */}
        <div className="sidebar-content">
          <nav className="sidebar-nav">
            <ul className="nav-list">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`nav-link ${isActive ? "active" : ""}`}
                    >
                      <item.icon className="nav-icon" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          <div className="logout-section">
            <button onClick={logout} className="logout-btn">
              <LogOut className="logout-icon" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        <main className="content-wrapper">{children}</main>
      </div>
    </div>
  );
}
