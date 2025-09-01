import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Edit,
  Plus,
  Package,
  CreditCard,
  FileText,
  BarChart3,
  Calendar,
  DollarSign,
  Eye,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Printer,
} from "lucide-react";

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./CustomerAccount.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  numberOfOrders: number;
  currentBalance: number;
  lastActivity: string;
  createdAt: string;
}

interface Order {
  id: string;
  customerId: string;
  title: string;
  date: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  numberOfItems?: number;
  total?: number;
  notes?: string;
  createdAt: string;
}

interface Payment {
  id: string;
  customerId: string;
  date: string;
  type: "cash" | "check";
  amount: number;
  notes?: string;
  checkNumber?: string;
  checkBank?: string;
  createdAt: string;
}

interface CustomerCheck {
  id: string;
  customerId: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: "pending" | "collected" | "returned";
  notes?: string;
  createdAt: string;
}

interface StatementEntry {
  id: string;
  date: string;
  type: "order" | "payment" | "check";
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function CustomerAccount() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("orders");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerChecks, setCustomerChecks] = useState<CustomerCheck[]>([]);
  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<"order" | "payment" | "check">(
    "order"
  );
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Filtered data states
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [filteredChecks, setFilteredChecks] = useState<CustomerCheck[]>([]);
  const [filteredStatement, setFilteredStatement] = useState<StatementEntry[]>(
    []
  );

  // Form data for different modals
  const [orderForm, setOrderForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    status: "pending" as Order["status"],
    notes: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "cash" as Payment["type"],
    amount: 0,
    notes: "",
    checkNumber: "",
    checkBank: "",
  });

  const [checkForm, setCheckForm] = useState({
    checkNumber: "",
    bank: "",
    amount: 0,
    dueDate: new Date().toISOString().split("T")[0],
    status: "pending" as CustomerCheck["status"],
    notes: "",
  });

  // Filters and sorting
  const [orderFilters, setOrderFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [orderSort, setOrderSort] = useState({
    field: "date",
    order: "desc" as "asc" | "desc",
  });

  const [paymentFilters, setPaymentFilters] = useState({
    type: "all",
    dateFrom: "",
    dateTo: "",
  });

  const [checkFilters, setCheckFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
  });

  const [statementFilters, setStatementFilters] = useState({
    dateFrom: "",
    dateTo: "",
    entryType: "all",
  });

  useEffect(() => {
    if (customerId) {
      fetchCustomerData();
    }
  }, [customerId]);

  // Refresh data when component comes into focus (e.g., returning from order details)
  useEffect(() => {
    const handleFocus = () => {
      if (customerId) {
        fetchCustomerData();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [customerId]);

  // Apply filters to orders
  useEffect(() => {
    let filtered = [...orders];

    if (orderFilters.status !== "all") {
      filtered = filtered.filter(
        (order) => order.status === orderFilters.status
      );
    }

    if (orderFilters.dateFrom) {
      filtered = filtered.filter(
        (order) => new Date(order.date) >= new Date(orderFilters.dateFrom)
      );
    }

    if (orderFilters.dateTo) {
      filtered = filtered.filter(
        (order) => new Date(order.date) <= new Date(orderFilters.dateTo)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (orderSort.field === "date") {
        return orderSort.order === "asc"
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return 0;
    });

    setFilteredOrders(filtered);
  }, [orders, orderFilters, orderSort]);

  // Apply filters to payments
  useEffect(() => {
    let filtered = [...payments];

    if (paymentFilters.type !== "all") {
      filtered = filtered.filter(
        (payment) => payment.type === paymentFilters.type
      );
    }

    if (paymentFilters.dateFrom) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) >= new Date(paymentFilters.dateFrom)
      );
    }

    if (paymentFilters.dateTo) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) <= new Date(paymentFilters.dateTo)
      );
    }

    setFilteredPayments(filtered);
  }, [payments, paymentFilters]);

  // Apply filters to checks
  useEffect(() => {
    console.log(
      "useEffect for checks filtering triggered. customerChecks:",
      customerChecks
    ); // Debug log

    // Temporarily disable filtering to test if that's the issue
    let filtered = [...customerChecks];

    console.log("All checks before filtering:", filtered); // Debug log

    if (checkFilters.status !== "all") {
      filtered = filtered.filter(
        (check) => check.status === checkFilters.status
      );
      console.log("After status filtering:", filtered); // Debug log
    }

    if (checkFilters.dateFrom) {
      console.log("Filtering by dateFrom:", checkFilters.dateFrom); // Debug log
      filtered = filtered.filter(
        (check) => new Date(check.dueDate) >= new Date(checkFilters.dateFrom)
      );
      console.log("After dateFrom filtering:", filtered); // Debug log
    }

    if (checkFilters.dateTo) {
      console.log("Filtering by dateTo:", checkFilters.dateTo); // Debug log
      filtered = filtered.filter(
        (check) => new Date(check.dueDate) <= new Date(checkFilters.dateTo)
      );
      console.log("After dateTo filtering:", filtered); // Debug log
    }

    console.log("Final filtered checks:", filtered); // Debug log
    console.log(
      "Original checks count:",
      customerChecks.length,
      "Filtered checks count:",
      filtered.length
    ); // Debug log
    setFilteredChecks(filtered);
  }, [customerChecks, checkFilters]);

  // Apply filters to statement
  useEffect(() => {
    let filtered = [...statement];

    if (statementFilters.dateFrom) {
      filtered = filtered.filter(
        (entry) => new Date(entry.date) >= new Date(statementFilters.dateFrom)
      );
    }

    if (statementFilters.dateTo) {
      filtered = filtered.filter(
        (entry) => new Date(entry.date) <= new Date(statementFilters.dateTo)
      );
    }

    if (statementFilters.entryType !== "all") {
      filtered = filtered.filter(
        (entry) => entry.type === statementFilters.entryType
      );
    }

    setFilteredStatement(filtered);
  }, [statement, statementFilters]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);

      // Fetch customer details
      const customerRef = doc(db, "customers", customerId!);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const customerData = {
          id: customerSnap.id,
          ...customerSnap.data(),
        } as Customer;
        setCustomer(customerData);
      }

      // Fetch orders
      const ordersQuery = query(
        collection(db, "orders"),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const ordersData: Order[] = [];
      ordersSnapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() } as Order);
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
      const paymentsQuery = query(
        collection(db, "payments"),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsData: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        paymentsData.push({ id: doc.id, ...doc.data() } as Payment);
      });
      setPayments(paymentsData);

      // Fetch customer checks
      const checksQuery = query(
        collection(db, "customerChecks"),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      console.log("Fetching checks for customerId:", customerId); // Debug log
      const checksSnapshot = await getDocs(checksQuery);
      console.log("Checks snapshot size:", checksSnapshot.size); // Debug log
      const checksData: CustomerCheck[] = [];
      checksSnapshot.forEach((doc) => {
        const checkData = { id: doc.id, ...doc.data() } as CustomerCheck;
        console.log("Processing check:", checkData); // Debug log
        checksData.push(checkData);
      });
      console.log("Fetched checks:", checksData); // Debug log
      setCustomerChecks(checksData);

      // Debug: Log the current state after setting
      console.log("Setting customerChecks state to:", checksData);

      // Generate statement
      generateStatement(ordersData, paymentsData, checksData);
    } catch (error) {
      console.error("Error fetching customer data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateStatement = (
    ordersData: Order[],
    paymentsData: Payment[],
    checksData: CustomerCheck[]
  ) => {
    const entries: StatementEntry[] = [];
    let runningBalance = 0;

    // Add orders (debits)
    ordersData.forEach((order) => {
      const orderTotal = calculateOrderTotal(order.id);
      runningBalance += orderTotal;
      entries.push({
        id: `order-${order.id}`,
        date: order.date,
        type: "order",
        description: `طلبية: ${order.title}`,
        debit: orderTotal,
        credit: 0,
        runningBalance,
      });
    });

    // Add payments (credits)
    paymentsData.forEach((payment) => {
      runningBalance -= payment.amount;
      entries.push({
        id: `payment-${payment.id}`,
        date: payment.date,
        type: "payment",
        description: `دفعة: ${
          payment.type === "check" ? `شيك ${payment.checkNumber}` : "نقداً"
        }`,
        debit: 0,
        credit: payment.amount,
        runningBalance,
      });
    });

    // Add customer checks (credits)
    checksData.forEach((check) => {
      if (check.status === "collected") {
        runningBalance -= check.amount;
        entries.push({
          id: `check-${check.id}`,
          date: check.dueDate,
          type: "check",
          description: `شيك: ${check.checkNumber} - ${check.bank}`,
          debit: 0,
          credit: check.amount,
          runningBalance,
        });
      }
    });

    // Sort by date
    entries.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setStatement(entries);
  };

  const handleAddOrder = async () => {
    try {
      const newOrder = {
        ...orderForm,
        customerId: customerId!,
        customerName: customer?.name || "",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "orders"), newOrder);
      setShowAddModal(false);
      setOrderForm({
        title: "",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        notes: "",
      });
      fetchCustomerData();
    } catch (error) {
      console.error("Error adding order:", error);
    }
  };

  const handleAddPayment = async () => {
    try {
      const newPayment = {
        ...paymentForm,
        customerId: customerId!,
        customerName: customer?.name || "",
        createdAt: new Date().toISOString(),
      };

      // Add the payment
      const paymentRef = await addDoc(collection(db, "payments"), newPayment);

      // If it's a check payment, also add it to the checks collection
      if (paymentForm.type === "check") {
        const newCheck = {
          customerId: customerId!,
          customerName: customer?.name || "",
          checkNumber: paymentForm.checkNumber!,
          bank: paymentForm.checkBank!,
          amount: paymentForm.amount,
          dueDate: paymentForm.date, // Use payment date as due date
          status: "pending" as CustomerCheck["status"],
          notes: paymentForm.notes || `دفعة شيك - ${paymentForm.notes || ""}`,
          createdAt: new Date().toISOString(),
        };

        console.log("Creating new check:", newCheck); // Debug log
        console.log("Payment date format:", paymentForm.date); // Debug log
        console.log("New check dueDate:", newCheck.dueDate); // Debug log
        const checkRef = await addDoc(
          collection(db, "customerChecks"),
          newCheck
        );
        console.log("Check created with ID:", checkRef.id); // Debug log
      }

      setShowAddModal(false);
      setPaymentForm({
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        amount: 0,
        notes: "",
        checkNumber: "",
        checkBank: "",
      });

      // Force refresh the data to ensure new check appears
      await fetchCustomerData();

      // Additional delay to ensure database sync
      setTimeout(() => {
        fetchCustomerData();
      }, 1000);
    } catch (error) {
      console.error("Error adding payment:", error);
    }
  };

  const handleAddCheck = async () => {
    try {
      const newCheck = {
        ...checkForm,
        customerId: customerId!,
        customerName: customer?.name || "",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "customerChecks"), newCheck);
      setShowAddModal(false);
      setCheckForm({
        checkNumber: "",
        bank: "",
        amount: 0,
        dueDate: new Date().toISOString().split("T")[0],
        status: "pending",
        notes: "",
      });
      fetchCustomerData();
    } catch (error) {
      console.error("Error adding check:", error);
    }
  };

  const openAddModal = (type: "order" | "payment" | "check") => {
    setModalType(type);
    setShowAddModal(true);
  };

  const openEditOrderModal = (order: Order) => {
    setEditingOrder(order);
    setShowEditOrderModal(true);
  };

  const handleEditOrder = async () => {
    if (!editingOrder) return;

    try {
      const orderRef = doc(db, "orders", editingOrder.id);
      await updateDoc(orderRef, {
        title: editingOrder.title,
        date: editingOrder.date,
        status: editingOrder.status,
        notes: editingOrder.notes,
      });

      setShowEditOrderModal(false);
      setEditingOrder(null);
      fetchCustomerData();
    } catch (error) {
      console.error("Error updating order:", error);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    try {
      // First delete all order items
      const itemsQuery = query(
        collection(db, "orderItems"),
        where("orderId", "==", orderToDelete.id)
      );
      const itemsSnapshot = await getDocs(itemsQuery);

      const deletePromises = itemsSnapshot.docs.map((doc) =>
        deleteDoc(doc.ref)
      );
      await Promise.all(deletePromises);

      // Then delete the order
      await deleteDoc(doc(db, "orders", orderToDelete.id));

      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      fetchCustomerData();
    } catch (error) {
      console.error("Error deleting order:", error);
    }
  };

  const confirmDeleteOrder = (order: Order) => {
    setOrderToDelete(order);
    setShowDeleteConfirm(true);
  };

  const updateCheckStatus = async (
    checkId: string,
    newStatus: CustomerCheck["status"]
  ) => {
    try {
      const checkRef = doc(db, "customerChecks", checkId);
      await updateDoc(checkRef, { status: newStatus });
      fetchCustomerData();
    } catch (error) {
      console.error("Error updating check status:", error);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
      case "collected":
        return <CheckCircle className="status-icon completed" />;
      case "pending":
        return <Clock className="status-icon pending" />;
      case "cancelled":
      case "returned":
        return <XCircle className="status-icon cancelled" />;
      default:
        return <Clock className="status-icon pending" />;
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
      case "collected":
        return "تم تحصيله";
      case "returned":
        return "مرتجع";
      default:
        return "في الانتظار";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
      case "collected":
        return "completed";
      case "in-progress":
        return "in-progress";
      case "pending":
        return "pending";
      case "cancelled":
      case "returned":
        return "cancelled";
      default:
        return "pending";
    }
  };

  const exportStatement = () => {
    printStatement();
  };

  const printStatement = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const statementContent = document.querySelector(".statement-tab");
        if (statementContent) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
              <meta charset="UTF-8">
              <title>كشف الحساب - ${customer?.name}</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
                .header { text-align: center; margin-bottom: 30px; }
                .customer-info { margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                th { background-color: #f2f2f2; font-weight: bold; }
                .debit { color: #d32f2f; }
                .credit { color: #388e3c; }
                .summary { margin-top: 20px; font-weight: bold; }
                @media print { body { margin: 0; } }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>كشف الحساب</h1>
              </div>
              <div class="customer-info">
                <p><strong>العميل:</strong> ${customer?.name}</p>
                <p><strong>الهاتف:</strong> ${customer?.phone}</p>
                <p><strong>التاريخ:</strong> ${new Date().toLocaleDateString(
                  "en-US"
                )}</p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>القيد</th>
                    <th>مدين</th>
                    <th>دائن</th>
                    <th>الرصيد الجاري</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredStatement
                    .map(
                      (entry) => `
                    <tr>
                      <td>${formatDate(entry.date)}</td>
                      <td>${entry.description}</td>
                      <td class="${entry.debit > 0 ? "debit" : ""}">${
                        entry.debit > 0 ? formatCurrency(entry.debit) : "-"
                      }</td>
                      <td class="${entry.credit > 0 ? "credit" : ""}">${
                        entry.credit > 0 ? formatCurrency(entry.credit) : "-"
                      }</td>
                      <td>${formatCurrency(Math.abs(entry.runningBalance))}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
              <div class="summary">
                <p><strong>الرصيد النهائي:</strong> ${formatCurrency(
                  calculateCurrentBalance()
                )}</p>
              </div>
            </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      }
    } catch (error) {
      console.error("Error printing statement:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  // Calculate real order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  const calculateOrderNumberOfItems = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.length;
  };

  // Calculate current balance based on real data
  const calculateCurrentBalance = () => {
    const totalOrders = orders.reduce(
      (sum, order) => sum + calculateOrderTotal(order.id),
      0
    );
    const totalPayments = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    const totalPendingChecks = customerChecks
      .filter((check) => check.status === "pending")
      .reduce((sum, check) => sum + check.amount, 0);

    return totalOrders + totalPendingChecks - totalPayments;
  };

  if (loading) {
    return (
      <div className="ca-customer-account-container">
        <div className="ca-loading-spinner">
          <div className="ca-spinner"></div>
          <p>جاري تحميل بيانات العميل...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="ca-customer-account-container">
        <div className="ca-error-message">
          <p>لم يتم العثور على العميل</p>
          <button
            onClick={() => navigate("/customers")}
            className="ca-btn-secondary"
          >
            العودة إلى العملاء
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ca-customer-account-container">
      {/* Header */}
      <div className="ca-account-header">
        <div className="ca-header-left">
          <button
            onClick={() => navigate("/customers")}
            className="ca-back-btn"
          >
            <ArrowLeft className="ca-back-icon" />
            العودة
          </button>
          <div className="ca-customer-info">
            <h1 className="ca-customer-name">{customer.name}</h1>
            <div className="ca-customer-details">
              <span className="ca-phone">{customer.phone}</span>
              {customer.notes && (
                <span className="ca-notes">{customer.notes}</span>
              )}
            </div>
          </div>
        </div>
        <button
          className="ca-edit-customer-btn"
          onClick={() => setShowEditModal(true)}
        >
          <Edit className="ca-btn-icon" />
          تعديل العميل
        </button>
      </div>

      {/* Account Summary */}
      <div className="ca-account-summary">
        <div className="ca-summary-card">
          <Package className="ca-summary-icon" />
          <div className="ca-summary-content">
            <h3>إجمالي الطلبات</h3>
            <p className="ca-summary-value">{orders.length}</p>
          </div>
        </div>
        <div className="ca-summary-card">
          <CreditCard className="ca-summary-icon" />
          <div className="ca-summary-content">
            <h3>إجمالي المدفوعات</h3>
            <p className="ca-summary-value">
              {formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0))}
            </p>
          </div>
        </div>
        <div className="ca-summary-card">
          <DollarSign className="ca-summary-icon" />
          <div className="ca-summary-content">
            <h3>الرصيد الحالي</h3>
            <p
              className={`ca-summary-value ${
                calculateCurrentBalance() > 0
                  ? "positive"
                  : calculateCurrentBalance() < 0
                  ? "negative"
                  : "zero"
              }`}
            >
              {formatCurrency(Math.abs(calculateCurrentBalance()))}
            </p>
            <span className="ca-balance-status">
              {calculateCurrentBalance() > 0
                ? "مدين لك"
                : calculateCurrentBalance() < 0
                ? "تدين له"
                : "متساوي"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ca-tabs-container">
        <div className="ca-tabs-header">
          <button
            className={`ca-tab-btn ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            <Package className="ca-tab-icon" />
            الطلبات
          </button>
          <button
            className={`ca-tab-btn ${activeTab === "payments" ? "active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            <CreditCard className="ca-tab-icon" />
            المدفوعات
          </button>
          <button
            className={`ca-tab-btn ${activeTab === "checks" ? "active" : ""}`}
            onClick={() => setActiveTab("checks")}
          >
            <FileText className="ca-tab-icon" />
            الشيكات
          </button>
          <button
            className={`ca-tab-btn ${
              activeTab === "statement" ? "active" : ""
            }`}
            onClick={() => setActiveTab("statement")}
          >
            <BarChart3 className="ca-tab-icon" />
            كشف الحساب
          </button>
        </div>

        {/* Tab Content */}
        <div className="ca-tab-content">
          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div className="orders-tab">
              <div className="ca-tab-header">
                <h2>الطلبات</h2>
                <div className="ca-tab-actions">
                  <button
                    className={`ca-sort-btn ${
                      orderSort.field === "date" ? "active" : ""
                    }`}
                    onClick={() =>
                      setOrderSort({
                        field: "date",
                        order: orderSort.order === "asc" ? "desc" : "asc",
                      })
                    }
                  >
                    ترتيب حسب التاريخ {orderSort.order === "asc" ? "↑" : "↓"}
                  </button>
                  <button
                    className="ca-refresh-btn"
                    onClick={() => fetchCustomerData()}
                    title="تحديث البيانات"
                  >
                    <RefreshCw className="ca-btn-icon" />
                  </button>
                  <button
                    className="ca-add-btn"
                    onClick={() => openAddModal("order")}
                  >
                    <Plus className="ca-btn-icon" />
                    إضافة طلب
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="ca-filters-section">
                <div className="ca-filter-group">
                  <label>الحالة:</label>
                  <select
                    value={orderFilters.status}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        status: e.target.value,
                      })
                    }
                    className="ca-filter-select"
                  >
                    <option value="all">جميع الحالات</option>
                    <option value="pending">في الانتظار</option>
                    <option value="in-progress">قيد التنفيذ</option>
                    <option value="completed">مكتمل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
                <div className="ca-filter-group">
                  <label>من تاريخ:</label>
                  <input
                    type="date"
                    value={orderFilters.dateFrom}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        dateFrom: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
                <div className="ca-filter-group">
                  <label>إلى تاريخ:</label>
                  <input
                    type="date"
                    value={orderFilters.dateTo}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        dateTo: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
              </div>

              {/* Orders Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th>عنوان الطلب</th>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th>عدد العناصر</th>
                      <th>الإجمالي</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ca-no-data">
                          لا توجد طلبات
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr key={order.id} className="ca-data-row">
                          <td>{order.title}</td>
                          <td>{formatDate(order.date)}</td>
                          <td>
                            <div
                              className={`ca-status-badge ${getStatusClass(
                                order.status
                              )}`}
                            >
                              {getStatusIcon(order.status)}
                              {getStatusText(order.status)}
                            </div>
                          </td>
                          <td>{calculateOrderNumberOfItems(order.id)}</td>
                          <td>
                            {formatCurrency(calculateOrderTotal(order.id))}
                          </td>
                          <td>
                            <div className="ca-action-buttons">
                              <button
                                className="ca-action-btn view"
                                title="عرض التفاصيل"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye />
                              </button>
                              <button
                                className="ca-action-btn edit"
                                title="تعديل"
                                onClick={() => openEditOrderModal(order)}
                              >
                                <Edit />
                              </button>
                              <button
                                className="ca-action-btn delete"
                                title="حذف"
                                onClick={() => confirmDeleteOrder(order)}
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === "payments" && (
            <div className="payments-tab">
              <div className="ca-tab-header">
                <h2>المدفوعات</h2>
                <button
                  className="ca-add-btn"
                  onClick={() => openAddModal("payment")}
                >
                  <Plus className="ca-btn-icon" />
                  إضافة دفعة
                </button>
              </div>

              {/* Filters */}
              <div className="ca-filters-section">
                <div className="ca-filter-group">
                  <label>النوع:</label>
                  <select
                    value={paymentFilters.type}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        type: e.target.value,
                      })
                    }
                    className="ca-filter-select"
                  >
                    <option value="all">جميع الأنواع</option>
                    <option value="cash">نقداً</option>
                    <option value="check">شيك</option>
                  </select>
                </div>
                <div className="ca-filter-group">
                  <label>من تاريخ:</label>
                  <input
                    type="date"
                    value={paymentFilters.dateFrom}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        dateFrom: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
                <div className="ca-filter-group">
                  <label>إلى تاريخ:</label>
                  <input
                    type="date"
                    value={paymentFilters.dateTo}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        dateTo: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
              </div>

              {/* Payments Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>المبلغ</th>
                      <th>ملاحظات</th>
                      <th>تفاصيل الشيك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="ca-no-data">
                          لا توجد مدفوعات
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((payment) => (
                        <tr key={payment.id} className="ca-data-row">
                          <td>{formatDate(payment.date)}</td>
                          <td>
                            <div className={`ca-type-badge ${payment.type}`}>
                              {payment.type === "cash" ? "نقداً" : "شيك"}
                            </div>
                          </td>
                          <td>{formatCurrency(payment.amount)}</td>
                          <td>{payment.notes || "-"}</td>
                          <td>
                            {payment.type === "check" ? (
                              <div className="ca-check-details">
                                <span>رقم: {payment.checkNumber}</span>
                                <span>بنك: {payment.checkBank}</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Checks Tab */}
          {activeTab === "checks" && (
            <div className="checks-tab">
              <div className="ca-tab-header">
                <div>
                  <h2>الشيكات</h2>
                  <p
                    style={{
                      margin: "0.5rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "#64748b",
                    }}
                  >
                    الشيكات المضافة كمدفوعات ستظهر هنا تلقائياً
                  </p>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                    }}
                  >
                    إجمالي الشيكات: {customerChecks.length} | المعروضة:{" "}
                    {filteredChecks.length}
                  </p>
                </div>
                <button
                  className="ca-add-btn"
                  onClick={() => openAddModal("check")}
                >
                  <Plus className="ca-btn-icon" />
                  إضافة شيك
                </button>
              </div>

              {/* Filters */}
              <div className="ca-filters-section">
                <div className="ca-filter-group">
                  <label>الحالة:</label>
                  <select
                    value={checkFilters.status}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        status: e.target.value,
                      })
                    }
                    className="ca-filter-select"
                  >
                    <option value="all">جميع الحالات</option>
                    <option value="pending">في الانتظار</option>
                    <option value="collected">تم تحصيله</option>
                    <option value="returned">مرتجع</option>
                  </select>
                </div>
                <button
                  onClick={() =>
                    setCheckFilters({ status: "all", dateFrom: "", dateTo: "" })
                  }
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  مسح الفلاتر
                </button>

                <div className="ca-filter-group">
                  <label>من تاريخ:</label>
                  <input
                    type="date"
                    value={checkFilters.dateFrom}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        dateFrom: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
                <div className="ca-filter-group">
                  <label>إلى تاريخ:</label>
                  <input
                    type="date"
                    value={checkFilters.dateTo}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        dateTo: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
              </div>

              {/* Checks Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th>رقم الشيك</th>
                      <th>البنك</th>
                      <th>المبلغ</th>
                      <th>تاريخ الاستحقاق</th>
                      <th>الحالة</th>
                      <th>ملاحظات</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="ca-no-data">
                          لا توجد شيكات
                        </td>
                      </tr>
                    ) : (
                      filteredChecks.map((check) => (
                        <tr key={check.id} className="ca-data-row">
                          <td>{check.checkNumber}</td>
                          <td>{check.bank}</td>
                          <td>{formatCurrency(check.amount)}</td>
                          <td>{formatDate(check.dueDate)}</td>
                          <td>
                            <div
                              className={`ca-status-badge ${getStatusClass(
                                check.status
                              )}`}
                            >
                              {getStatusIcon(check.status)}
                              {getStatusText(check.status)}
                            </div>
                          </td>
                          <td>{check.notes || "-"}</td>
                          <td>
                            <div className="ca-action-buttons">
                              {check.status === "pending" && (
                                <button
                                  className="ca-action-btn view"
                                  title="تم تحصيله"
                                  onClick={() =>
                                    updateCheckStatus(check.id, "collected")
                                  }
                                >
                                  <CheckCircle />
                                </button>
                              )}
                              {check.status === "pending" && (
                                <button
                                  className="ca-action-btn delete"
                                  title="مرتجع"
                                  onClick={() =>
                                    updateCheckStatus(check.id, "returned")
                                  }
                                >
                                  <XCircle />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Statement Tab */}
          {activeTab === "statement" && (
            <div className="statement-tab">
              <div className="ca-tab-header">
                <h2>كشف الحساب</h2>
                <div className="ca-export-buttons">
                  <button className="ca-export-btn" onClick={printStatement}>
                    <Printer className="ca-btn-icon" />
                    طباعة
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="ca-filters-section">
                <div className="ca-filter-group">
                  <label>من تاريخ:</label>
                  <input
                    type="date"
                    value={statementFilters.dateFrom}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        dateFrom: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
                <div className="ca-filter-group">
                  <label>إلى تاريخ:</label>
                  <input
                    type="date"
                    value={statementFilters.dateTo}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        dateTo: e.target.value,
                      })
                    }
                    className="ca-filter-input"
                  />
                </div>
                <div className="ca-filter-group">
                  <label>نوع القيد:</label>
                  <select
                    value={statementFilters.entryType}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        entryType: e.target.value,
                      })
                    }
                    className="ca-filter-select"
                  >
                    <option value="all">جميع الأنواع</option>
                    <option value="order">طلبات</option>
                    <option value="payment">مدفوعات</option>
                    <option value="check">شيكات</option>
                  </select>
                </div>
              </div>

              {/* Statement Table */}
              <div className="ca-table-container">
                <table className="ca-data-table ca-statement-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>القيد</th>
                      <th>مدين</th>
                      <th>دائن</th>
                      <th>الرصيد الجاري</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStatement.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="ca-no-data">
                          لا توجد معاملات
                        </td>
                      </tr>
                    ) : (
                      filteredStatement.map((entry) => (
                        <tr key={entry.id} className="ca-data-row">
                          <td>{formatDate(entry.date)}</td>
                          <td>{entry.description}</td>
                          <td className={entry.debit > 0 ? "debit" : ""}>
                            {entry.debit > 0
                              ? formatCurrency(entry.debit)
                              : "-"}
                          </td>
                          <td className={entry.credit > 0 ? "credit" : ""}>
                            {entry.credit > 0
                              ? formatCurrency(entry.credit)
                              : "-"}
                          </td>
                          <td
                            className={`ca-running-balance ${
                              entry.runningBalance > 0
                                ? "positive"
                                : entry.runningBalance < 0
                                ? "negative"
                                : "zero"
                            }`}
                          >
                            {formatCurrency(Math.abs(entry.runningBalance))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>
                {modalType === "order" && "إضافة طلب جديد"}
                {modalType === "payment" && "إضافة دفعة جديدة"}
                {modalType === "check" && "إضافة شيك جديد"}
              </h3>
              <button
                className="ca-close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="ca-modal-body">
              {modalType === "order" && (
                <>
                  <div className="ca-form-group">
                    <label>عنوان الطلب *</label>
                    <input
                      type="text"
                      value={orderForm.title}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, title: e.target.value })
                      }
                      placeholder="أدخل عنوان الطلب"
                      className="ca-form-input"
                    />
                  </div>
                  <div className="ca-form-row">
                    <div className="ca-form-group">
                      <label>التاريخ *</label>
                      <input
                        type="date"
                        value={orderForm.date}
                        onChange={(e) =>
                          setOrderForm({ ...orderForm, date: e.target.value })
                        }
                        className="ca-form-input"
                      />
                    </div>
                    <div className="ca-form-group">
                      <label>الحالة *</label>
                      <select
                        value={orderForm.status}
                        onChange={(e) =>
                          setOrderForm({
                            ...orderForm,
                            status: e.target.value as Order["status"],
                          })
                        }
                        className="ca-form-select"
                      >
                        <option value="pending">في الانتظار</option>
                        <option value="in-progress">قيد التنفيذ</option>
                        <option value="completed">مكتمل</option>
                        <option value="cancelled">ملغي</option>
                      </select>
                    </div>
                  </div>

                  <div className="ca-form-group">
                    <label>ملاحظات</label>
                    <textarea
                      value={orderForm.notes}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, notes: e.target.value })
                      }
                      placeholder="أدخل ملاحظات (اختياري)"
                      className="ca-form-textarea"
                      rows={3}
                    />
                  </div>
                  <div className="ca-form-info">
                    <p>
                      سيتم حساب عدد العناصر والإجمالي تلقائياً من عناصر الطلب
                      المضافة في صفحة تفاصيل الطلب
                    </p>
                  </div>
                </>
              )}

              {modalType === "payment" && (
                <>
                  <div className="ca-form-row">
                    <div className="ca-form-group">
                      <label>التاريخ *</label>
                      <input
                        type="date"
                        value={paymentForm.date}
                        onChange={(e) =>
                          setPaymentForm({
                            ...paymentForm,
                            date: e.target.value,
                          })
                        }
                        className="ca-form-input"
                      />
                    </div>
                    <div className="ca-form-group">
                      <label>النوع *</label>
                      <select
                        value={paymentForm.type}
                        onChange={(e) =>
                          setPaymentForm({
                            ...paymentForm,
                            type: e.target.value as Payment["type"],
                          })
                        }
                        className="ca-form-select"
                      >
                        <option value="cash">نقداً</option>
                        <option value="check">شيك</option>
                      </select>
                    </div>
                  </div>
                  <div className="ca-form-group">
                    <label>المبلغ *</label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          amount: parseFloat(e.target.value),
                        })
                      }
                      min="0"
                      step="0.01"
                      className="ca-form-input"
                    />
                  </div>
                  {paymentForm.type === "check" && (
                    <div className="ca-form-row">
                      <div className="ca-form-group">
                        <label>رقم الشيك *</label>
                        <input
                          type="text"
                          value={paymentForm.checkNumber}
                          onChange={(e) =>
                            setPaymentForm({
                              ...paymentForm,
                              checkNumber: e.target.value,
                            })
                          }
                          placeholder="أدخل رقم الشيك"
                          className="ca-form-input"
                        />
                      </div>
                      <div className="ca-form-group">
                        <label>البنك *</label>
                        <input
                          type="text"
                          value={paymentForm.checkBank}
                          onChange={(e) =>
                            setPaymentForm({
                              ...paymentForm,
                              checkBank: e.target.value,
                            })
                          }
                          placeholder="أدخل اسم البنك"
                          className="ca-form-input"
                        />
                      </div>
                    </div>
                  )}
                  <div className="ca-form-group">
                    <label>ملاحظات</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          notes: e.target.value,
                        })
                      }
                      placeholder="أدخل ملاحظات (اختياري)"
                      className="ca-form-textarea"
                      rows={3}
                    />
                  </div>
                  {paymentForm.type === "check" && (
                    <div className="ca-form-info">
                      <p>
                        سيتم إضافة هذا الشيك تلقائياً إلى قائمة الشيكات للمتابعة
                      </p>
                    </div>
                  )}
                </>
              )}

              {modalType === "check" && (
                <>
                  <div className="ca-form-row">
                    <div className="ca-form-group">
                      <label>رقم الشيك *</label>
                      <input
                        type="text"
                        value={checkForm.checkNumber}
                        onChange={(e) =>
                          setCheckForm({
                            ...checkForm,
                            checkNumber: e.target.value,
                          })
                        }
                        placeholder="أدخل رقم الشيك"
                        className="ca-form-input"
                      />
                    </div>
                    <div className="ca-form-group">
                      <label>البنك *</label>
                      <input
                        type="text"
                        value={checkForm.bank}
                        onChange={(e) =>
                          setCheckForm({ ...checkForm, bank: e.target.value })
                        }
                        placeholder="أدخل اسم البنك"
                        className="ca-form-input"
                      />
                    </div>
                  </div>
                  <div className="ca-form-row">
                    <div className="ca-form-group">
                      <label>المبلغ *</label>
                      <input
                        type="number"
                        value={checkForm.amount}
                        onChange={(e) =>
                          setCheckForm({
                            ...checkForm,
                            amount: parseFloat(e.target.value),
                          })
                        }
                        min="0"
                        step="0.01"
                        className="ca-form-input"
                      />
                    </div>
                    <div className="ca-form-group">
                      <label>تاريخ الاستحقاق *</label>
                      <input
                        type="date"
                        value={checkForm.dueDate}
                        onChange={(e) =>
                          setCheckForm({
                            ...checkForm,
                            dueDate: e.target.value,
                          })
                        }
                        className="ca-form-input"
                      />
                    </div>
                  </div>
                  <div className="ca-form-group">
                    <label>الحالة *</label>
                    <select
                      value={checkForm.status}
                      onChange={(e) =>
                        setCheckForm({
                          ...checkForm,
                          status: e.target.value as CustomerCheck["status"],
                        })
                      }
                      className="ca-form-select"
                    >
                      <option value="pending">في الانتظار</option>
                      <option value="collected">تم تحصيله</option>
                      <option value="returned">مرتجع</option>
                    </select>
                  </div>
                  <div className="ca-form-group">
                    <label>ملاحظات</label>
                    <textarea
                      value={checkForm.notes}
                      onChange={(e) =>
                        setCheckForm({ ...checkForm, notes: e.target.value })
                      }
                      placeholder="أدخل ملاحظات (اختياري)"
                      className="ca-form-textarea"
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="ca-modal-footer">
              <button
                className="ca-btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                إلغاء
              </button>
              <button
                className="ca-btn-primary"
                onClick={() => {
                  if (modalType === "order") handleAddOrder();
                  else if (modalType === "payment") handleAddPayment();
                  else if (modalType === "check") handleAddCheck();
                }}
                disabled={
                  (modalType === "order" && !orderForm.title) ||
                  (modalType === "payment" &&
                    (paymentForm.amount <= 0 ||
                      (paymentForm.type === "check" &&
                        (!paymentForm.checkNumber ||
                          !paymentForm.checkBank)))) ||
                  (modalType === "check" &&
                    (!checkForm.checkNumber ||
                      !checkForm.bank ||
                      checkForm.amount <= 0))
                }
              >
                {modalType === "order" && "إضافة الطلب"}
                {modalType === "payment" && "إضافة الدفعة"}
                {modalType === "check" && "إضافة الشيك"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && customer && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>تعديل العميل</h3>
              <button
                className="ca-close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="ca-modal-body">
              <div className="ca-form-group">
                <label>اسم العميل *</label>
                <input
                  type="text"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  placeholder="أدخل اسم العميل"
                  className="ca-form-input"
                />
              </div>
              <div className="ca-form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  placeholder="أدخل رقم الهاتف"
                  className="ca-form-input"
                />
              </div>
              <div className="ca-form-group">
                <label>ملاحظات</label>
                <textarea
                  value={customer.notes}
                  onChange={(e) =>
                    setCustomer({ ...customer, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="ca-form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="ca-modal-footer">
              <button
                className="ca-btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                إلغاء
              </button>
              <button
                className="ca-btn-primary"
                onClick={async () => {
                  try {
                    const customerRef = doc(db, "customers", customer.id);
                    await updateDoc(customerRef, {
                      name: customer.name,
                      phone: customer.phone,
                      notes: customer.notes,
                    });
                    setShowEditModal(false);
                    fetchCustomerData();
                  } catch (error) {
                    console.error("Error updating customer:", error);
                  }
                }}
                disabled={!customer.name || !customer.phone}
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditOrderModal && editingOrder && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>تعديل الطلب</h3>
              <button
                className="ca-close-btn"
                onClick={() => {
                  setShowEditOrderModal(false);
                  setEditingOrder(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="ca-modal-body">
              <div className="ca-form-group">
                <label>عنوان الطلب *</label>
                <input
                  type="text"
                  value={editingOrder.title}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, title: e.target.value })
                  }
                  placeholder="أدخل عنوان الطلب"
                  className="ca-form-input"
                />
              </div>
              <div className="ca-form-row">
                <div className="ca-form-group">
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={editingOrder.date}
                    onChange={(e) =>
                      setEditingOrder({ ...editingOrder, date: e.target.value })
                    }
                    className="ca-form-input"
                  />
                </div>
                <div className="ca-form-group">
                  <label>الحالة *</label>
                  <select
                    value={editingOrder.status}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        status: e.target.value as Order["status"],
                      })
                    }
                    className="ca-form-select"
                  >
                    <option value="pending">في الانتظار</option>
                    <option value="in-progress">قيد التنفيذ</option>
                    <option value="completed">مكتمل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
              </div>
              <div className="ca-form-group">
                <label>ملاحظات</label>
                <textarea
                  value={editingOrder.notes || ""}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="ca-form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="ca-modal-footer">
              <button
                className="ca-btn-secondary"
                onClick={() => {
                  setShowEditOrderModal(false);
                  setEditingOrder(null);
                }}
              >
                إلغاء
              </button>
              <button
                className="ca-btn-primary"
                onClick={handleEditOrder}
                disabled={!editingOrder.title}
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {showDeleteConfirm && orderToDelete && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>تأكيد الحذف</h3>
              <button
                className="ca-close-btn"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setOrderToDelete(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="ca-modal-body">
              <div className="ca-form-group">
                <p
                  style={{
                    textAlign: "center",
                    margin: "1rem 0",
                    color: "#dc2626",
                  }}
                >
                  هل أنت متأكد من حذف الطلب "{orderToDelete.title}"؟
                </p>
                <p
                  style={{
                    textAlign: "center",
                    margin: "1rem 0",
                    fontSize: "0.875rem",
                    color: "#64748b",
                  }}
                >
                  سيتم حذف جميع عناصر الطلب أيضاً. لا يمكن التراجع عن هذا
                  الإجراء.
                </p>
              </div>
            </div>
            <div className="ca-modal-footer">
              <button
                className="ca-btn-secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setOrderToDelete(null);
                }}
              >
                إلغاء
              </button>
              <button
                className="ca-btn-primary"
                onClick={handleDeleteOrder}
                style={{ background: "#dc2626" }}
              >
                حذف الطلب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
