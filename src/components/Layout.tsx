import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Users,
  ClipboardList,
  Truck,
  HandCoins,
  Wallet,
  Banknote,
  WalletCards,
  ScrollText,
  ReceiptText,
  ChartColumnIncreasing,
  Building2,
  LandPlot,
  DatabaseBackup,
  LogOut,
  Menu,
  X,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import React from "react";
import { useAuth } from "../contexts/AuthContext";

import "./Layout.css";

interface LayoutProps {
  children: ReactNode;
}

const navGroups = [
  {
    label: "نظرة عامة",
    items: [
      { name: "لوحة التحكم", href: "/", icon: LayoutDashboard },
      { name: "التقويم والمواعيد", href: "/calendar", icon: CalendarDays },
      { name: "المهام", href: "/tasks", icon: ListChecks },
    ],
  },
  {
    label: "العملاء والمبيعات",
    items: [
      { name: "العملاء", href: "/customers", icon: Users },
      { name: "الطلبات", href: "/orders", icon: ClipboardList },
      { name: "كشف الحساب", href: "/statements", icon: ScrollText },
    ],
  },
  {
    label: "الموردون",
    items: [
      { name: "الموردين", href: "/suppliers", icon: Truck },
      { name: "دفعات الموردين", href: "/supplier-payments", icon: HandCoins },
    ],
  },
  {
    label: "المالية",
    items: [
      { name: "المدفوعات", href: "/payments", icon: Wallet },
      { name: "سندات القبض", href: "/receipts", icon: ReceiptText },
      { name: "شيكات العملاء", href: "/checks", icon: Banknote },
      { name: "الشيكات الشخصية", href: "/personal-checks", icon: WalletCards },
      { name: "التقارير", href: "/reports", icon: ChartColumnIncreasing },
    ],
  },
  {
    label: "العقارات",
    items: [
      { name: "الشقق", href: "/apartments", icon: Building2 },
      { name: "الأراضي", href: "/lands", icon: LandPlot },
    ],
  },
  {
    label: "النظام",
    items: [
      { name: "النسخ الاحتياطي", href: "/backup", icon: DatabaseBackup },
    ],
  },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const userInitial = (currentUser?.email || "؟").charAt(0).toUpperCase();

  return (
    <div
      className={`layout-container ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <button
          className="menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="فتح القائمة"
        >
          <Menu size={22} />
        </button>
        <div className="topbar-brand">
          <span className="brand-mark">
            <Building2 size={16} />
          </span>
          <span className="topbar-title">إدارة المشاريع</span>
        </div>
      </header>

      {/* Backdrop behind the mobile drawer */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? "show" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Studio panel — floating grouped navigation */}
      <aside
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${
          mobileOpen ? "open" : ""
        }`}
      >
        <div className="sidebar-brand">
          <span className="brand-mark">
            <Building2 size={18} />
          </span>
          <div className="brand-text">
            <strong>إدارة المشاريع</strong>
            <span>دفتر الحسابات</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {sidebarCollapsed ? (
              <PanelRightOpen size={17} />
            ) : (
              <PanelRightClose size={17} />
            )}
          </button>
          <button
            className="drawer-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              {sidebarCollapsed ? (
                <div className="nav-group-divider" />
              ) : (
                <div className="nav-group-label">{group.label}</div>
              )}
              <ul className="nav-list">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={`nav-link ${isActive ? "active" : ""}`}
                        title={sidebarCollapsed ? item.name : undefined}
                      >
                        <item.icon className="nav-icon" />
                        <span className="nav-text">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User chip + logout */}
        <div
          className={`sidebar-footer ${sidebarCollapsed ? "collapsed" : ""}`}
        >
          <div className="user-chip">
            <span className="user-avatar">{userInitial}</span>
            <span className="user-email">{currentUser?.email}</span>
            <button
              onClick={logout}
              className="logout-btn"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="logout-icon" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`main-content ${sidebarCollapsed ? "expanded" : ""}`}>
        <main className="content-wrapper">{children}</main>
      </div>
    </div>
  );
}
