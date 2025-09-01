import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Package,
  CreditCard,
  FileText,
  Calendar,
  Filter,
  BarChart3,
  PieChart,
  Activity,
  Eye,
  Printer,
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
import "./Reports.css";

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
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
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

interface FinancialSummary {
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  checksDueToday: number;
  checksDueWeek: number;
  checksDueMonth: number;
}

interface MonthlyData {
  month: string;
  orders: number;
  sales: number;
  payments: number;
}

interface CustomerStatement {
  date: string;
  entry: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerChecks, setCustomerChecks] = useState<CustomerCheck[]>([]);
  const [personalChecks, setPersonalChecks] = useState<PersonalCheck[]>([]);

  const [filters, setFilters] = useState({
    dateFrom: "2025-01-01", // Start from a very early date to include all data
    dateTo: new Date().toISOString().split("T")[0], // Up to today
    customerId: "all",
    itemType: "all",
  });

  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    totalReceivables: 0,
    totalPayables: 0,
    netPosition: 0,
    checksDueToday: 0,
    checksDueWeek: 0,
    checksDueMonth: 0,
  });

  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [selectedCustomerStatement, setSelectedCustomerStatement] = useState<
    CustomerStatement[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  useEffect(() => {
    fetchData();
  }, []);

  // Helper function to calculate order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  useEffect(() => {
    if (customers.length > 0 && orders.length > 0 && payments.length > 0) {
      calculateFinancialSummary();
      calculateMonthlyData();
    }
  }, [
    customers,
    orders,
    orderItems,
    payments,
    customerChecks,
    personalChecks,
    filters,
  ]);

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
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateFinancialSummary = () => {
    const dateFrom = new Date(filters.dateFrom);
    const dateTo = new Date(filters.dateTo);

    // Calculate receivables (customer checks + orders - payments)
    let totalReceivables = 0;
    let totalPayables = 0;

    // Customer checks (receivables)
    customerChecks.forEach((check) => {
      if (
        check.status === "pending" &&
        new Date(check.dueDate) >= dateFrom &&
        new Date(check.dueDate) <= dateTo
      ) {
        totalReceivables += check.amount;
      }
    });

    // Orders (receivables)
    orders.forEach((order) => {
      if (new Date(order.date) >= dateFrom && new Date(order.date) <= dateTo) {
        totalReceivables += calculateOrderTotal(order.id);
      }
    });

    // Payments (reduce receivables)
    payments.forEach((payment) => {
      if (
        new Date(payment.date) >= dateFrom &&
        new Date(payment.date) <= dateTo
      ) {
        totalReceivables -= payment.amount;
      }
    });

    // Personal checks (payables)
    personalChecks.forEach((check) => {
      if (
        check.status === "pending" &&
        new Date(check.dueDate) >= dateFrom &&
        new Date(check.dueDate) <= dateTo
      ) {
        totalPayables += check.amount;
      }
    });

    // Calculate checks due
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    let checksDueToday = 0;
    let checksDueWeek = 0;
    let checksDueMonth = 0;

    // Customer checks due
    customerChecks.forEach((check) => {
      if (check.status === "pending") {
        const dueDate = new Date(check.dueDate);
        if (
          dueDate >= startOfDay &&
          dueDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
        ) {
          checksDueToday += check.amount;
        }
        if (dueDate >= startOfDay && dueDate < endOfWeek) {
          checksDueWeek += check.amount;
        }
        if (dueDate >= startOfDay && dueDate <= endOfMonth) {
          checksDueMonth += check.amount;
        }
      }
    });

    // Personal checks due
    personalChecks.forEach((check) => {
      if (check.status === "pending") {
        const dueDate = new Date(check.dueDate);
        if (
          dueDate >= startOfDay &&
          dueDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
        ) {
          checksDueToday += check.amount;
        }
        if (dueDate >= startOfDay && dueDate < endOfWeek) {
          checksDueWeek += check.amount;
        }
        if (dueDate >= startOfDay && dueDate <= endOfMonth) {
          checksDueMonth += check.amount;
        }
      }
    });

    setFinancialSummary({
      totalReceivables: Math.max(0, totalReceivables),
      totalPayables,
      netPosition: totalReceivables - totalPayables,
      checksDueToday,
      checksDueWeek,
      checksDueMonth,
    });
  };

  const calculateMonthlyData = () => {
    const monthlyMap = new Map<string, MonthlyData>();
    const dateFrom = new Date(filters.dateFrom);
    const dateTo = new Date(filters.dateTo);

    // Initialize months
    for (
      let d = new Date(dateFrom);
      d <= dateTo;
      d.setMonth(d.getMonth() + 1)
    ) {
      const monthKey = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });
      monthlyMap.set(monthKey, {
        month: monthKey,
        orders: 0,
        sales: 0,
        payments: 0,
      });
    }

    // Calculate orders and sales
    orders.forEach((order) => {
      const orderDate = new Date(order.date);
      if (orderDate >= dateFrom && orderDate <= dateTo) {
        const monthKey = orderDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        });
        const monthData = monthlyMap.get(monthKey);
        if (monthData) {
          monthData.orders += 1;
          monthData.sales += calculateOrderTotal(order.id);
        }
      }
    });

    // Calculate payments
    payments.forEach((payment) => {
      const paymentDate = new Date(payment.date);
      if (paymentDate >= dateFrom && paymentDate <= dateTo) {
        const monthKey = paymentDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        });
        const monthData = monthlyMap.get(monthKey);
        if (monthData) {
          monthData.payments += payment.amount;
        }
      }
    });

    setMonthlyData(Array.from(monthlyMap.values()));
  };

  const generateCustomerStatement = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    setSelectedCustomer(customer);

    const statement: CustomerStatement[] = [];
    let runningBalance = 0;

    // Get customer orders
    const customerOrders = orders.filter(
      (order) => order.customerId === customerId
    );
    customerOrders.forEach((order) => {
      if (
        new Date(order.date) >= new Date(filters.dateFrom) &&
        new Date(order.date) <= new Date(filters.dateTo)
      ) {
        const orderTotal = calculateOrderTotal(order.id);
        runningBalance += orderTotal;
        statement.push({
          date: order.date,
          entry: `طلب: ${order.title}`,
          debit: orderTotal,
          credit: 0,
          runningBalance,
        });
      }
    });

    // Get customer payments
    const customerPayments = payments.filter(
      (payment) => payment.customerId === customerId
    );
    customerPayments.forEach((payment) => {
      if (
        new Date(payment.date) >= new Date(filters.dateFrom) &&
        new Date(payment.date) <= new Date(filters.dateTo)
      ) {
        runningBalance -= payment.amount;
        statement.push({
          date: payment.date,
          entry: `دفعة: ${payment.type === "cash" ? "نقداً" : "شيك"}`,
          debit: 0,
          credit: payment.amount,
          runningBalance,
        });
      }
    });

    // Get customer checks
    const customerChecksList = customerChecks.filter(
      (check) => check.customerId === customerId
    );
    customerChecksList.forEach((check) => {
      if (
        new Date(check.dueDate) >= new Date(filters.dateFrom) &&
        new Date(check.dueDate) <= new Date(filters.dateTo)
      ) {
        if (check.status === "pending") {
          runningBalance += check.amount;
          statement.push({
            date: check.dueDate,
            entry: `شيك: ${check.checkNumber} - ${check.bank}`,
            debit: check.amount,
            credit: 0,
            runningBalance,
          });
        }
      }
    });

    // Sort by date
    statement.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setSelectedCustomerStatement(statement);
  };

  const printReport = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>Financial Reports</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                direction: rtl; 
                font-size: 12px;
              }
              .header { 
                text-align: center; 
                margin-bottom: 30px; 
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
              }
              .summary-item {
                text-align: center;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #dee2e6;
              }
              .summary-value {
                font-size: 18px;
                font-weight: bold;
                color: #2c3e50;
                display: block;
              }
              .summary-label {
                color: #6c757d;
                font-size: 12px;
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px; 
                font-size: 11px;
              }
              th, td { 
                border: 1px solid #ddd; 
                padding: 6px; 
                text-align: right; 
              }
              th { 
                background-color: #f2f2f2; 
                font-weight: bold; 
                font-size: 11px;
              }
              .section-header {
                background: #e9ecef;
                padding: 10px;
                margin: 20px 0 10px 0;
                border-radius: 6px;
                font-weight: bold;
                font-size: 14px;
                border-right: 4px solid #007bff;
              }
              .print-date {
                text-align: left;
                color: #6c757d;
                font-size: 11px;
                margin-top: 20px;
              }
              @media print { 
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
                         <div class="header">
               <h1>التقارير المالية</h1>
               <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-US")}</p>
             </div>
             
             <div class="summary-grid">
               <div class="summary-item">
                 <span class="summary-value">${financialSummary.totalReceivables.toLocaleString(
                   "en-US"
                 )}</span>
                 <span class="summary-label">إجمالي المستحقات</span>
               </div>
               <div class="summary-item">
                 <span class="summary-value">${financialSummary.totalPayables.toLocaleString(
                   "en-US"
                 )}</span>
                 <span class="summary-label">إجمالي المدفوعات</span>
               </div>
               <div class="summary-item">
                 <span class="summary-value">${financialSummary.netPosition.toLocaleString(
                   "en-US"
                 )}</span>
                 <span class="summary-label">الرصيد الصافي</span>
               </div>
               <div class="summary-item">
                 <span class="summary-value">${
                   financialSummary.checksDueToday
                 }</span>
                 <span class="summary-label">الشيكات المستحقة اليوم</span>
               </div>
               <div class="summary-item">
                 <span class="summary-value">${
                   financialSummary.checksDueWeek
                 }</span>
                 <span class="summary-label">الشيكات المستحقة هذا الأسبوع</span>
               </div>
               <div class="summary-item">
                 <span class="summary-value">${
                   financialSummary.checksDueMonth
                 }</span>
                 <span class="summary-label">الشيكات المستحقة هذا الشهر</span>
               </div>
             </div>
             
             <div class="section-header">أفضل العملاء حسب المستحقات</div>
             <table>
               <thead>
                 <tr>
                   <th>اسم العميل</th>
                   <th>إجمالي الطلبات</th>
                   <th>إجمالي المستحقات</th>
                 </tr>
               </thead>
               <tbody>
                 ${customers
                   .slice(0, 10)
                   .map((customer) => {
                     const customerOrders = orders.filter(
                       (order) => order.customerId === customer.id
                     );
                     const totalReceivables = customerOrders.reduce(
                       (sum, order) => sum + calculateOrderTotal(order.id),
                       0
                     );
                     return `
                     <tr>
                       <td>${customer.name}</td>
                       <td>${customerOrders.length}</td>
                       <td>${totalReceivables.toLocaleString("en-US")}</td>
                     </tr>
                   `;
                   })
                   .join("")}
               </tbody>
             </table>
             
             <div class="section-header">الطلبات الحديثة</div>
             <table>
               <thead>
                 <tr>
                   <th>التاريخ</th>
                   <th>العميل</th>
                   <th>عنوان الطلب</th>
                   <th>الحالة</th>
                   <th>الإجمالي</th>
                 </tr>
               </thead>
               <tbody>
                 ${orders
                   .slice(0, 20)
                   .map(
                     (order) => `
                   <tr>
                     <td>${formatDate(order.date)}</td>
                     <td>${order.customerName}</td>
                     <td>${order.title}</td>
                     <td>${order.status}</td>
                     <td>${calculateOrderTotal(order.id).toLocaleString(
                       "en-US"
                     )}</td>
                   </tr>
                 `
                   )
                   .join("")}
               </tbody>
             </table>
             
             <div class="section-header">المدفوعات الحديثة</div>
             <table>
               <thead>
                 <tr>
                   <th>التاريخ</th>
                   <th>العميل</th>
                   <th>النوع</th>
                   <th>المبلغ</th>
                 </tr>
               </thead>
               <tbody>
                 ${payments
                   .slice(0, 20)
                   .map(
                     (payment) => `
                   <tr>
                     <td>${formatDate(payment.date)}</td>
                     <td>${payment.customerName}</td>
                     <td>${payment.type === "cash" ? "نقداً" : "شيك"}</td>
                     <td>${payment.amount.toLocaleString("en-US")}</td>
                   </tr>
                 `
                   )
                   .join("")}
               </tbody>
             </table>
             
             <div class="print-date">
               تمت الطباعة في: ${new Date().toLocaleString("en-US")}
             </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing report:", error);
      alert("Error occurred while printing");
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

  if (loading) {
    return (
      <div className="reports-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل التقارير...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      {/* Header */}
      <div className="reports-header">
        <div className="header-content">
          <h1>التقارير</h1>
          <p>تحليلات مالية وملخصات الأعمال</p>
        </div>
        <div className="export-buttons">
          <button className="export-btn print" onClick={printReport}>
            <Printer className="btn-icon" />
            طباعة التقرير
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-header">
          <Filter className="filter-icon" />
          <h3>فلاتر التقرير</h3>
        </div>
        <div className="filters-content">
          <div className="filter-row">
            <div className="filter-group">
              <label>من تاريخ:</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
                className="filter-input"
              />
            </div>
            <div className="filter-group">
              <label>إلى تاريخ:</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
                className="filter-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card receivables">
          <div className="card-icon">
            <TrendingUp className="icon" />
          </div>
          <div className="card-content">
            <h3>إجمالي المستحقات</h3>
            <p className="amount">
              {formatCurrency(financialSummary.totalReceivables)}
            </p>
            <span className="label">المبالغ المستحقة عليك</span>
          </div>
        </div>

        <div className="summary-card payables">
          <div className="card-icon">
            <TrendingDown className="icon" />
          </div>
          <div className="card-content">
            <h3>إجمالي المدفوعات</h3>
            <p className="amount">
              {formatCurrency(financialSummary.totalPayables)}
            </p>
            <span className="label">المبالغ المستحقة عليك</span>
          </div>
        </div>
      </div>

      {/* Checks Due Summary */}
      <div className="checks-summary">
        <h3>الشيكات المستحقة</h3>
        <div className="checks-grid">
          <div className="check-item today">
            <Calendar className="check-icon" />
            <div className="check-info">
              <span className="check-label">اليوم</span>
              <span className="check-amount">
                {formatCurrency(financialSummary.checksDueToday)}
              </span>
            </div>
          </div>
          <div className="check-item week">
            <Calendar className="check-icon" />
            <div className="check-info">
              <span className="check-label">هذا الأسبوع</span>
              <span className="check-amount">
                {formatCurrency(financialSummary.checksDueWeek)}
              </span>
            </div>
          </div>
          <div className="check-item month">
            <Calendar className="check-icon" />
            <div className="check-info">
              <span className="check-label">هذا الشهر</span>
              <span className="check-amount">
                {formatCurrency(financialSummary.checksDueMonth)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Progress */}
      <div className="monthly-progress">
        <h3>التقدم الشهري</h3>
        <div className="progress-table">
          <table>
            <thead>
              <tr>
                <th>الشهر</th>
                <th>عدد الطلبات</th>
                <th>إجمالي المدفوعات</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((month) => (
                <tr key={month.month}>
                  <td>{month.month}</td>
                  <td>{month.orders}</td>
                  <td>{formatCurrency(month.payments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
