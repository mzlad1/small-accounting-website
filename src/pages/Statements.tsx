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
  Search,
  SortAsc,
  SortDesc,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { formatItemDate } from "../utils/itemDate";
import { matchesSearch } from "../utils/search";
import { Pagination } from "../components/Pagination";
import {
  FiltersBar,
  SearchField,
  SelectField,
  DateField,
} from "../components/Filters";
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

  const [searchTerm, setSearchTerm] = useState("");

  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState({
    field: "name",
    order: "asc" as "asc" | "desc",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        collection(db, "customers"),
        collection(db, "orders"),
        collection(db, "orderItems"),
        collection(db, "payments"),
        collection(db, "customerChecks"),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [
      customersSnapshot,
      ordersSnapshot,
      orderItemsSnapshot,
      paymentsSnapshot,
      customerChecksSnapshot,
    ] = snapshots;

    // Fetch customers
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

    // Group all order items by orderId in memory
    // (replaces the per-order query loop — one read instead of N)
    const orderItemsData: { [orderId: string]: any[] } = {};
    orderItemsSnapshot.forEach((doc) => {
      const item = { id: doc.id, ...doc.data() } as any;
      if (!orderItemsData[item.orderId]) {
        orderItemsData[item.orderId] = [];
      }
      orderItemsData[item.orderId].push(item);
    });
    setOrderItems(orderItemsData);

    // Fetch payments
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

    // Sorting is applied on the visible list (below), so a header click
    // reorders immediately without regenerating every statement.
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

  const handleSort = (field: string) => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIcon = (field: string) => {
    if (sortBy.field !== field) return null;
    return sortBy.order === "asc" ? (
      <SortAsc size={14} />
    ) : (
      <SortDesc size={14} />
    );
  };

  // One comparable value per sortable column: amounts stay numeric,
  // names/phones compare as text, dates compare on their raw value.
  const statementSortValue = (
    statement: CustomerStatement,
    field: string
  ): string | number => {
    switch (field) {
      case "phone":
        return statement.customer.phone || "";
      case "balance":
        return statement.currentBalance;
      case "orders":
        return statement.totalOrders;
      case "payments":
        return statement.totalPayments;
      case "checks":
        return statement.totalChecks;
      case "lastActivity":
        return statement.lastActivity || "";
      case "name":
      default:
        return statement.customer.name || "";
    }
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
                border-bottom: 2px solid #2b241c;
                padding-bottom: 20px;
              }
              .customer-summary {
                background: #faf6ee;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                border: 1px solid #d8cdbb;
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
                border: 1px solid #d8cdbb;
              }
              .summary-value {
                font-size: 18px;
                font-weight: bold;
                color: #221c15;
                display: block;
              }
              .summary-label {
                color: #6f6459;
                font-size: 12px;
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px; 
                font-size: 18px;
              }
              th, td { 
                border: 1px solid #d8cdbb; 
                padding: 6px; 
                text-align: right; 
              }
              th { 
                background-color: #f0eae0; 
                font-weight: bold; 
                font-size: 18px;
              }
              .section-header {
                background: #f0eae0;
                padding: 10px;
                margin: 20px 0 10px 0;
                border-radius: 6px;
                font-weight: bold;
                font-size: 14px;
                border-right: 4px solid #bc5727;
              }
              .status-badge {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
              }
              .status-completed { background: #eaf1eb; color: #3e6a4c; }
              .status-in-progress { background: #f8f0de; color: #8f6118; }
              .status-pending { background: #f6e7dc; color: #8f3e1b; }
              .status-cancelled { background: #f9e9e6; color: #9a3226; }
              .status-collected { background: #eaf1eb; color: #3e6a4c; }
              .status-returned { background: #f9e9e6; color: #9a3226; }
              .status-overdue { background: #f8f0de; color: #8f6118; }
              .payment-type {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
              }
              .payment-type.cash { background: #f6e7dc; color: #8f3e1b; }
              .payment-type.check { background: #f0eae0; color: #6f6459; }
              .no-data {
                text-align: center;
                color: #6f6459;
                font-style: italic;
                padding: 10px;
              }
              .print-date {
                text-align: left;
                color: #6f6459;
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
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-GB")}</p>
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
              تمت الطباعة في: ${new Date().toLocaleString("en-GB")}
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
    return new Date(dateString).toLocaleDateString("en-GB");
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

  // Any-field, Arabic-aware search over the generated statements
  // (the dropdown filters above are applied in generateCustomerStatements),
  // then header sorting — both before the pagination slice below.
  const visibleStatements = customerStatements
    .filter((statement) => matchesSearch(statement, searchTerm))
    .sort((a, b) => {
      const aValue = statementSortValue(a, sortBy.field);
      const bValue = statementSortValue(b, sortBy.field);
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), "ar");
      return sortBy.order === "asc" ? comparison : -comparison;
    });

  // Pagination (top-level customer rows only - expanded details are untouched)
  const totalPages = Math.ceil(visibleStatements.length / itemsPerPage);
  const paginatedStatements = visibleStatements.slice(
    (currentPage - 1) * itemsPerPage,
    (currentPage - 1) * itemsPerPage + itemsPerPage
  );

  // Reset to first page whenever the search term, filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, sortBy]);

  // Keep the current page inside range when the visible list shrinks
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Pagination functions
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
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

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <Users className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{visibleStatements.length}</span>
            <span className="stat-label">إجمالي العملاء</span>
          </div>
        </div>
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {visibleStatements.reduce(
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
                visibleStatements.reduce(
                  (sum, stmt) => sum + stmt.totalPayments,
                  0
                )
              )}
            </span>
            <span className="stat-label">إجمالي المدفوعات</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        onClear={() => {
          setSearchTerm("");
          setFilters({
            dateFrom: "2020-01-01",
            dateTo: new Date().toISOString().split("T")[0],
            status: "all",
            balanceType: "all",
            customerId: undefined,
          });
        }}
      >
        <SearchField value={searchTerm} onChange={setSearchTerm} />
        <DateField
          label="من تاريخ"
          value={filters.dateFrom}
          onChange={(v) => setFilters({ ...filters, dateFrom: v })}
        />
        <DateField
          label="إلى تاريخ"
          value={filters.dateTo}
          onChange={(v) => setFilters({ ...filters, dateTo: v })}
        />
        <SelectField
          label="الحالة"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={[
            { value: "all", label: "جميع العملاء" },
            { value: "active", label: "عملاء نشطون" },
            { value: "inactive", label: "عملاء غير نشطين" },
          ]}
        />
        <SelectField
          label="نوع الرصيد"
          value={filters.balanceType}
          onChange={(v) => setFilters({ ...filters, balanceType: v })}
          options={[
            { value: "all", label: "جميع الأرصدة" },
            { value: "positive", label: "رصيد موجب" },
            { value: "negative", label: "رصيد سالب" },
            { value: "zero", label: "رصيد صفر" },
          ]}
        />
        <SelectField
          label="العميل"
          value={filters.customerId || "all"}
          onChange={(v) =>
            setFilters({
              ...filters,
              customerId: v === "all" ? undefined : v,
            })
          }
          options={[
            { value: "all", label: "جميع العملاء" },
            ...customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            })),
          ]}
        />
      </FiltersBar>

      {/* Customer Statements Table */}
      <div className="statements-table-container stm-sheet">
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
              <th onClick={() => handleSort("phone")} className="sortable">
                <div className="th-content">
                  معلومات الاتصال
                  {getSortIcon("phone")}
                </div>
              </th>
              <th onClick={() => handleSort("balance")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  الرصيد الحالي
                  {getSortIcon("balance")}
                </div>
              </th>
              <th onClick={() => handleSort("orders")} className="sortable">
                <div className="th-content">
                  <Package className="th-icon" />
                  الطلبات
                  {getSortIcon("orders")}
                </div>
              </th>
              <th onClick={() => handleSort("payments")} className="sortable">
                <div className="th-content">
                  <CreditCard className="th-icon" />
                  المدفوعات
                  {getSortIcon("payments")}
                </div>
              </th>
              <th onClick={() => handleSort("checks")} className="sortable">
                <div className="th-content">
                  <FileText className="th-icon" />
                  الشيكات
                  {getSortIcon("checks")}
                </div>
              </th>
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
            {paginatedStatements.map((statement) => (
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
                                                      <th>التاريخ</th>
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
                                                        <td>{formatItemDate(item)}</td>
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

      {/* Pagination Controls */}
      {visibleStatements.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={visibleStatements.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
          itemLabel="عميل"
        />
      )}

      {visibleStatements.length === 0 && (
        <div className="no-data-message stm-empty">
          <FileText className="stm-empty-icon" size={34} />
          <p>لا توجد بيانات لعرضها</p>
          <span>جرب تغيير الفلاتر أو نطاق التاريخ</span>
        </div>
      )}
    </div>
  );
}
