import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  CreditCard,
  FileText,
  TrendingUp,
  Calendar,
  Filter,
  Plus,
  Eye,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Users,
  Package,
  Receipt,
  Banknote,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./Dashboard.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
  notes?: string;
}

interface Order {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  date: string;
  status: string;
  total: number;
  items: any[];
  notes?: string;
}

interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  type: "cash" | "check";
  amount: number;
  notes?: string;
  checkId?: string;
}

interface CustomerCheck {
  id: string;
  customerId: string;
  customerName: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: string;
  notes?: string;
}

interface PersonalCheck {
  id: string;
  payee: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: string;
  notes?: string;
}

interface Check {
  id: string;
  customerPayee: string;
  checkNumber: string;
  amount: number;
  dueDate: string;
  status: "pending" | "cleared" | "overdue" | "cancelled";
  type: "customer" | "personal";
  originalId: string;
  originalType: "customerCheck" | "personalCheck";
}

export function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState("today");
  const [showFilters, setShowFilters] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  // Real data from Firebase
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerChecks, setCustomerChecks] = useState<CustomerCheck[]>([]);
  const [personalChecks, setPersonalChecks] = useState<PersonalCheck[]>([]);
  const [upcomingChecks, setUpcomingChecks] = useState<Check[]>([]);

  // Calculated summary data
  const [summaryData, setSummaryData] = useState({
    totalReceivables: 0,
    totalPayables: 0,
    checksDueThisWeek: 0,
    totalSalesThisMonth: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (
      customers.length > 0 ||
      orders.length > 0 ||
      payments.length > 0 ||
      customerChecks.length > 0 ||
      personalChecks.length > 0
    ) {
      calculateSummaryData();
      generateUpcomingChecks();
    }
  }, [
    customers,
    orders,
    orderItems,
    payments,
    customerChecks,
    personalChecks,
    selectedFilter,
    customDateRange,
  ]);

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showFilters && !target.closest('.dashboard-filters')) {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch customers
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customersData.push({
          id: doc.id,
          name: data.name,
          phone: data.phone,
          notes: data.notes,
        });
      });
      setCustomers(customersData);

      // Fetch orders
      const ordersSnapshot = await getDocs(collection(db, "orders"));
      const ordersData: Order[] = [];
      ordersSnapshot.forEach((doc) => {
        const data = doc.data();
        ordersData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          title: data.title,
          date: data.date,
          status: data.status,
          total: data.total,
          items: data.items || [],
          notes: data.notes,
        });
      });
      setOrders(ordersData);

      // Fetch order items for all orders
      const orderItemsData: { [orderId: string]: any[] } = {};
      for (const order of ordersData) {
        const itemsQuery = query(
          collection(db, "orderItems"),
          where("orderId", "==", order.id)
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        const items: any[] = [];
        itemsSnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        orderItemsData[order.id] = items;
      }
      setOrderItems(orderItemsData);

      // Fetch payments
      const paymentsSnapshot = await getDocs(collection(db, "payments"));
      const paymentsData: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const data = doc.data();
        paymentsData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          date: data.date,
          type: data.type,
          amount: data.amount,
          notes: data.notes,
          checkId: data.checkId,
        });
      });
      setPayments(paymentsData);

      // Fetch customer checks
      const customerChecksSnapshot = await getDocs(
        collection(db, "customerChecks")
      );
      const customerChecksData: CustomerCheck[] = [];
      customerChecksSnapshot.forEach((doc) => {
        const data = doc.data();
        customerChecksData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          checkNumber: data.checkNumber,
          bank: data.bank,
          amount: data.amount,
          dueDate: data.dueDate,
          status: data.status,
          notes: data.notes,
        });
      });
      setCustomerChecks(customerChecksData);

      // Fetch personal checks
      const personalChecksSnapshot = await getDocs(
        collection(db, "personalChecks")
      );
      const personalChecksData: PersonalCheck[] = [];
      personalChecksSnapshot.forEach((doc) => {
        const data = doc.data();
        personalChecksData.push({
          id: doc.id,
          payee: data.payee,
          checkNumber: data.checkNumber,
          bank: data.bank,
          amount: data.amount,
          dueDate: data.dueDate,
          status: data.status,
          notes: data.notes,
        });
      });
      setPersonalChecks(personalChecksData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions to calculate order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  const calculateSummaryData = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate total receivables (orders + pending customer checks - payments)
    const totalOrders = orders.reduce(
      (sum, order) => sum + calculateOrderTotal(order.id),
      0
    );
    const totalPendingCustomerChecks = customerChecks
      .filter((check) => check.status === "pending")
      .reduce((sum, check) => sum + check.amount, 0);
    const totalPaymentsReceived = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    const totalReceivables =
      totalOrders + totalPendingCustomerChecks - totalPaymentsReceived;

    // Calculate total payables (pending personal checks)
    const totalPendingPersonalChecks = personalChecks
      .filter((check) => check.status === "pending")
      .reduce((sum, check) => sum + check.amount, 0);

    // Calculate checks due this week
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);
    const checksDueThisWeek = [...customerChecks, ...personalChecks].filter(
      (check) => {
        const dueDate = new Date(check.dueDate);
        return (
          dueDate >= now && dueDate <= endOfWeek && check.status === "pending"
        );
      }
    ).length;

    // Calculate total sales this month
    const totalSalesThisMonth = orders
      .filter((order) => {
        const orderDate = new Date(order.date);
        return orderDate >= startOfMonth && orderDate <= endOfMonth;
      })
      .reduce((sum, order) => sum + calculateOrderTotal(order.id), 0);

    setSummaryData({
      totalReceivables: Math.max(0, totalReceivables),
      totalPayables: totalPendingPersonalChecks,
      checksDueThisWeek: checksDueThisWeek,
      totalSalesThisMonth: totalSalesThisMonth,
    });
  };

  const generateUpcomingChecks = () => {
    const now = new Date();
    let filterStartDate: Date;
    let filterEndDate: Date;

    // Set date range based on filter
    switch (selectedFilter) {
      case "today":
        filterStartDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        filterEndDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1
        );
        break;
      case "week":
        filterStartDate = now;
        filterEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        filterStartDate = now;
        filterEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "custom":
        filterStartDate = new Date(customDateRange.from);
        filterEndDate = new Date(customDateRange.to);
        break;
      default:
        filterStartDate = now;
        filterEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Combine customer and personal checks
    const allChecks: Check[] = [];

    // Add customer checks
    customerChecks.forEach((check) => {
      const dueDate = new Date(check.dueDate);
      if (dueDate >= filterStartDate && dueDate <= filterEndDate) {
        allChecks.push({
          id: `customer-${check.id}`,
          customerPayee: check.customerName,
          checkNumber: check.checkNumber,
          amount: check.amount,
          dueDate: check.dueDate,
          status:
            check.status === "pending"
              ? "pending"
              : check.status === "collected"
              ? "cleared"
              : check.status === "returned"
              ? "cancelled"
              : "pending",
          type: "customer",
          originalId: check.id,
          originalType: "customerCheck",
        });
      }
    });

    // Add personal checks
    personalChecks.forEach((check) => {
      const dueDate = new Date(check.dueDate);
      if (dueDate >= filterStartDate && dueDate <= filterEndDate) {
        allChecks.push({
          id: `personal-${check.id}`,
          customerPayee: check.payee,
          checkNumber: check.checkNumber,
          amount: check.amount,
          dueDate: check.dueDate,
          status:
            check.status === "pending"
              ? "pending"
              : check.status === "paid"
              ? "cleared"
              : check.status === "returned"
              ? "cancelled"
              : "pending",
          type: "personal",
          originalId: check.id,
          originalType: "personalCheck",
        });
      }
    });

    // Sort by due date and mark overdue
    allChecks.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    // Mark overdue checks
    allChecks.forEach((check) => {
      if (new Date(check.dueDate) < now && check.status === "pending") {
        check.status = "overdue";
      }
    });

    setUpcomingChecks(allChecks);
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "add-customer":
        navigate("/customers");
        break;
      case "add-order":
        navigate("/orders");
        break;
      case "add-payment":
        navigate("/payments");
        break;
      case "add-customer-check":
        navigate("/checks");
        break;
      case "add-personal-check":
        navigate("/personal-checks");
        break;
      default:
        break;
    }
  };

  const handleCheckAction = (check: Check, action: string) => {
    switch (action) {
      case "view":
        if (check.type === "customer") {
          navigate(`/customers/${check.originalId}`);
        } else {
          navigate("/personal-checks");
        }
        break;
      case "edit":
        if (check.type === "customer") {
          navigate("/checks");
        } else {
          navigate("/personal-checks");
        }
        break;
      case "update-status":
        // This would open a modal to update status
        console.log("Update status for check:", check.id);
        break;
      default:
        break;
    }
  };

  const getStatusIcon = (status: Check["status"]) => {
    switch (status) {
      case "cleared":
        return <CheckCircle className="status-icon cleared" />;
      case "overdue":
        return <AlertCircle className="status-icon overdue" />;
      case "pending":
        return <Clock className="status-icon pending" />;
      case "cancelled":
        return <AlertCircle className="status-icon cancelled" />;
      default:
        return <Clock className="status-icon pending" />;
    }
  };

  const getStatusText = (status: Check["status"]) => {
    switch (status) {
      case "cleared":
        return "تم التصفية";
      case "overdue":
        return "متأخر";
      case "pending":
        return "في الانتظار";
      case "cancelled":
        return "ملغي";
      default:
        return "في الانتظار";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency: "ILS",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "متأخر";
    if (diffDays === 0) return "مستحق اليوم";
    if (diffDays === 1) return "مستحق غداً";
    return `مستحق خلال ${diffDays} يوم`;
  };

  const getFilterText = (filter: string) => {
    switch (filter) {
      case "today":
        return "اليوم";
      case "week":
        return "هذا الأسبوع";
      case "month":
        return "هذا الشهر";
      case "custom":
        return "نطاق مخصص";
      default:
        return "اليوم";
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">لوحة التحكم</h1>
          <p className="dashboard-subtitle">نظرة عامة على أعمال الإنشاءات</p>
        </div>

        {/* Filters */}
        <div className="dashboard-filters">
          <button
            className="filter-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="filter-icon" />
            المرشحات
          </button>

          {showFilters && (
            <div className="filter-dropdown">
              <button
                className={`filter-option ${
                  selectedFilter === "today" ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedFilter("today");
                  setShowFilters(false);
                }}
              >
                اليوم
              </button>
              <button
                className={`filter-option ${
                  selectedFilter === "week" ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedFilter("week");
                  setShowFilters(false);
                }}
              >
                هذا الأسبوع
              </button>
              <button
                className={`filter-option ${
                  selectedFilter === "month" ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedFilter("month");
                  setShowFilters(false);
                }}
              >
                هذا الشهر
              </button>
              <button
                className={`filter-option ${
                  selectedFilter === "custom" ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedFilter("custom");
                  // Don't close for custom, let user set dates
                }}
              >
                نطاق مخصص
              </button>

              {selectedFilter === "custom" && (
                <div className="custom-date-inputs">
                  <div className="date-inputs-row">
                    <div className="date-input-group">
                      <label>من:</label>
                      <input
                        type="date"
                        value={customDateRange.from}
                        onChange={(e) =>
                          setCustomDateRange({
                            ...customDateRange,
                            from: e.target.value,
                          })
                        }
                        className="date-input"
                      />
                    </div>
                    <div className="date-input-group">
                      <label>إلى:</label>
                      <input
                        type="date"
                        value={customDateRange.to}
                        onChange={(e) =>
                          setCustomDateRange({
                            ...customDateRange,
                            to: e.target.value,
                          })
                        }
                        className="date-input"
                      />
                    </div>
                  </div>
                  <button
                    className="apply-dates-btn"
                    onClick={() => setShowFilters(false)}
                  >
                    تطبيق
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card receivables">
          <div className="summary-icon">
            <DollarSign />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">إجمالي المستحقات</h3>
            <p className="summary-amount">
              {formatCurrency(summaryData.totalReceivables)}
            </p>
            <p className="summary-subtitle">العملاء يدينون لك</p>
          </div>
        </div>

        <div className="summary-card payables">
          <div className="summary-icon">
            <CreditCard />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">إجمالي المدفوعات</h3>
            <p className="summary-amount">
              {formatCurrency(summaryData.totalPayables)}
            </p>
            <p className="summary-subtitle">شيكاتك الشخصية/ديونك</p>
          </div>
        </div>

        <div className="summary-card checks-due">
          <div className="summary-icon">
            <FileText />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">الشيكات المستحقة هذا الأسبوع</h3>
            <p className="summary-amount">{summaryData.checksDueThisWeek}</p>
            <p className="summary-subtitle">تتطلب انتباه</p>
          </div>
        </div>

        <div className="summary-card monthly-sales">
          <div className="summary-icon">
            <TrendingUp />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">المبيعات الشهرية</h3>
            <p className="summary-amount">
              {formatCurrency(summaryData.totalSalesThisMonth)}
            </p>
            <p className="summary-subtitle">طلبات هذا الشهر</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-section">
        <h2 className="section-title">الإجراءات السريعة</h2>
        <div className="quick-actions-grid">
          <button
            className="quick-action-btn"
            onClick={() => handleQuickAction("add-customer")}
          >
            <Users className="action-icon" />
            <span>إضافة عميل</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => handleQuickAction("add-order")}
          >
            <Package className="action-icon" />
            <span>إضافة طلب</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => handleQuickAction("add-payment")}
          >
            <Receipt className="action-icon" />
            <span>تسجيل دفعة</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => handleQuickAction("add-customer-check")}
          >
            <FileText className="action-icon" />
            <span>إضافة شيك عميل</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => handleQuickAction("add-personal-check")}
          >
            <Banknote className="action-icon" />
            <span>إضافة شيك شخصي</span>
          </button>
        </div>
      </div>

      {/* Upcoming Checks Table */}
      <div className="checks-section">
        <div className="section-header">
          <h2 className="section-title">الشيكات القادمة</h2>
          <div className="section-actions">
            <span className="filter-badge">
              {getFilterText(selectedFilter)}
            </span>
            {upcomingChecks.length > 0 && (
              <span className="checks-count">{upcomingChecks.length} شيك</span>
            )}
          </div>
        </div>

        <div className="table-container">
          {upcomingChecks.length > 0 ? (
            <table className="checks-table">
              <thead>
                <tr>
                  <th>العميل/المستفيد</th>
                  <th>رقم الشيك</th>
                  <th>المبلغ</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>الحالة</th>
                  <th>الإجراءات السريعة</th>
                </tr>
              </thead>
              <tbody>
                {upcomingChecks.map((check) => (
                  <tr key={check.id} className={`check-row ${check.status}`}>
                    <td>
                      <div className="customer-info">
                        <span className="customer-name">
                          {check.customerPayee}
                        </span>
                        <span className={`check-type ${check.type}`}>
                          {check.type === "customer" ? "عميل" : "شخصي"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="check-number">{check.checkNumber}</span>
                    </td>
                    <td>
                      <span className="check-amount">
                        {formatCurrency(check.amount)}
                      </span>
                    </td>
                    <td>
                      <div className="due-date-info">
                        <span className="due-date">
                          {formatDate(check.dueDate)}
                        </span>
                        <span className="days-until-due">
                          {getDaysUntilDue(check.dueDate)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="status-cell">
                        {getStatusIcon(check.status)}
                        <span className={`status-text ${check.status}`}>
                          {getStatusText(check.status)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="action-btn view"
                          title="عرض التفاصيل"
                          onClick={() => handleCheckAction(check, "view")}
                        >
                          <Eye />
                        </button>
                        <button
                          className="action-btn edit"
                          title="تعديل"
                          onClick={() => handleCheckAction(check, "edit")}
                        >
                          <Edit />
                        </button>
                        <button
                          className="action-btn update-status"
                          title="تحديث الحالة"
                          onClick={() =>
                            handleCheckAction(check, "update-status")
                          }
                        >
                          <CheckCircle />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="no-checks-message">
              <p>لا توجد شيكات مستحقة في النطاق المحدد</p>
              <span>جرب تغيير الفلتر أو إضافة شيكات جديدة</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
