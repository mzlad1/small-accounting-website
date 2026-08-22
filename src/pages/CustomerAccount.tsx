import React, { useState, useEffect, useRef } from "react";
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
  Search,
  Printer,
  ReceiptText,
  SortAsc,
  SortDesc,
} from "lucide-react";

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  query,
  where,
  orderBy,
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { subscribeAll, subscribeDocs } from "../utils/live";
import { ReceiptDialog } from "../components/ReceiptDialog";
import { buildPrintDocument } from "../utils/receiptTemplate";
import {
  buildCheckSeries,
  SeriesInterval,
} from "../utils/checkSeries";
import { matchesSearch } from "../utils/search";

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
  isGrouped?: boolean;
  groupedCount?: number;
  originalPayments?: Payment[];
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
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
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
  // Any-field search across the active tab's rows
  const [searchTerm, setSearchTerm] = useState("");

  // Filtered data states
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [filteredChecks, setFilteredChecks] = useState<CustomerCheck[]>([]);
  const [filteredStatement, setFilteredStatement] = useState<StatementEntry[]>(
    []
  );

  // Paginated data states
  const [paginatedOrders, setPaginatedOrders] = useState<Order[]>([]);
  const [paginatedPayments, setPaginatedPayments] = useState<Payment[]>([]);
  const [paginatedChecks, setPaginatedChecks] = useState<CustomerCheck[]>([]);
  const [paginatedStatement, setPaginatedStatement] = useState<
    StatementEntry[]
  >([]);

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

  // Add-dialog: focus the first field on open, and keep the dialog open after
  // a successful add so several entries can be made in a row. The three add
  // flows (order / payment / check) share one modal element, so they share the
  // ref but each keeps its own inline confirmation flag.
  const addModalRef = useRef<HTMLDivElement | null>(null);
  const [orderAddSuccess, setOrderAddSuccess] = useState(false);
  const [paymentAddSuccess, setPaymentAddSuccess] = useState(false);
  const [checkAddSuccess, setCheckAddSuccess] = useState(false);
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesCount, setSeriesCount] = useState(6);
  const [seriesInterval, setSeriesInterval] = useState<SeriesInterval>("month");
  const [addSuccessCount, setAddSuccessCount] = useState(1);
  const [seriesEntries, setSeriesEntries] = useState<
    Array<{ checkNumber: string; dueDate: string; amount: number }>
  >([]);

  const focusFirst = (ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      ref.current
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select, textarea"
        )
        ?.focus();
    }, 60);
  };

  useEffect(() => {
    if (showAddModal) {
      setOrderAddSuccess(false);
      setPaymentAddSuccess(false);
      setCheckAddSuccess(false);
      setSeriesEnabled(false);
      focusFirst(addModalRef);
    }
  }, [showAddModal, modalType]);

  // Regenerate the editable series whenever the template inputs change
  useEffect(() => {
    if (
      !seriesEnabled ||
      !checkForm.checkNumber ||
      !checkForm.dueDate ||
      !/\d/.test(checkForm.checkNumber)
    ) {
      setSeriesEntries([]);
      return;
    }
    setSeriesEntries(
      buildCheckSeries(
        checkForm.checkNumber,
        checkForm.dueDate,
        seriesCount,
        seriesInterval
      ).map((entry) => ({ ...entry, amount: checkForm.amount }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    seriesEnabled,
    seriesCount,
    seriesInterval,
    checkForm.checkNumber,
    checkForm.dueDate,
    checkForm.amount,
  ]);

  const updateSeriesEntry = (
    index: number,
    field: "checkNumber" | "dueDate" | "amount",
    value: string
  ) => {
    setSeriesEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "amount" ? parseFloat(value) || 0 : value,
            }
          : entry
      )
    );
  };

  const removeSeriesEntry = (index: number) => {
    setSeriesEntries((prev) => prev.filter((_, i) => i !== index));
  };


  // Filters and sorting
  type SortState = { field: string; order: "asc" | "desc" };

  const [orderFilters, setOrderFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [orderSort, setOrderSort] = useState<SortState>({
    field: "date",
    order: "desc",
  });

  const [paymentFilters, setPaymentFilters] = useState({
    type: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [paymentSort, setPaymentSort] = useState<SortState>({
    field: "date",
    order: "desc",
  });

  const [checkFilters, setCheckFilters] = useState({
    status: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [checkSort, setCheckSort] = useState<SortState>({
    field: "dueDate",
    order: "desc",
  });

  // Shared header-sorting helpers for the tab tables: click toggles
  // desc → asc on the same column, any new column starts at desc.
  const toggleSort = (
    setSort: React.Dispatch<React.SetStateAction<SortState>>,
    field: string
  ) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const sortIcon = (sort: SortState, field: string) => {
    if (sort.field !== field) return null;
    return sort.order === "asc" ? (
      <SortAsc size={16} />
    ) : (
      <SortDesc size={16} />
    );
  };

  // Amounts/counts compare numerically; text and raw date strings compare
  // as text (numeric collation keeps check numbers in human order).
  const compareBy = (
    sort: SortState,
    aValue: string | number,
    bValue: string | number
  ) => {
    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), "ar", {
            numeric: true,
          });
    return sort.order === "asc" ? comparison : -comparison;
  };

  const orderSortValue = (order: Order, field: string): string | number => {
    switch (field) {
      case "title":
        return order.title || "";
      case "status":
        return order.status || "";
      case "items":
        return calculateOrderNumberOfItems(order.id);
      case "total":
        return calculateOrderTotal(order.id);
      case "date":
      default:
        return order.date || "";
    }
  };

  const paymentSortValue = (
    payment: Payment,
    field: string
  ): string | number => {
    switch (field) {
      case "type":
        return payment.type || "";
      case "amount":
        return payment.amount || 0;
      case "notes":
        return payment.notes || "";
      case "checkDetails":
        return `${payment.checkNumber || ""} ${payment.checkBank || ""}`.trim();
      case "date":
      default:
        return payment.date || "";
    }
  };

  const checkSortValue = (
    check: CustomerCheck,
    field: string
  ): string | number => {
    switch (field) {
      case "bank":
        return check.bank || "";
      case "amount":
        return check.amount || 0;
      case "status":
        return check.status || "";
      case "notes":
        return check.notes || "";
      case "checkNumber":
        return check.checkNumber || "";
      case "dueDate":
      default:
        return check.dueDate || "";
    }
  };

  const [statementFilters, setStatementFilters] = useState({
    dateFrom: "",
    dateTo: "",
    entryType: "all",
  });

  // Pagination state for each section
  const [ordersPagination, setOrdersPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 0,
  });

  const [paymentsPagination, setPaymentsPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 0,
  });

  const [checksPagination, setChecksPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 0,
  });

  const [statementPagination, setStatementPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 0,
  });

  useEffect(() => {
    if (!customerId) return;

    setLoading(true);

    // Live subscriptions: instant paint from the persistent cache, then the
    // server, then every later change (own writes appear at once). The customer
    // document and the four collections stream in parallel, and loading only
    // clears once BOTH have painted (otherwise the "customer not found" screen
    // would flash before the document arrives).
    let customerPainted = false;
    let collectionsPainted = false;
    const hideLoadingWhenPainted = () => {
      if (customerPainted && collectionsPainted) {
        setLoading(false);
      }
    };

    const unsubscribeCustomer = subscribeDocs(
      [doc(db, "customers", customerId)],
      applyCustomerSnapshot,
      () => {
        customerPainted = true;
        hideLoadingWhenPainted();
      },
      (error) => console.error("Error fetching customer data:", error)
    );

    const unsubscribeCollections = subscribeAll(
      [
        query(
          collection(db, "orders"),
          where("customerId", "==", customerId),
          orderBy("createdAt", "desc")
        ),
        collection(db, "orderItems"),
        query(
          collection(db, "payments"),
          where("customerId", "==", customerId),
          orderBy("createdAt", "desc")
        ),
        query(
          collection(db, "customerChecks"),
          where("customerId", "==", customerId),
          orderBy("createdAt", "desc")
        ),
        query(
          collection(db, "receipts"),
          where("customerId", "==", customerId)
        ),
      ],
      applySnapshots,
      () => {
        collectionsPainted = true;
        hideLoadingWhenPainted();
      },
      (error) => console.error("Error fetching customer data:", error)
    );

    return () => {
      unsubscribeCustomer();
      unsubscribeCollections();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Reset every tab to its first page when the search term changes
  useEffect(() => {
    setOrdersPagination((prev) => ({ ...prev, currentPage: 1 }));
    setPaymentsPagination((prev) => ({ ...prev, currentPage: 1 }));
    setChecksPagination((prev) => ({ ...prev, currentPage: 1 }));
    setStatementPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [searchTerm]);

  // A header-sort change puts that tab back on its first page
  useEffect(() => {
    setOrdersPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [orderSort]);

  useEffect(() => {
    setPaymentsPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [paymentSort]);

  useEffect(() => {
    setChecksPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [checkSort]);

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

    if (searchTerm) {
      filtered = filtered.filter((order) => matchesSearch(order, searchTerm));
    }

    // Header sorting — applied before the pagination slice
    filtered.sort((a, b) =>
      compareBy(
        orderSort,
        orderSortValue(a, orderSort.field),
        orderSortValue(b, orderSort.field)
      )
    );

    setFilteredOrders(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, orderItems, orderFilters, orderSort, searchTerm]);

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

    // Group same-day check payments by customer and date
    const groupedPayments: Payment[] = [];
    const checkPaymentsByDate: { [key: string]: Payment[] } = {};

    // Separate cash payments and check payments
    const cashPayments = filtered.filter((payment) => payment.type === "cash");
    const checkPayments = filtered.filter(
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
          .map((p) => p.checkNumber)
          .join(", ");
        const allBanks = [
          ...new Set(paymentGroup.map((p) => p.checkBank)),
        ].join(", ");

        const groupedPayment: Payment = {
          ...firstPayment,
          amount: totalAmount,
          checkNumber: allCheckNumbers,
          checkBank: allBanks,
          notes: "دفعة شيكات",
          isGrouped: true,
          groupedCount: paymentGroup.length,
          originalPayments: paymentGroup,
        };

        groupedPayments.push(groupedPayment);
      }
    });

    // Combine cash payments and grouped check payments
    const finalPayments = [...cashPayments, ...groupedPayments];

    // Search runs on the grouped rows — the ones actually rendered
    const searchedPayments = searchTerm
      ? finalPayments.filter((payment) => matchesSearch(payment, searchTerm))
      : finalPayments;

    // Header sorting — applied before the pagination slice
    searchedPayments.sort((a, b) =>
      compareBy(
        paymentSort,
        paymentSortValue(a, paymentSort.field),
        paymentSortValue(b, paymentSort.field)
      )
    );

    setFilteredPayments(searchedPayments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, paymentFilters, paymentSort, searchTerm]);

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

    if (searchTerm) {
      filtered = filtered.filter((check) => matchesSearch(check, searchTerm));
    }

    console.log("Final filtered checks:", filtered); // Debug log
    console.log(
      "Original checks count:",
      customerChecks.length,
      "Filtered checks count:",
      filtered.length
    ); // Debug log
    // Header sorting — applied before the pagination slice
    filtered.sort((a, b) =>
      compareBy(
        checkSort,
        checkSortValue(a, checkSort.field),
        checkSortValue(b, checkSort.field)
      )
    );

    setFilteredChecks(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerChecks, checkFilters, checkSort, searchTerm]);

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

    if (searchTerm) {
      filtered = filtered.filter((entry) => matchesSearch(entry, searchTerm));
    }

    setFilteredStatement(filtered);
  }, [statement, statementFilters, searchTerm]);

  // Apply pagination to orders
  useEffect(() => {
    const { paginatedData, totalPages } = applyPagination(
      filteredOrders,
      ordersPagination.currentPage,
      ordersPagination.itemsPerPage
    );
    setPaginatedOrders(paginatedData);
    setOrdersPagination((prev) => ({ ...prev, totalPages }));
  }, [
    filteredOrders,
    ordersPagination.currentPage,
    ordersPagination.itemsPerPage,
  ]);

  // Apply pagination to payments
  useEffect(() => {
    const { paginatedData, totalPages } = applyPagination(
      filteredPayments,
      paymentsPagination.currentPage,
      paymentsPagination.itemsPerPage
    );
    setPaginatedPayments(paginatedData);
    setPaymentsPagination((prev) => ({ ...prev, totalPages }));
  }, [
    filteredPayments,
    paymentsPagination.currentPage,
    paymentsPagination.itemsPerPage,
  ]);

  // Apply pagination to checks
  useEffect(() => {
    const { paginatedData, totalPages } = applyPagination(
      filteredChecks,
      checksPagination.currentPage,
      checksPagination.itemsPerPage
    );
    setPaginatedChecks(paginatedData);
    setChecksPagination((prev) => ({ ...prev, totalPages }));
  }, [
    filteredChecks,
    checksPagination.currentPage,
    checksPagination.itemsPerPage,
  ]);

  // Apply pagination to statement
  useEffect(() => {
    const { paginatedData, totalPages } = applyPagination(
      filteredStatement,
      statementPagination.currentPage,
      statementPagination.itemsPerPage
    );
    setPaginatedStatement(paginatedData);
    setStatementPagination((prev) => ({ ...prev, totalPages }));
  }, [
    filteredStatement,
    statementPagination.currentPage,
    statementPagination.itemsPerPage,
  ]);

  const applyCustomerSnapshot = (
    snapshots: Array<DocumentSnapshot<DocumentData>>
  ) => {
    const [customerSnap] = snapshots;

    if (customerSnap.exists()) {
      const customerData = {
        id: customerSnap.id,
        ...customerSnap.data(),
      } as Customer;
      setCustomer(customerData);
    }
  };

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [
      ordersSnapshot,
      orderItemsSnapshot,
      paymentsSnapshot,
      checksSnapshot,
      receiptsSnapshot,
    ] = snapshots;

    const receiptsData: any[] = [];
    receiptsSnapshot.forEach((d) => {
      receiptsData.push({ id: d.id, ...d.data() });
    });
    receiptsData.sort((a, b) => (b.receiptNumber || 0) - (a.receiptNumber || 0));
    setCustomerReceipts(receiptsData);

    const ordersData: Order[] = [];
    ordersSnapshot.forEach((doc) => {
      ordersData.push({ id: doc.id, ...doc.data() } as Order);
    });
    setOrders(ordersData);

    // Group this customer's order items by orderId in memory
    // (replaces the per-order query loop — one read instead of N)
    const orderItemsData: { [orderId: string]: any[] } = {};
    for (const order of ordersData) {
      orderItemsData[order.id] = [];
    }
    orderItemsSnapshot.forEach((doc) => {
      const item = { id: doc.id, ...doc.data() } as any;
      if (orderItemsData[item.orderId]) {
        orderItemsData[item.orderId].push(item);
      }
    });
    setOrderItems(orderItemsData);

    const paymentsData: Payment[] = [];
    paymentsSnapshot.forEach((doc) => {
      paymentsData.push({ id: doc.id, ...doc.data() } as Payment);
    });
    setPayments(paymentsData);

    const checksData: CustomerCheck[] = [];
    checksSnapshot.forEach((doc) => {
      const checkData = { id: doc.id, ...doc.data() } as CustomerCheck;

      checksData.push(checkData);
    });

    setCustomerChecks(checksData);

    // Generate statement
    generateStatement(ordersData, paymentsData, checksData, orderItemsData);
  };

  const generateStatement = (
    ordersData: Order[],
    paymentsData: Payment[],
    checksData: CustomerCheck[],
    orderItemsData: { [orderId: string]: any[] }
  ) => {
    const entries: StatementEntry[] = [];

    // Add orders (debits)
    ordersData.forEach((order) => {
      const items = orderItemsData[order.id] || [];
      const orderTotal = items.reduce(
        (sum, item) => sum + (item.total || 0),
        0
      );
      entries.push({
        id: `order-${order.id}`,
        date: order.date,
        type: "order",
        description: `طلبية: ${order.title}`,
        debit: orderTotal,
        credit: 0,
        runningBalance: 0, // Will be calculated after sorting
      });
    });

    // Add payments (credits) - this includes both cash payments and check payments
    paymentsData.forEach((payment) => {
      entries.push({
        id: `payment-${payment.id}`,
        date: payment.date,
        type: "payment",
        description: `دفعة: ${
          payment.type === "check" ? `شيك ${payment.checkNumber}` : "نقداً"
        }`,
        debit: 0,
        credit: payment.amount,
        runningBalance: 0, // Will be calculated after sorting
      });
    });

    // Add only pending checks (not collected ones, as they're already included as payments)
    checksData.forEach((check) => {
      if (check.status === "pending") {
        // Pending checks don't affect the running balance, they're just for reference
        entries.push({
          id: `check-${check.id}`,
          date: check.dueDate,
          type: "check",
          description: `شيك معلق: ${check.checkNumber} - ${check.bank}`,
          debit: 0,
          credit: 0,
          runningBalance: 0, // Will be calculated after sorting
        });
      }
    });

    // Sort by date first
    entries.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Now calculate running balance in chronological order
    let runningBalance = 0;
    entries.forEach((entry) => {
      if (entry.type === "order") {
        runningBalance += entry.debit;
      } else if (entry.type === "payment") {
        runningBalance -= entry.credit;
      }
      // Pending checks don't affect the balance
      entry.runningBalance = runningBalance;
    });

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
      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setOrderForm({
        title: "",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        notes: "",
      });
      setOrderAddSuccess(true);
      focusFirst(addModalRef);
      setTimeout(() => setOrderAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
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

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setPaymentForm({
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        amount: 0,
        notes: "",
        checkNumber: "",
        checkBank: "",
      });
      setPaymentAddSuccess(true);
      focusFirst(addModalRef);
      setTimeout(() => setPaymentAddSuccess(false), 2500);

      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error adding payment:", error);
    }
  };

  const handleAddCheck = async () => {
    try {
      // Series mode: create every check in ONE atomic batch
      if (seriesEnabled && seriesEntries.length >= 2) {
        if (
          seriesEntries.some((entry) => !entry.checkNumber || !entry.dueDate)
        ) {
          alert("أكمل رقم وتاريخ كل شيك في السلسلة");
          return;
        }
        const entries = seriesEntries;
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();

        entries.forEach((entry) => {
          const checkRef = doc(collection(db, "customerChecks"));
          batch.set(checkRef, {
            ...checkForm,
            checkNumber: entry.checkNumber,
            dueDate: entry.dueDate,
            amount: entry.amount,
            customerId: customerId!,
            customerName: customer?.name || "",
            createdAt: nowIso,
          });
        });

        await batch.commit();

        setCheckForm({
          checkNumber: "",
          bank: "",
          amount: 0,
          dueDate: new Date().toISOString().split("T")[0],
          status: "pending",
          notes: "",
        });
        setSeriesEnabled(false);
        setAddSuccessCount(entries.length);
        setCheckAddSuccess(true);
        focusFirst(addModalRef);
        setTimeout(() => setCheckAddSuccess(false), 2500);
        return;
      }

      const newCheck = {
        ...checkForm,
        customerId: customerId!,
        customerName: customer?.name || "",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "customerChecks"), newCheck);
      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setCheckForm({
        checkNumber: "",
        bank: "",
        amount: 0,
        dueDate: new Date().toISOString().split("T")[0],
        status: "pending",
        notes: "",
      });
      setAddSuccessCount(1);
      setCheckAddSuccess(true);
      focusFirst(addModalRef);
      setTimeout(() => setCheckAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
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
      // The live subscription picks up the change automatically.
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
      // The live subscription picks up the change automatically.
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
      // The live subscription picks up the change automatically.
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
    return new Date(dateString).toLocaleDateString("en-GB");
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

  const printPayments = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        // Use the same grouped payments as displayed in the table
        const allPayments = [...filteredPayments];

        // Apply the same filters as the display
        let filteredPaymentsForPrint = allPayments;

        if (paymentFilters.type !== "all") {
          filteredPaymentsForPrint = filteredPaymentsForPrint.filter(
            (payment) => payment.type === paymentFilters.type
          );
        }

        if (paymentFilters.dateFrom) {
          filteredPaymentsForPrint = filteredPaymentsForPrint.filter(
            (payment) =>
              new Date(payment.date) >= new Date(paymentFilters.dateFrom)
          );
        }

        if (paymentFilters.dateTo) {
          filteredPaymentsForPrint = filteredPaymentsForPrint.filter(
            (payment) =>
              new Date(payment.date) <= new Date(paymentFilters.dateTo)
          );
        }

        // Sort by date
        filteredPaymentsForPrint.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>المدفوعات - ${customer?.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; }
              .customer-info { margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .summary { margin-top: 20px; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>المدفوعات</h1>
            </div>
            <div class="customer-info">
              <p><strong>العميل:</strong> ${customer?.name}</p>
              <p><strong>الهاتف:</strong> ${customer?.phone}</p>
              <p><strong>التاريخ:</strong> ${new Date().toLocaleDateString("en-GB")}</p>
            </div>
            <table>
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
                ${filteredPaymentsForPrint
                  .map(
                    (payment) => `
                  <tr>
                    <td>${formatDate(payment.date)}</td>
                    <td>${payment.type === "cash" ? "نقداً" : "شيك"}</td>
                    <td>${formatCurrency(payment.amount)}</td>
                    <td>${payment.notes || "-"}</td>
                    <td>${
                      payment.type === "check"
                        ? `رقم: ${payment.checkNumber}, بنك: ${
                            payment.checkBank
                          }${
                            payment.isGrouped
                              ? ` (${payment.groupedCount} شيك)`
                              : ""
                          }`
                        : "-"
                    }</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <p><strong>إجمالي المدفوعات:</strong> ${formatCurrency(
                filteredPaymentsForPrint.reduce(
                  (sum, payment) => sum + payment.amount,
                  0
                )
              )}</p>
              <p><strong>عدد المدفوعات:</strong> ${
                filteredPaymentsForPrint.length
              }</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing payments:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
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
                th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
                th { background-color: #f0eae0; font-weight: bold; }
                .debit { color: #b23b2e; }
                .credit { color: #4a7c59; }
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
                <p><strong>التاريخ:</strong> ${new Date().toLocaleDateString("en-GB")}</p>
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
  // Formula: Total Orders - Total Payments
  // Positive = Customer owes us, Negative = We owe customer
  const calculateCurrentBalance = () => {
    const totalOrders = orders.reduce(
      (sum, order) => sum + calculateOrderTotal(order.id),
      0
    );
    const totalPayments = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    return totalOrders - totalPayments;
  };

  // Pagination helper functions
  const applyPagination = (
    data: any[],
    currentPage: number,
    itemsPerPage: number
  ) => {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = data.slice(startIndex, endIndex);

    return { paginatedData, totalPages };
  };

  const handlePageChange = (
    page: number,
    section: "orders" | "payments" | "checks" | "statement"
  ) => {
    switch (section) {
      case "orders":
        setOrdersPagination((prev) => ({ ...prev, currentPage: page }));
        break;
      case "payments":
        setPaymentsPagination((prev) => ({ ...prev, currentPage: page }));
        break;
      case "checks":
        setChecksPagination((prev) => ({ ...prev, currentPage: page }));
        break;
      case "statement":
        setStatementPagination((prev) => ({ ...prev, currentPage: page }));
        break;
    }
  };

  const handleItemsPerPageChange = (
    newItemsPerPage: number,
    section: "orders" | "payments" | "checks" | "statement"
  ) => {
    switch (section) {
      case "orders":
        setOrdersPagination((prev) => ({
          ...prev,
          itemsPerPage: newItemsPerPage,
          currentPage: 1,
        }));
        break;
      case "payments":
        setPaymentsPagination((prev) => ({
          ...prev,
          itemsPerPage: newItemsPerPage,
          currentPage: 1,
        }));
        break;
      case "checks":
        setChecksPagination((prev) => ({
          ...prev,
          itemsPerPage: newItemsPerPage,
          currentPage: 1,
        }));
        break;
      case "statement":
        setStatementPagination((prev) => ({
          ...prev,
          itemsPerPage: newItemsPerPage,
          currentPage: 1,
        }));
        break;
    }
  };

  const getPageNumbers = (currentPage: number, totalPages: number) => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  // Reusable pagination component
  const PaginationControls = ({
    section,
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
  }: {
    section: "orders" | "payments" | "checks" | "statement";
    currentPage: number;
    totalPages: number;
    itemsPerPage: number;
    totalItems: number;
  }) => {
    if (totalItems === 0) return null;

    return (
      <div className="ca-pagination-container">
        <div className="ca-pagination-info">
          <span>
            عرض {(currentPage - 1) * itemsPerPage + 1} إلى{" "}
            {Math.min(currentPage * itemsPerPage, totalItems)} من {totalItems}{" "}
            {section === "orders"
              ? "طلب"
              : section === "payments"
              ? "دفعة"
              : section === "checks"
              ? "شيك"
              : "قيد"}
          </span>
          <div className="ca-items-per-page">
            <label>عدد العناصر في الصفحة:</label>
            <select
              value={itemsPerPage}
              onChange={(e) =>
                handleItemsPerPageChange(Number(e.target.value), section)
              }
              className="ca-pagination-select"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="ca-pagination-controls">
          <button
            className="ca-pagination-btn"
            onClick={() => handlePageChange(1, section)}
            disabled={currentPage === 1}
          >
            الأولى
          </button>
          <button
            className="ca-pagination-btn"
            onClick={() => handlePageChange(currentPage - 1, section)}
            disabled={currentPage === 1}
          >
            السابقة
          </button>

          {getPageNumbers(currentPage, totalPages).map((page) => (
            <button
              key={page}
              className={`ca-pagination-btn ${
                currentPage === page ? "active" : ""
              }`}
              onClick={() => handlePageChange(page, section)}
            >
              {page}
            </button>
          ))}

          <button
            className="ca-pagination-btn"
            onClick={() => handlePageChange(currentPage + 1, section)}
            disabled={currentPage === totalPages}
          >
            التالية
          </button>
          <button
            className="ca-pagination-btn"
            onClick={() => handlePageChange(totalPages, section)}
            disabled={currentPage === totalPages}
          >
            الأخيرة
          </button>
        </div>
      </div>
    );
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
              activeTab === "receipts" ? "active" : ""
            }`}
            onClick={() => setActiveTab("receipts")}
          >
            <ReceiptText className="ca-tab-icon" />
            سندات القبض
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
                  {/* The live subscription picks up the change automatically. */}
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
              <div className="filters-bar">
                <div className="filter-field filter-field-search">
                  <label>بحث</label>
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-field">
                  <label>الحالة</label>
                  <select
                    value={orderFilters.status}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="all">جميع الحالات</option>
                    <option value="pending">في الانتظار</option>
                    <option value="in-progress">قيد التنفيذ</option>
                    <option value="completed">مكتمل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label>من تاريخ</label>
                  <input
                    type="date"
                    value={orderFilters.dateFrom}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        dateFrom: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="filter-field">
                  <label>إلى تاريخ</label>
                  <input
                    type="date"
                    value={orderFilters.dateTo}
                    onChange={(e) =>
                      setOrderFilters({
                        ...orderFilters,
                        dateTo: e.target.value,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="filters-clear-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setOrderFilters({
                      status: "all",
                      dateFrom: "",
                      dateTo: "",
                    });
                  }}
                >
                  مسح الفلاتر
                </button>
              </div>

              {/* Orders Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setOrderSort, "title")}
                      >
                        عنوان الطلب {sortIcon(orderSort, "title")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setOrderSort, "date")}
                      >
                        التاريخ {sortIcon(orderSort, "date")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setOrderSort, "status")}
                      >
                        الحالة {sortIcon(orderSort, "status")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setOrderSort, "items")}
                      >
                        عدد العناصر {sortIcon(orderSort, "items")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setOrderSort, "total")}
                      >
                        الإجمالي {sortIcon(orderSort, "total")}
                      </th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ca-no-data">
                          لا توجد طلبات
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="ca-data-row row-clickable"
                          onClick={(e) => {
                            if (
                              (e.target as HTMLElement).closest(
                                "button, a, input, select"
                              )
                            )
                              return;
                            navigate(`/orders/${order.id}`);
                          }}
                        >
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

              {/* Orders Pagination */}
              <PaginationControls
                section="orders"
                currentPage={ordersPagination.currentPage}
                totalPages={ordersPagination.totalPages}
                itemsPerPage={ordersPagination.itemsPerPage}
                totalItems={filteredOrders.length}
              />
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === "payments" && (
            <div className="payments-tab">
              <div className="ca-tab-header">
                <h2>المدفوعات</h2>
                <div className="ca-tab-actions">
                  <button className="ca-export-btn" onClick={printPayments}>
                    <Printer className="ca-btn-icon" />
                    طباعة
                  </button>
                  <button
                    className="ca-add-btn"
                    onClick={() => openAddModal("payment")}
                  >
                    <Plus className="ca-btn-icon" />
                    إضافة دفعة
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="filters-bar">
                <div className="filter-field filter-field-search">
                  <label>بحث</label>
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-field">
                  <label>النوع</label>
                  <select
                    value={paymentFilters.type}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        type: e.target.value,
                      })
                    }
                  >
                    <option value="all">جميع الأنواع</option>
                    <option value="cash">نقداً</option>
                    <option value="check">شيك</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label>من تاريخ</label>
                  <input
                    type="date"
                    value={paymentFilters.dateFrom}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        dateFrom: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="filter-field">
                  <label>إلى تاريخ</label>
                  <input
                    type="date"
                    value={paymentFilters.dateTo}
                    onChange={(e) =>
                      setPaymentFilters({
                        ...paymentFilters,
                        dateTo: e.target.value,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="filters-clear-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setPaymentFilters({
                      type: "all",
                      dateFrom: "",
                      dateTo: "",
                    });
                  }}
                >
                  مسح الفلاتر
                </button>
              </div>

              {/* Payments Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setPaymentSort, "date")}
                      >
                        التاريخ {sortIcon(paymentSort, "date")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setPaymentSort, "type")}
                      >
                        النوع {sortIcon(paymentSort, "type")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setPaymentSort, "amount")}
                      >
                        المبلغ {sortIcon(paymentSort, "amount")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setPaymentSort, "notes")}
                      >
                        ملاحظات {sortIcon(paymentSort, "notes")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() =>
                          toggleSort(setPaymentSort, "checkDetails")
                        }
                      >
                        تفاصيل الشيك {sortIcon(paymentSort, "checkDetails")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="ca-no-data">
                          لا توجد مدفوعات
                        </td>
                      </tr>
                    ) : (
                      paginatedPayments.map((payment) => (
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
                                {payment.isGrouped && (
                                  <span className="ca-grouped-indicator">
                                    ({payment.groupedCount} شيك)
                                  </span>
                                )}
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

              {/* Payments Pagination */}
              <PaginationControls
                section="payments"
                currentPage={paymentsPagination.currentPage}
                totalPages={paymentsPagination.totalPages}
                itemsPerPage={paymentsPagination.itemsPerPage}
                totalItems={filteredPayments.length}
              />
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
                      color: "#6f6459",
                    }}
                  >
                    الشيكات المضافة كمدفوعات ستظهر هنا تلقائياً
                  </p>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.75rem",
                      color: "#a09384",
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
              <div className="filters-bar">
                <div className="filter-field filter-field-search">
                  <label>بحث</label>
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-field">
                  <label>الحالة</label>
                  <select
                    value={checkFilters.status}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="all">جميع الحالات</option>
                    <option value="pending">في الانتظار</option>
                    <option value="collected">تم تحصيله</option>
                    <option value="returned">مرتجع</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label>من تاريخ</label>
                  <input
                    type="date"
                    value={checkFilters.dateFrom}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        dateFrom: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="filter-field">
                  <label>إلى تاريخ</label>
                  <input
                    type="date"
                    value={checkFilters.dateTo}
                    onChange={(e) =>
                      setCheckFilters({
                        ...checkFilters,
                        dateTo: e.target.value,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="filters-clear-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setCheckFilters({
                      status: "all",
                      dateFrom: "",
                      dateTo: "",
                    });
                  }}
                >
                  مسح الفلاتر
                </button>
              </div>

              {/* Checks Table */}
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "checkNumber")}
                      >
                        رقم الشيك {sortIcon(checkSort, "checkNumber")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "bank")}
                      >
                        البنك {sortIcon(checkSort, "bank")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "amount")}
                      >
                        المبلغ {sortIcon(checkSort, "amount")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "dueDate")}
                      >
                        تاريخ الاستحقاق {sortIcon(checkSort, "dueDate")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "status")}
                      >
                        الحالة {sortIcon(checkSort, "status")}
                      </th>
                      <th
                        className="th-sortable"
                        onClick={() => toggleSort(setCheckSort, "notes")}
                      >
                        ملاحظات {sortIcon(checkSort, "notes")}
                      </th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedChecks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="ca-no-data">
                          لا توجد شيكات
                        </td>
                      </tr>
                    ) : (
                      paginatedChecks.map((check) => (
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

              {/* Checks Pagination */}
              <PaginationControls
                section="checks"
                currentPage={checksPagination.currentPage}
                totalPages={checksPagination.totalPages}
                itemsPerPage={checksPagination.itemsPerPage}
                totalItems={filteredChecks.length}
              />
            </div>
          )}

          {/* Statement Tab */}
          {activeTab === "receipts" && (
            <div className="ca-tab-panel">
              <div className="ca-tab-header">
                <h2>سندات القبض</h2>
                <button
                  className="ca-btn-primary"
                  onClick={() => setShowReceiptDialog(true)}
                >
                  <ReceiptText size={16} />
                  سند قبض جديد
                </button>
              </div>
              <div className="ca-table-container">
                <table className="ca-data-table">
                  <thead>
                    <tr>
                      <th>رقم السند</th>
                      <th>المبلغ</th>
                      <th>البيان</th>
                      <th>التاريخ</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerReceipts.filter((r) =>
                      matchesSearch(r, searchTerm)
                    ).length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center" }}>
                          لا توجد سندات قبض
                        </td>
                      </tr>
                    ) : (
                      customerReceipts
                        .filter((r) => matchesSearch(r, searchTerm))
                        .map((receipt) => (
                          <tr key={receipt.id}>
                            <td>#{receipt.receiptNumber}</td>
                            <td>₪{(receipt.amount || 0).toLocaleString()}</td>
                            <td>{receipt.values?.["البيان"] || "—"}</td>
                            <td>
                              {receipt.date
                                ? new Date(receipt.date).toLocaleDateString(
                                    "en-GB"
                                  )
                                : "—"}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "0.25rem" }}>
                                <button
                                  className="ca-action-btn"
                                  title="عرض"
                                  onClick={() => {
                                    const w = window.open("", "_blank");
                                    if (!w) return;
                                    w.document.write(
                                      buildPrintDocument(receipt.renderedHtml)
                                    );
                                    w.document.close();
                                  }}
                                >
                                  <Eye />
                                </button>
                                <button
                                  className="ca-action-btn"
                                  title="طباعة"
                                  onClick={() => {
                                    const w = window.open("", "_blank");
                                    if (!w) return;
                                    w.document.write(
                                      buildPrintDocument(receipt.renderedHtml)
                                    );
                                    w.document.close();
                                    w.focus();
                                    setTimeout(() => w.print(), 300);
                                  }}
                                >
                                  <Printer />
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
              <div className="filters-bar">
                <div className="filter-field filter-field-search">
                  <label>بحث</label>
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input
                      type="text"
                      className="search-input"
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-field">
                  <label>من تاريخ</label>
                  <input
                    type="date"
                    value={statementFilters.dateFrom}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        dateFrom: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="filter-field">
                  <label>إلى تاريخ</label>
                  <input
                    type="date"
                    value={statementFilters.dateTo}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        dateTo: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="filter-field">
                  <label>نوع القيد</label>
                  <select
                    value={statementFilters.entryType}
                    onChange={(e) =>
                      setStatementFilters({
                        ...statementFilters,
                        entryType: e.target.value,
                      })
                    }
                  >
                    <option value="all">جميع الأنواع</option>
                    <option value="order">طلبات</option>
                    <option value="payment">مدفوعات</option>
                    <option value="check">شيكات</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="filters-clear-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setStatementFilters({
                      dateFrom: "",
                      dateTo: "",
                      entryType: "all",
                    });
                  }}
                >
                  مسح الفلاتر
                </button>
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
                    {paginatedStatement.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="ca-no-data">
                          لا توجد معاملات
                        </td>
                      </tr>
                    ) : (
                      paginatedStatement.map((entry) => (
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

              {/* Statement Pagination */}
              <PaginationControls
                section="statement"
                currentPage={statementPagination.currentPage}
                totalPages={statementPagination.totalPages}
                itemsPerPage={statementPagination.itemsPerPage}
                totalItems={filteredStatement.length}
              />
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal" ref={addModalRef}>
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
                  {orderAddSuccess && (
                    <div className="modal-success-banner">
                      <CheckCircle />
                      تمت الإضافة بنجاح
                    </div>
                  )}
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
                  {paymentAddSuccess && (
                    <div className="modal-success-banner">
                      <CheckCircle />
                      تمت الإضافة بنجاح
                    </div>
                  )}
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
                  {checkAddSuccess && (
                    <div className="modal-success-banner">
                      <CheckCircle />
                      {addSuccessCount > 1
                        ? `تمت إضافة ${addSuccessCount} شيكات بنجاح`
                        : "تمت الإضافة بنجاح"}
                    </div>
                  )}
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

                  <div className="series-panel">
                    <label className="series-toggle">
                      <input
                        type="checkbox"
                        checked={seriesEnabled}
                        onChange={(e) => setSeriesEnabled(e.target.checked)}
                      />
                      <span>
                        إضافة سلسلة شيكات (نفس البيانات بأرقام وتواريخ متتالية)
                      </span>
                    </label>
                    {seriesEnabled && (
                      <>
                        <div className="series-fields">
                          <div className="form-group">
                            <label>عدد الشيكات</label>
                            <input
                              type="number"
                              min={2}
                              max={60}
                              className="ca-form-input"
                              value={seriesCount}
                              onChange={(e) =>
                                setSeriesCount(
                                  Math.max(
                                    2,
                                    Math.min(60, parseInt(e.target.value) || 2)
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>الفترة بين الشيكات</label>
                            <select
                              className="ca-form-input"
                              value={seriesInterval}
                              onChange={(e) =>
                                setSeriesInterval(
                                  e.target.value as SeriesInterval
                                )
                              }
                            >
                              <option value="month">شهر</option>
                              <option value="two-weeks">أسبوعان</option>
                              <option value="week">أسبوع</option>
                            </select>
                          </div>
                        </div>
                        {checkForm.checkNumber &&
                          !/\d/.test(checkForm.checkNumber) && (
                            <p className="series-warning">
                              رقم الشيك يجب أن يحتوي على أرقام حتى يتم توليد
                              أرقام السلسلة تلقائياً
                            </p>
                          )}
                        {seriesEntries.length > 0 && (
                          <div className="series-preview">
                            <div className="series-preview-row series-preview-head">
                              <span className="series-preview-index">#</span>
                              <span className="series-preview-number">
                                رقم الشيك
                              </span>
                              <span className="series-preview-date">
                                التاريخ
                              </span>
                              <span className="series-preview-amount">
                                المبلغ
                              </span>
                              <span className="series-remove-spacer" />
                            </div>
                            {seriesEntries.map((entry, i) => (
                              <div key={i} className="series-preview-row">
                                <span className="series-preview-index">
                                  {i + 1}.
                                </span>
                                <input
                                  type="text"
                                  className="series-input series-input-number"
                                  value={entry.checkNumber}
                                  onChange={(e) =>
                                    updateSeriesEntry(
                                      i,
                                      "checkNumber",
                                      e.target.value
                                    )
                                  }
                                />
                                <input
                                  type="date"
                                  className="series-input series-input-date"
                                  value={entry.dueDate}
                                  onChange={(e) =>
                                    updateSeriesEntry(
                                      i,
                                      "dueDate",
                                      e.target.value
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  className="series-input series-input-amount"
                                  value={entry.amount}
                                  onChange={(e) =>
                                    updateSeriesEntry(
                                      i,
                                      "amount",
                                      e.target.value
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  className="series-remove-btn"
                                  onClick={() => removeSeriesEntry(i)}
                                  title="إزالة هذا الشيك"
                                  disabled={seriesEntries.length <= 2}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <div className="series-preview-row series-preview-foot">
                              <span>{seriesEntries.length} شيكات</span>
                              <span className="series-total">
                                المجموع:{" "}
                                {seriesEntries
                                  .reduce((sum, e) => sum + (e.amount || 0), 0)
                                  .toLocaleString()}
                              </span>
                            </div>
                            {new Set(seriesEntries.map((e) => e.checkNumber))
                              .size !== seriesEntries.length && (
                              <p className="series-warning">
                                تنبيه: هناك أرقام شيكات مكررة في السلسلة
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
                    // The live subscription picks up the change automatically.
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
                    color: "#b23b2e",
                  }}
                >
                  هل أنت متأكد من حذف الطلب "{orderToDelete.title}"؟
                </p>
                <p
                  style={{
                    textAlign: "center",
                    margin: "1rem 0",
                    fontSize: "0.875rem",
                    color: "#6f6459",
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
                style={{ background: "#b23b2e" }}
              >
                حذف الطلب
              </button>
            </div>
          </div>
        </div>
      )}
      {showReceiptDialog && customer && (
        <ReceiptDialog
          customers={[{ id: customerId!, name: customer.name }]}
          initialCustomerId={customerId!}
          onClose={() => setShowReceiptDialog(false)}
        />
      )}
    </div>
  );
}
