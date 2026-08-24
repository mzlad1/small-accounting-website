import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Phone,
  User,
  DollarSign,
  Calendar,
  Package,
  SortAsc,
  SortDesc,
  Printer,
  CheckCircle,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  query,
  where,
  orderBy,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { Pagination } from "../components/Pagination";
import {
  FiltersBar,
  SearchField,
  SelectField,
  SortControl,
} from "../components/Filters";

import "./Customers.css";

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

export function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    notes: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several customers can be entered in a row.
  const addModalRef = useRef<HTMLDivElement | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const focusFirstField = () => {
    setTimeout(() => {
      addModalRef.current
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select, textarea"
        )
        ?.focus();
    }, 60);
  };

  useEffect(() => {
    if (showAddModal) {
      setAddSuccess(false);
      focusFirstField();
    }
  }, [showAddModal]);

  // State for order items
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );

  // Helper function to calculate order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  // Fetch customers and related data from Firebase
  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        query(collection(db, "customers"), orderBy("createdAt", "desc")),
        collection(db, "orders"),
        collection(db, "orderItems"),
        collection(db, "payments"),
        collection(db, "customerChecks"),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching customers data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...customers];

    // Apply search filter (any field)
    if (searchTerm) {
      filtered = filtered.filter((customer) =>
        matchesSearch(customer, searchTerm)
      );
    }

    // Apply balance filter
    if (balanceFilter !== "all") {
      switch (balanceFilter) {
        case "positive":
          filtered = filtered.filter((customer) => customer.currentBalance > 0);
          break;
        case "negative":
          filtered = filtered.filter((customer) => customer.currentBalance < 0);
          break;
        case "zero":
          filtered = filtered.filter(
            (customer) => customer.currentBalance === 0
          );
          break;
      }
    }

    // Apply sorting (always before the pagination slice further down)
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "phone":
          // Phone numbers read as strings but compare naturally as numbers
          comparison = (a.phone || "").localeCompare(b.phone || "", "ar", {
            numeric: true,
          });
          break;
        case "numberOfOrders":
          comparison = a.numberOfOrders - b.numberOfOrders;
          break;
        case "balance":
          comparison = a.currentBalance - b.currentBalance;
          break;
        case "lastActivity": {
          // Dates compare on their raw ISO value, not the display text
          const aTime = new Date(a.lastActivity).getTime();
          const bTime = new Date(b.lastActivity).getTime();
          comparison =
            (Number.isNaN(aTime) ? 0 : aTime) -
            (Number.isNaN(bTime) ? 0 : bTime);
          break;
        }
        case "name":
        default:
          comparison = (a.name || "").localeCompare(b.name || "", "ar");
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    setFilteredCustomers(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [customers, searchTerm, balanceFilter, sortBy, sortOrder]);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [
      customersSnapshot,
      ordersSnapshot,
      orderItemsSnapshot,
      paymentsSnapshot,
      customerChecksSnapshot,
    ] = snapshots;

    // Group all order items by orderId in memory
    // (replaces the per-order query loop — one read instead of N)
    const orderItemsData: { [orderId: string]: any[] } = {};
    ordersSnapshot.forEach((orderDoc) => {
      orderItemsData[orderDoc.id] = [];
    });
    orderItemsSnapshot.forEach((doc) => {
      const item = { id: doc.id, ...doc.data() } as any;
      if (orderItemsData[item.orderId]) {
        orderItemsData[item.orderId].push(item);
      }
    });
    setOrderItems(orderItemsData);

    // Process orders data
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

    // Process payments data
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

    // Process customer checks data
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

    // Process customers with calculated data
    const customersData: Customer[] = [];
    customersSnapshot.forEach((doc) => {
      const customerData = doc.data();
      const customerId = doc.id;

      // Get customer orders
      const customerOrders = ordersData.filter(
        (order) => order.customerId === customerId
      );

      // Get customer payments
      const customerPayments = paymentsData.filter(
        (payment) => payment.customerId === customerId
      );

      // Get customer checks
      const customerChecks = customerChecksData.filter(
        (check) => check.customerId === customerId
      );

      // Calculate numberOfOrders
      const numberOfOrders = customerOrders.length;

      // Calculate currentBalance using orderItemsData directly
      const totalOrders = customerOrders.reduce((sum, order) => {
        const items = orderItemsData[order.id] || [];
        const orderTotal = items.reduce(
          (itemSum, item) => itemSum + (item.total || 0),
          0
        );
        return sum + orderTotal;
      }, 0);
      const totalPayments = customerPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );
      const currentBalance = totalOrders - totalPayments;

      // Calculate lastActivity
      const allDates = [
        ...customerOrders.map((order) => new Date(order.date)),
        ...customerPayments.map((payment) => new Date(payment.date)),
        ...customerChecks.map((check) => new Date(check.dueDate)),
      ];
      const lastActivity =
        allDates.length > 0
          ? new Date(Math.max(...allDates.map((date) => date.getTime())))
          : new Date(customerData.createdAt || new Date());

      customersData.push({
        id: doc.id,
        name: customerData.name,
        phone: customerData.phone,
        notes: customerData.notes || "",
        numberOfOrders,
        currentBalance,
        lastActivity: lastActivity.toISOString(),
        createdAt: customerData.createdAt || new Date().toISOString(),
      });
    });

    setCustomers(customersData);
  };

  const handleAddCustomer = async () => {
    try {
      const newCustomer = {
        ...formData,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "customers"), newCustomer);
      const newCustomerWithId = {
        id: docRef.id,
        ...newCustomer,
        numberOfOrders: 0,
        currentBalance: 0,
        lastActivity: newCustomer.createdAt,
      };

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setFormData({ name: "", phone: "", notes: "" });
      setAddSuccess(true);
      focusFirstField();
      setTimeout(() => setAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error adding customer:", error);
    }
  };

  const handleEditCustomer = async () => {
    if (!selectedCustomer) return;

    try {
      const customerRef = doc(db, "customers", selectedCustomer.id);
      await updateDoc(customerRef, {
        name: formData.name,
        phone: formData.phone,
        notes: formData.notes,
      });

      // Update cache
      const updatedCustomer = {
        ...selectedCustomer,
        name: formData.name,
        phone: formData.phone,
        notes: formData.notes,
      };

      setShowEditModal(false);
      setSelectedCustomer(null);
      setFormData({ name: "", phone: "", notes: "" });
    } catch (error) {
      console.error("Error updating customer:", error);
    }
  };

  // Cascade delete: removes the customer AND everything that belongs
  // to them — orders, those orders' items, payments, and checks.
  // The customer doc goes in the LAST batch, so a failure mid-way
  // leaves the customer visible and the delete safely retryable.
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer || deleting) return;

    setDeleting(true);
    try {
      const customerId = selectedCustomer.id;

      const [ordersSnap, paymentsSnap, checksSnap] = await Promise.all([
        getDocs(
          query(collection(db, "orders"), where("customerId", "==", customerId))
        ),
        getDocs(
          query(
            collection(db, "payments"),
            where("customerId", "==", customerId)
          )
        ),
        getDocs(
          query(
            collection(db, "customerChecks"),
            where("customerId", "==", customerId)
          )
        ),
      ]);

      const itemSnaps = await Promise.all(
        ordersSnap.docs.map((orderDoc) =>
          getDocs(
            query(
              collection(db, "orderItems"),
              where("orderId", "==", orderDoc.id)
            )
          )
        )
      );

      const refs = [
        ...itemSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
        ...ordersSnap.docs.map((d) => d.ref),
        ...paymentsSnap.docs.map((d) => d.ref),
        ...checksSnap.docs.map((d) => d.ref),
        doc(db, "customers", customerId),
      ];

      // Firestore batches cap at 500 operations — commit in chunks
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      setShowDeleteModal(false);
      setSelectedCustomer(null);
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert("حدث خطأ أثناء حذف العميل وبياناته — لم يتم حذف العميل، حاول مجدداً");
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  };

  const openCustomerAccount = (customerId: string) => {
    navigate(`/customers/${customerId}`);
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

  const getBalanceClass = (balance: number) => {
    if (balance > 0) return "positive";
    if (balance < 0) return "negative";
    return "zero";
  };

  const getBalanceText = (balance: number) => {
    if (balance > 0) return "مدين";
    if (balance < 0) return "دائن";
    return "متساوي";
  };

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(
    indexOfFirstItem,
    indexOfLastItem
  );
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const printCustomers = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const filteredCustomers = customers.filter((customer) => {
          const matchesTerm = matchesSearch(customer, searchTerm);

          const matchesBalance =
            balanceFilter === "all" ||
            (balanceFilter === "debtor" && customer.currentBalance > 0) ||
            (balanceFilter === "creditor" && customer.currentBalance < 0) ||
            (balanceFilter === "zero" && customer.currentBalance === 0);

          return matchesTerm && matchesBalance;
        });

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>قائمة العملاء</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2b241c; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .balance-positive { color: #b23b2e; }
              .balance-negative { color: #4a7c59; }
              .balance-zero { color: #6f6459; }
              .summary { margin-top: 20px; padding: 15px; background-color: #faf6ee; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة العملاء</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString("en-GB")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>اسم العميل</th>
                  <th>رقم الهاتف</th>
                  <th>عدد الطلبات</th>
                  <th>الرصيد الحالي</th>
                  <th>آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                ${filteredCustomers
                  .map(
                    (customer) => `
                  <tr>
                    <td>${customer.name}</td>
                    <td>${customer.phone}</td>
                    <td>${customer.numberOfOrders}</td>
                    <td class="balance-${
                      customer.currentBalance > 0
                        ? "positive"
                        : customer.currentBalance < 0
                        ? "negative"
                        : "zero"
                    }">
                      ${formatCurrency(
                        Math.abs(customer.currentBalance)
                      )} ${getBalanceText(customer.currentBalance)}
                    </td>
                    <td>${formatDate(customer.lastActivity)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <h3>ملخص</h3>
              <p><strong>إجمالي العملاء:</strong> ${
                filteredCustomers.length
              }</p>
              <p><strong>إجمالي الطلبات:</strong> ${filteredCustomers.reduce(
                (sum, c) => sum + c.numberOfOrders,
                0
              )}</p>
              <p><strong>إجمالي المديونية:</strong> ${formatCurrency(
                filteredCustomers
                  .filter((c) => c.currentBalance > 0)
                  .reduce((sum, c) => sum + c.currentBalance, 0)
              )}</p>
              <p><strong>إجمالي الدائنية:</strong> ${formatCurrency(
                Math.abs(
                  filteredCustomers
                    .filter((c) => c.currentBalance < 0)
                    .reduce((sum, c) => sum + c.currentBalance, 0)
                )
              )}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing customers:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />;
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  if (loading) {
    return (
      <div className="customers-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل العملاء...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-container">
      {/* Header */}
      <div className="customers-header">
        <div>
          <h1 className="customers-title">إدارة العملاء</h1>
          <p className="customers-subtitle">
            إدارة قائمة العملاء والوصول إلى حساباتهم
          </p>
        </div>
        <div className="header-actions">
          <button
            className="print-btn"
            onClick={printCustomers}
            title="طباعة قائمة العملاء"
          >
            <Printer className="btn-icon" />
            طباعة
          </button>
          {/* The live subscription picks up the change automatically. */}
          <button
            className="add-customer-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة عميل
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <User className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{customers.length}</span>
            <span className="stat-label">إجمالي العملاء</span>
          </div>
        </div>
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {customers.reduce(
                (sum, customer) => sum + customer.numberOfOrders,
                0
              )}
            </span>
            <span className="stat-label">إجمالي الطلبات</span>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {formatCurrency(
                customers.reduce(
                  (sum, customer) => sum + Math.max(0, customer.currentBalance),
                  0
                )
              )}
            </span>
            <span className="stat-label">إجمالي المستحقات</span>
          </div>
        </div>
        <div className="stat-card">
          <Calendar className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {
                customers.filter((customer) => customer.numberOfOrders > 0)
                  .length
              }
            </span>
            <span className="stat-label">عملاء نشطون</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <FiltersBar
        onClear={() => {
          setSearchTerm("");
          setBalanceFilter("all");
        }}
      >
        <SearchField value={searchTerm} onChange={setSearchTerm} />
        <SelectField
          label="الرصيد"
          value={balanceFilter}
          onChange={setBalanceFilter}
          options={[
            { value: "all", label: "جميع العملاء" },
            { value: "positive", label: "مدين" },
            { value: "negative", label: "دائن" },
            { value: "zero", label: "متساوي" },
          ]}
        />
        <SortControl
          value={sortBy}
          onChange={(field) => {
            if (field !== sortBy) handleSort(field);
          }}
          options={[
            { value: "name", label: "الاسم" },
            { value: "phone", label: "رقم الهاتف" },
            { value: "numberOfOrders", label: "عدد الطلبات" },
            { value: "balance", label: "الرصيد الحالي" },
            { value: "lastActivity", label: "آخر نشاط" },
          ]}
          order={sortOrder}
          onToggleOrder={() => handleSort(sortBy)}
        />
      </FiltersBar>

      {/* Customer register — entity cards (same page slice the table used) */}
      {filteredCustomers.length === 0 ? (
        <div className="cst-empty">
          <User size={34} color="#D8CDBB" />
          <p>
            {searchTerm || balanceFilter !== "all"
              ? "لا توجد نتائج للبحث"
              : "لا يوجد عملاء بعد"}
          </p>
        </div>
      ) : (
        <div className="cst-grid">
          {currentCustomers.map((customer) => (
            <div
              key={customer.id}
              className="cst-card"
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).closest("button, a, input, select")
                )
                  return;
                openCustomerAccount(customer.id);
              }}
            >
              <div className="cst-tab" title={customer.name}>
                {customer.name}
              </div>

              <div className="cst-lines">
                <div className="cst-line">
                  <span className="cst-line-label">الهاتف</span>
                  <span className="cst-dots" />
                  <span className="cst-line-val cst-phone">
                    {customer.phone || "—"}
                  </span>
                </div>
                <div className="cst-line">
                  <span className="cst-line-label">عدد الطلبات</span>
                  <span className="cst-dots" />
                  <span className="cst-line-val">
                    {customer.numberOfOrders}
                  </span>
                </div>
                <div className="cst-line">
                  <span className="cst-line-label">آخر نشاط</span>
                  <span className="cst-dots" />
                  <span className="cst-line-val">
                    {formatDate(customer.lastActivity)}
                  </span>
                </div>
              </div>

              <div className="cst-total">
                <span className="cst-total-label">الرصيد الحالي</span>
                <span
                  className={`balance-info ${getBalanceClass(
                    customer.currentBalance
                  )} cst-balwrap`}
                >
                  <b className="cst-bal">
                    {formatCurrency(Math.abs(customer.currentBalance))}
                  </b>
                  <span className="balance-status">
                    {getBalanceText(customer.currentBalance)}
                  </span>
                </span>
              </div>

              {customer.notes && (
                <div className="cst-notes">{customer.notes}</div>
              )}

              <div className="cst-foot">
                <div className="cst-actions">
                  <button
                    className="action-btn view"
                    onClick={() => openCustomerAccount(customer.id)}
                    title="فتح الحساب"
                  >
                    <Eye />
                  </button>
                  <button
                    className="action-btn edit"
                    onClick={() => openEditModal(customer)}
                    title="تعديل"
                  >
                    <Edit />
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => openDeleteModal(customer)}
                    title="حذف"
                  >
                    <Trash2 />
                  </button>
                </div>
                <span className="cst-open">فتح الحساب ←</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredCustomers.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredCustomers.length}
          itemsPerPage={itemsPerPage}
          onPageChange={paginate}
          onItemsPerPageChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
          itemLabel="عميل"
        />
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal" ref={addModalRef}>
            <div className="modal-header">
              <h3>إضافة عميل جديد</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
              <div className="form-group">
                <label>اسم العميل *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="أدخل اسم العميل"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="أدخل رقم الهاتف"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleAddCustomer}
                disabled={!formData.name || !formData.phone}
              >
                إضافة العميل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل العميل</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اسم العميل *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="أدخل اسم العميل"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="أدخل رقم الهاتف"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleEditCustomer}
                disabled={!formData.name || !formData.phone}
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>تأكيد الحذف</h3>
              <button
                className="close-btn"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف العميل{" "}
                <strong>{selectedCustomer.name}</strong>؟
              </p>
              <p className="warning-text">
                سيتم حذف جميع بيانات العميل نهائياً: الطلبات وعناصرها،
                والدفعات، والشيكات — لا يمكن التراجع عن هذا الإجراء!
              </p>
              <div className="form-group">
                <label>اكتب "موافق" لتأكيد الحذف</label>
                <input
                  type="text"
                  className="form-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="موافق"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteCustomer}
                disabled={deleting || deleteConfirmText.trim() !== "موافق"}
              >
                {deleting ? "جاري الحذف..." : "حذف العميل وجميع بياناته"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
