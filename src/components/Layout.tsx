import { ReactNode, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Truck,
  HardDrive,
  Calendar as CalendarIcon,
  CheckSquare,
  Building2,
  Mountain,
} from "lucide-react";
import React from "react";
import { useAuth } from "../contexts/AuthContext";

import "./Layout.css";

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "لوحة التحكم", href: "/", icon: Home },
  // { name: "التقويم والمواعيد", href: "/calendar", icon: CalendarIcon },
  { name: "المهام", href: "/tasks", icon: CheckSquare },
  { name: "العملاء", href: "/customers", icon: Users },
  { name: "الطلبات", href: "/orders", icon: Package },
  { name: "الموردين", href: "/suppliers", icon: Truck },
  { name: "دفعات الموردين", href: "/supplier-payments", icon: CreditCard },
  { name: "المدفوعات", href: "/payments", icon: CreditCard },
  { name: "شيكات العملاء", href: "/checks", icon: FileText },
  { name: "الشيكات الشخصية", href: "/personal-checks", icon: Banknote },
  { name: "كشف الحساب", href: "/statements", icon: Receipt },
  { name: "التقارير", href: "/reports", icon: BarChart3 },
  { name: "الشقق", href: "/apartments", icon: Building2 },
  { name: "الأراضي", href: "/lands", icon: Mountain },
  { name: "النسخ الاحتياطي", href: "/backup", icon: HardDrive },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div
      className={`layout-container ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        {/* Blue Top Section */}
        <div className="sidebar-header">
          <div className={`user-info ${sidebarCollapsed ? "collapsed" : ""}`}>
            <User className="user-icon" />
            {!sidebarCollapsed && (
              <span className="user-email">{currentUser?.email}</span>
            )}
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
                      title={sidebarCollapsed ? item.name : undefined}
                    >
                      <item.icon className="nav-icon" />
                      {!sidebarCollapsed && (
                        <span className="nav-text">{item.name}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          <div
            className={`logout-section ${sidebarCollapsed ? "collapsed" : ""}`}
          >
            <button onClick={logout} className="logout-btn">
              <LogOut className="logout-icon" />
              {!sidebarCollapsed && <span>تسجيل الخروج</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <button className="sidebar-toggle" onClick={toggleSidebar}>
        {sidebarCollapsed ? (
          <ChevronRight size={20} />
        ) : (
          <ChevronLeft size={20} />
        )}
      </button>

      {/* Main content */}
      <div className={`main-content ${sidebarCollapsed ? "expanded" : ""}`}>
        <main className="content-wrapper">{children}</main>
      </div>
    </div>
  );
}
