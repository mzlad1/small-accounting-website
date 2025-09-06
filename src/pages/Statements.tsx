import React, { useState, useEffect } from "react";
import {
  Users,
  Package,
  CreditCard,
  FileText,
  DollarSign,
  Calendar,
  Eye,
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
  User,
  Receipt,
  Banknote,
  ChevronDown,
  ChevronRight,
  Printer,
} from "lucide-react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import "./Statements.css";

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
  notes?: string;
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
  checkNumber?: string;
  checkBank?: string;
  isGrouped?: boolean;
  groupedCount?: number;
  originalPayments?: Payment[];
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

interface CustomerStatement {
  customer: Customer;
  orders: Order[];
  payments: Payment[];
  checks: CustomerCheck[];
  totalOrders: number;
  totalPayments: number;
  totalChecks: number;
  currentBalance: number;
  lastActivity: string;
}

export function Statements() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerChecks, setCustomerChecks] = useState<CustomerCheck[]>([]);
  const [customerStatements, setCustomerStatements] = useState<
    CustomerStatement[]
  >([]);

  const [filters, setFilters] = useState({
    dateFrom: "2020-01-01", // Start from a very early date to include all data
    dateTo: new Date().toISOString().split("T")[0], // Today's date
    status: "all",
    balanceType: "all",
    customerId: undefined as string | undefined,
  });

  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState({
    field: "name" as "name" | "balance" | "lastActivity",
    order: "asc" as "asc" | "desc",
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Helper function to calculate order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  useEffect(() => {
    // Generate statements if we have customers (even if no orders/payments yet)
    if (customers.length > 0) {
      generateCustomerStatements();
    }
  }, [customers, orders, orderItems, payments, customerChecks, filters]);

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
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateCustomerStatements = () => {
    const dateFrom = new Date(filters.dateFrom);
    const dateTo = new Date(filters.dateTo);

    const statements: CustomerStatement[] = customers.map((customer) => {
      // Get customer orders
      const customerOrders = orders.filter((order) => {
        const orderDate = new Date(order.date);
        const isInDateRange = orderDate >= dateFrom && orderDate <= dateTo;
        return order.customerId === customer.id && isInDateRange;
      });

      // Get customer payments
      const rawCustomerPayments = payments.filter((payment) => {
        const paymentDate = new Date(payment.date);
        const isInDateRange = paymentDate >= dateFrom && paymentDate <= dateTo;
        return payment.customerId === customer.id && isInDateRange;
      });

      // Group same-day check payments
      const groupedPayments: Payment[] = [];
      const checkPaymentsByDate: { [key: string]: Payment[] } = {};

      // Separate cash payments and check payments
      const cashPayments = rawCustomerPayments.filter(
        (payment) => payment.type === "cash"
      );
      const checkPayments = rawCustomerPayments.filter(
        (payment) => payment.type === "check"
      );

      // Group check payments by date
      checkPayments.forEach((payment) => {
        const key = payment.date;
        if (!checkPaymentsByDate[key]) {
          checkPaymentsByDate[key] = [];
        }
        checkPaymentsByDate[key].push(payment);
      });

      // Create grouped check payments
      Object.values(checkPaymentsByDate).forEach((paymentGroup) => {
        if (paymentGroup.length === 1) {
          // Single payment, add as is
          groupedPayments.push(paymentGroup[0]);
        } else {
          // Multiple payments on same day, group them
          const firstPayment = paymentGroup[0];
          const totalAmount = paymentGroup.reduce(
            (sum, payment) => sum + payment.amount,
            0
          );
          const allCheckNumbers = paymentGroup
            .map((p) => p.checkNumber || p.checkId || "")
            .join(", ");
          const allBanks = [
            ...new Set(paymentGroup.map((p) => p.checkBank).filter(Boolean)),
          ].join(", ");

          const groupedPayment: Payment = {
            ...firstPayment,
            amount: totalAmount,
            notes: `دفعة شيكات (${paymentGroup.length} شيك)`,
            checkId: allCheckNumbers,
            checkNumber: allCheckNumbers,
            checkBank: allBanks,
            isGrouped: true,
            groupedCount: paymentGroup.length,
            originalPayments: paymentGroup,
          };

          groupedPayments.push(groupedPayment);
        }
      });

      // Combine cash payments and grouped check payments
      const customerPayments = [...cashPayments, ...groupedPayments];

      // Get customer checks - include ALL checks for display, not just date-filtered ones
      const customerChecksList = customerChecks.filter(
        (check) => check.customerId === customer.id
      );

      // Calculate totals
      const totalOrders = customerOrders.reduce(
        (sum, order) => sum + calculateOrderTotal(order.id),
        0
      );
      const totalPayments = customerPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );
      const totalChecks = customerChecksList
        .filter((check) => check.status === "pending")
        .reduce((sum, check) => sum + check.amount, 0);

      // Calculate current balance
      const currentBalance = totalOrders + totalChecks - totalPayments;

      // Get last activity date
      const allDates = [
        ...customerOrders.map((order) => new Date(order.date)),
        ...customerPayments.map((payment) => new Date(payment.date)),
        ...customerChecksList.map((check) => new Date(check.dueDate)),
      ];
      const lastActivity =
        allDates.length > 0
          ? new Date(Math.max(...allDates.map((date) => date.getTime())))
          : new Date();

      // Sort orders by date and time (older to newer)
      const sortedOrders = customerOrders.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB; // Ascending order (older first)
      });

      // Sort payments by date and time (older to newer)
      const sortedPayments = customerPayments.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB; // Ascending order (older first)
      });

      // Sort checks by due date and time (older to newer)
      const sortedChecks = customerChecksList.sort((a, b) => {
        const dateA = new Date(a.dueDate).getTime();
        const dateB = new Date(b.dueDate).getTime();
        return dateA - dateB; // Ascending order (older first)
      });

      return {
        customer,
        orders: sortedOrders,
        payments: sortedPayments,
        checks: sortedChecks,
        totalOrders,
        totalPayments,
        totalChecks,
        currentBalance,
        lastActivity: lastActivity.toISOString(),
      };
    });

    // Apply filters
    let filteredStatements = statements;

    // Filter by status
    if (filters.status !== "all") {
      filteredStatements = filteredStatements.filter((statement) => {
        if (filters.status === "active") {
          return statement.orders.length > 0 || statement.checks.length > 0;
        } else if (filters.status === "inactive") {
          return statement.orders.length === 0 && statement.checks.length === 0;
        }
        return true;
      });
    }

    // Filter by balance type
    if (filters.balanceType !== "all") {
      filteredStatements = filteredStatements.filter((statement) => {
        if (filters.balanceType === "positive") {
          return statement.currentBalance > 0;
        } else if (filters.balanceType === "negative") {
          return statement.currentBalance < 0;
        } else if (filters.balanceType === "zero") {
          return statement.currentBalance === 0;
        }
        return true;
      });
    }

    // Filter by customer
    if (filters.customerId) {
      filteredStatements = filteredStatements.filter(
        (statement) => statement.customer.id === filters.customerId
      );
    }

    // Apply sorting
    filteredStatements.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy.field) {
        case "name":
          aValue = a.customer.name;
          bValue = b.customer.name;
          break;
        case "balance":
          aValue = a.currentBalance;
          bValue = b.currentBalance;
          break;
        case "lastActivity":
          aValue = new Date(a.lastActivity).getTime();
          bValue = new Date(b.lastActivity).getTime();
          break;
        default:
          aValue = a.customer.name;
          bValue = b.customer.name;
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setCustomerStatements(filteredStatements);
  };

  const toggleCustomerExpansion = (customerId: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId);
    } else {
      newExpanded.add(customerId);
    }
    setExpandedCustomers(newExpanded);
  };

  const toggleOrderExpansion = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const handleSort = (field: "name" | "balance" | "lastActivity") => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIcon = (field: string) => {
    if (sortBy.field !== field) return null;
    return sortBy.order === "asc" ? "↑" : "↓";
  };

  const printStatement = (customerId?: string) => {
    try {
      const statementsToPrint = customerId
        ? customerStatements.filter((stmt) => stmt.customer.id === customerId)
        : customerStatements;

      if (statementsToPrint.length === 0) {
        alert("لا توجد بيانات للطباعة");
        return;
      }

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>${customerId ? "كشف حساب عميل" : "كشوف الحسابات"}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                direction: rtl; 
                font-size: 14px;
              }
              .header { 
                text-align: center; 
                margin-bottom: 30px; 
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .customer-summary {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                border: 1px solid #dee2e6;
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
                background: white;
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
                font-size: 18px;
              }
              th, td { 
                border: 1px solid #ddd; 
                padding: 6px; 
                text-align: right; 
              }
              th { 
                background-color: #f2f2f2; 
                font-weight: bold; 
                font-size: 18px;
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
              .status-badge {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
              }
              .status-completed { background: #d4edda; color: #155724; }
              .status-in-progress { background: #fff3cd; color: #856404; }
              .status-pending { background: #d1ecf1; color: #0c5460; }
              .status-cancelled { background: #f8d7da; color: #721c24; }
              .status-collected { background: #d4edda; color: #155724; }
              .status-returned { background: #f8d7da; color: #721c24; }
              .status-overdue { background: #fff3cd; color: #856404; }
              .payment-type {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
              }
              .payment-type.cash { background: #d1ecf1; color: #0c5460; }
              .payment-type.check { background: #e2e3e5; color: #383d41; }
              .no-data {
                text-align: center;
                color: #6c757d;
                font-style: italic;
                padding: 10px;
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
              <h1>${customerId ? "كشف حساب عميل" : "كشوف الحسابات"}</h1>
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-US")}</p>
            </div>
            
            ${statementsToPrint
              .map(
                (statement) => `
              <div class="customer-summary">
                <h2>${statement.customer.name}</h2>
                <p>الهاتف: ${statement.customer.phone || "غير محدد"}</p>
                ${
                  statement.customer.notes
                    ? `<p>ملاحظات: ${statement.customer.notes}</p>`
                    : ""
                }
                
                <div class="summary-grid">
                  <div class="summary-item">
                    <span class="summary-value">${formatCurrency(
                      statement.totalOrders
                    )}</span>
                    <span class="summary-label">إجمالي الطلبات</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value">${formatCurrency(
                      statement.totalPayments
                    )}</span>
                    <span class="summary-label">إجمالي المدفوعات</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value">${formatCurrency(
                      statement.totalChecks
                    )}</span>
                    <span class="summary-label">إجمالي الشيكات</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value">${formatCurrency(
                      statement.currentBalance
                    )}</span>
                    <span class="summary-label">الرصيد الحالي</span>
                  </div>
                </div>
                
                ${
                  statement.orders.length > 0
                    ? `
                  <div class="section-header">الطلبات (${
                    statement.orders.length
                  })</div>
                  ${statement.orders
                    .map(
                      (order) => `
                    <div class="order-section">
                      <h5>الطلب: ${order.title}</h5>
                      <div class="order-summary">
                        <span><strong>التاريخ:</strong> ${formatDate(
                          order.date
                        )}</span>
                        <span><strong>الحالة:</strong> 
                          <span class="status-badge status-${getStatusClass(
                            order.status
                          )}">
                            ${getStatusText(order.status)}
                          </span>
                        </span>
                        <span><strong>عدد الأصناف:</strong> ${
                          (orderItems[order.id] || []).length
                        }</span>
                        <span><strong>الإجمالي:</strong> ${formatCurrency(
                          calculateOrderTotal(order.id)
                        )}</span>
                        ${
                          order.notes
                            ? `<span><strong>ملاحظات:</strong> ${order.notes}</span>`
                            : ""
                        }
                      </div>
                      
                      ${
                        (orderItems[order.id] || []).length > 0
                          ? `
                        <table class="order-items-table">
                          <thead>
                            <tr>
                              <th>الصنف</th>
                              <th>النوع</th>
                              <th>الكمية</th>
                              <th>سعر الوحدة</th>
                              <th>الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(orderItems[order.id] || [])
                              .map(
                                (item) => `
                              <tr>
                                <td>${item.name}</td>
                                <td>${item.type}</td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.unitPrice)}</td>
                                <td>${formatCurrency(item.total)}</td>
                              </tr>
                            `
                              )
                              .join("")}
                          </tbody>
                        </table>
                      `
                          : '<p class="no-data">لا توجد أصناف في هذا الطلب</p>'
                      }
                    </div>
                  `
                    )
                    .join("")}
                `
                    : '<p class="no-data">لا توجد طلبات</p>'
                }
                
                ${
                  statement.payments.length > 0
                    ? `
                  <div class="section-header">المدفوعات (${
                    statement.payments.length
                  })</div>
                  <table>
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>النوع</th>
                        <th>المبلغ</th>
                        <th>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${statement.payments
                        .map(
                          (payment) => `
                        <tr>
                          <td>${formatDate(payment.date)}</td>
                          <td>
                            <span class="payment-type ${payment.type}">
                              ${payment.type === "cash" ? "نقداً" : "شيك"}
                            </span>
                          </td>
                          <td>${formatCurrency(payment.amount)}</td>
                          <td>${payment.notes || "-"}</td>
                        </tr>
                      `
                        )
                        .join("")}
                    </tbody>
                  </table>
                `
                    : '<p class="no-data">لا توجد مدفوعات</p>'
                }
                
                ${
                  statement.checks.length > 0
                    ? `
                  <div class="section-header">الشيكات (${
                    statement.checks.length
                  })</div>
                  <table>
                    <thead>
                      <tr>
                        <th>رقم الشيك</th>
                        <th>البنك</th>
                        <th>المبلغ</th>
                        <th>تاريخ الاستحقاق</th>
                        <th>الحالة</th>
                        <th>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${statement.checks
                        .map(
                          (check) => `
                        <tr>
                          <td>${check.checkNumber}</td>
                          <td>${check.bank}</td>
                          <td>${formatCurrency(check.amount)}</td>
                          <td>${formatDate(check.dueDate)}</td>
                          <td>
                            <span class="status-badge status-${getCheckStatusClass(
                              check.status
                            )}">
                              ${getCheckStatusText(check.status)}
                            </span>
                          </td>
                          <td>${check.notes || "-"}</td>
                        </tr>
                      `
                        )
                        .join("")}
                    </tbody>
                  </table>
                `
                    : '<p class="no-data">لا توجد شيكات</p>'
                }
              </div>
            `
              )
              .join("")}
            
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
      console.error("Error printing statement:", error);
      alert("حدث خطأ أثناء الطباعة");
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

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return "completed";
      case "in-progress":
        return "in-progress";
      case "pending":
        return "pending";
      case "cancelled":
        return "cancelled";
      default:
        return "pending";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "مكتمل";
      case "in-progress":
        return "قيد التنفيذ";
      case "pending":
        return "في الانتظار";
      case "cancelled":
        return "ملغي";
      default:
        return "في الانتظار";
    }
  };

  const getCheckStatusClass = (status: string) => {
    switch (status) {
      case "collected":
        return "collected";
      case "pending":
        return "pending";
      case "returned":
        return "returned";
      case "overdue":
        return "overdue";
      default:
        return "pending";
    }
  };

  const getCheckStatusText = (status: string) => {
    switch (status) {
      case "collected":
        return "محصل";
      case "pending":
        return "في الانتظار";
      case "returned":
        return "مرتجع";
      case "overdue":
        return "متأخر";
      default:
        return "في الانتظار";
    }
  };

  if (loading) {
    return (
      <div className="statements-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل كشوف الحسابات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="statements-container">
      {/* Header */}
      <div className="statements-header">
        <div className="header-content">
          <h1>كشوف الحسابات</h1>
          <p>نظرة شاملة على حسابات جميع العملاء</p>
        </div>
        <div className="export-buttons">
          <button className="export-btn print" onClick={() => printStatement()}>
            <Printer className="btn-icon" />
            طباعة جميع الكشوف
          </button>
          {filters.customerId && (
            <button
              className="export-btn print-customer"
              onClick={() => printStatement(filters.customerId)}
            >
              <Printer className="btn-icon" />
              طباعة كشف العميل
            </button>
          )}
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
            <div className="filter-group">
              <label>الحالة:</label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="filter-select"
              >
                <option value="all">جميع العملاء</option>
                <option value="active">عملاء نشطون</option>
                <option value="inactive">عملاء غير نشطين</option>
              </select>
            </div>
            <div className="filter-group">
              <label>نوع الرصيد:</label>
              <select
                value={filters.balanceType}
                onChange={(e) =>
                  setFilters({ ...filters, balanceType: e.target.value })
                }
                className="filter-select"
              >
                <option value="all">جميع الأرصدة</option>
                <option value="positive">رصيد موجب</option>
                <option value="negative">رصيد سالب</option>
                <option value="zero">رصيد صفر</option>
              </select>
            </div>
            <div className="filter-group">
              <label>العميل:</label>
              <select
                value={filters.customerId || "all"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    customerId:
                      e.target.value === "all" ? undefined : e.target.value,
                  })
                }
                className="filter-select"
              >
                <option value="all">جميع العملاء</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <button
                onClick={() =>
                  setFilters({
                    ...filters,
                    dateFrom: "2020-01-01",
                    dateTo: new Date().toISOString().split("T")[0],
                  })
                }
                className="filter-btn"
                style={{
                  padding: "0.5rem 1rem",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                عرض جميع البيانات
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <Users className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{customerStatements.length}</span>
            <span className="stat-label">إجمالي العملاء</span>
          </div>
        </div>
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {customerStatements.reduce(
                (sum, stmt) => sum + stmt.orders.length,
                0
              )}
            </span>
            <span className="stat-label">إجمالي الطلبات</span>
          </div>
        </div>

        <div className="stat-card">
          <TrendingDown className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {formatCurrency(
                customerStatements.reduce(
                  (sum, stmt) => sum + stmt.totalPayments,
                  0
                )
              )}
            </span>
            <span className="stat-label">إجمالي المدفوعات</span>
          </div>
        </div>
      </div>

      {/* Customer Statements Table */}
      <div className="statements-table-container">
        <table className="statements-table">
          <thead>
            <tr>
              <th>تفاصيل</th>
              <th onClick={() => handleSort("name")} className="sortable">
                <div className="th-content">
                  <User className="th-icon" />
                  اسم العميل
                  {getSortIcon("name")}
                </div>
              </th>
              <th>معلومات الاتصال</th>
              <th onClick={() => handleSort("balance")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  الرصيد الحالي
                  {getSortIcon("balance")}
                </div>
              </th>
              <th>الطلبات</th>
              <th>المدفوعات</th>
              <th>الشيكات</th>
              <th
                onClick={() => handleSort("lastActivity")}
                className="sortable"
              >
                <div className="th-content">
                  <Activity className="th-icon" />
                  آخر نشاط
                  {getSortIcon("lastActivity")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {customerStatements.map((statement) => (
              <React.Fragment key={statement.customer.id}>
                {/* Main Row */}
                <tr className="main-row">
                  <td>
                    <div className="action-buttons">
                      <button
                        className="expand-btn"
                        onClick={() =>
                          toggleCustomerExpansion(statement.customer.id)
                        }
                      >
                        {expandedCustomers.has(statement.customer.id) ? (
                          <ChevronDown className="expand-icon" />
                        ) : (
                          <ChevronRight className="expand-icon" />
                        )}
                      </button>
                      <button
                        className="print-btn"
                        onClick={() => printStatement(statement.customer.id)}
                        title="طباعة كشف العميل"
                      >
                        <Printer className="print-icon" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {statement.customer.name}
                        </span>
                        {statement.customer.notes && (
                          <span className="customer-notes">
                            {statement.customer.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="contact-info">
                      <span className="phone">{statement.customer.phone}</span>
                    </div>
                  </td>
                  <td>
                    <div
                      className={`balance ${
                        statement.currentBalance >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {formatCurrency(statement.currentBalance)}
                    </div>
                  </td>
                  <td>
                    <div className="orders-summary">
                      <span className="count">{statement.orders.length}</span>
                      <span className="total">
                        {formatCurrency(statement.totalOrders)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="payments-summary">
                      <span className="count">{statement.payments.length}</span>
                      <span className="total">
                        {formatCurrency(statement.totalPayments)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="checks-summary">
                      <span className="count">{statement.checks.length}</span>
                      <span className="total">
                        {formatCurrency(statement.totalChecks)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="last-activity">
                      {formatDate(statement.lastActivity)}
                    </div>
                  </td>
                </tr>

                {/* Expanded Details Row */}
                {expandedCustomers.has(statement.customer.id) && (
                  <tr className="details-row">
                    <td colSpan={8}>
                      <div className="customer-details-content">
                        {/* Orders Section */}
                        <div className="details-section">
                          <h4>
                            <Package className="section-icon" />
                            الطلبات ({statement.orders.length})
                          </h4>
                          {statement.orders.length > 0 ? (
                            <div className="orders-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>التاريخ</th>
                                    <th>عنوان الطلب</th>
                                    <th>الحالة</th>
                                    <th>عدد الأصناف</th>
                                    <th>الإجمالي</th>
                                    <th>ملاحظات</th>
                                    <th>تفاصيل</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {statement.orders.map((order) => (
                                    <React.Fragment key={order.id}>
                                      <tr>
                                        <td>{formatDate(order.date)}</td>
                                        <td>{order.title}</td>
                                        <td>
                                          <span
                                            className={`status-badge ${getStatusClass(
                                              order.status
                                            )}`}
                                          >
                                            {getStatusText(order.status)}
                                          </span>
                                        </td>
                                        <td>
                                          {(orderItems[order.id] || []).length}
                                        </td>
                                        <td>
                                          {formatCurrency(
                                            calculateOrderTotal(order.id)
                                          )}
                                        </td>
                                        <td>{order.notes || "-"}</td>
                                        <td>
                                          <button
                                            className="expand-order-btn"
                                            onClick={() =>
                                              toggleOrderExpansion(order.id)
                                            }
                                            title="عرض تفاصيل الطلب"
                                          >
                                            {expandedOrders.has(order.id) ? (
                                              <ChevronDown className="expand-icon" />
                                            ) : (
                                              <ChevronRight className="expand-icon" />
                                            )}
                                          </button>
                                        </td>
                                      </tr>
                                      {/* Order Items Details Row */}
                                      {expandedOrders.has(order.id) && (
                                        <tr className="order-items-row">
                                          <td colSpan={7}>
                                            <div className="order-items-details">
                                              <h5>
                                                تفاصيل الطلب: {order.title}
                                              </h5>
                                              {(orderItems[order.id] || [])
                                                .length > 0 ? (
                                                <table className="order-items-table">
                                                  <thead>
                                                    <tr>
                                                      <th>الصنف</th>
                                                      <th>النوع</th>
                                                      <th>الكمية</th>
                                                      <th>الوحدة</th>
                                                      <th>سعر الوحدة</th>
                                                      <th>الإجمالي</th>
                                                      <th>ملاحظات</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {(
                                                      orderItems[order.id] || []
                                                    ).map((item) => (
                                                      <tr key={item.id}>
                                                        <td>{item.name}</td>
                                                        <td>{item.type}</td>
                                                        <td>{item.quantity}</td>
                                                        <td>{item.unit}</td>
                                                        <td>
                                                          {formatCurrency(
                                                            item.unitPrice
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatCurrency(
                                                            item.total
                                                          )}
                                                        </td>
                                                        <td>
                                                          {item.notes || "-"}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              ) : (
                                                <p className="no-data">
                                                  لا توجد أصناف في هذا الطلب
                                                </p>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="no-data">لا توجد طلبات</p>
                          )}
                        </div>

                        {/* Payments Section */}
                        <div className="details-section">
                          <h4>
                            <CreditCard className="section-icon" />
                            المدفوعات ({statement.payments.length})
                          </h4>
                          {statement.payments.length > 0 ? (
                            <div className="payments-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>التاريخ</th>
                                    <th>النوع</th>
                                    <th>المبلغ</th>
                                    <th>ملاحظات</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {statement.payments.map((payment) => (
                                    <tr key={payment.id}>
                                      <td>{formatDate(payment.date)}</td>
                                      <td>
                                        <span
                                          className={`payment-type ${payment.type}`}
                                        >
                                          {payment.type === "cash"
                                            ? "نقداً"
                                            : "شيك"}
                                        </span>
                                      </td>
                                      <td>{formatCurrency(payment.amount)}</td>
                                      <td>{payment.notes || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="no-data">لا توجد مدفوعات</p>
                          )}
                        </div>

                        {/* Checks Section */}
                        <div className="details-section">
                          <h4>
                            <FileText className="section-icon" />
                            الشيكات ({statement.checks.length})
                          </h4>
                          {statement.checks.length > 0 ? (
                            <div className="checks-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>رقم الشيك</th>
                                    <th>البنك</th>
                                    <th>المبلغ</th>
                                    <th>تاريخ الاستحقاق</th>
                                    <th>الحالة</th>
                                    <th>ملاحظات</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {statement.checks.map((check) => (
                                    <tr key={check.id}>
                                      <td>{check.checkNumber}</td>
                                      <td>{check.bank}</td>
                                      <td>{formatCurrency(check.amount)}</td>
                                      <td>{formatDate(check.dueDate)}</td>
                                      <td>
                                        <span
                                          className={`status-badge ${getCheckStatusClass(
                                            check.status
                                          )}`}
                                        >
                                          {getCheckStatusText(check.status)}
                                        </span>
                                      </td>
                                      <td>{check.notes || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="no-data">لا توجد شيكات</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {customerStatements.length === 0 && (
        <div className="no-data-message">
          <p>لا توجد بيانات لعرضها</p>
          <span>جرب تغيير الفلاتر أو نطاق التاريخ</span>
        </div>
      )}
    </div>
  );
}
