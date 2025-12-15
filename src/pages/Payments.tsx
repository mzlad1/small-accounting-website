import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Eye,
  DollarSign,
  User,
  Calendar,
  CreditCard,
  Banknote,
  SortAsc,
  SortDesc,
  Edit,
  Trash2,
  Printer,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";

import "./Payments.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  type: "cash" | "check";
  amount: number;
  notes?: string;
  checkNumber?: string;
  checkBank?: string;
  checkDate?: string;
  nameOnCheck?: string;
  createdAt: string;
  isGrouped?: boolean;
  groupedCount?: number;
  originalPayments?: Payment[];
}

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [paginatedPayments, setPaginatedPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    customer: "all",
    type: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "date",
    order: "desc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    date: new Date().toISOString().split("T")[0],
    type: "cash" as Payment["type"],
    amount: 0,
    notes: "",
    checkNumber: "",
    checkBank: "",
    checkDate: "",
    nameOnCheck: "",
  });

  // Custom dropdown states for Payments
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [isEditCustomerDropdownOpen, setIsEditCustomerDropdownOpen] =
    useState(false);
  const [editCustomerSearchTerm, setEditCustomerSearchTerm] = useState("");
  const [selectedEditCustomerIndex, setSelectedEditCustomerIndex] =
    useState(-1);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [payments, searchTerm, filters, sortBy, currentPage, itemsPerPage]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".custom-dropdown")) {
        setIsCustomerDropdownOpen(false);
        setIsEditCustomerDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch customers
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);

      // Fetch payments with customer names
      const paymentsSnapshot = await getDocs(
        query(collection(db, "payments"), orderBy("createdAt", "desc"))
      );
      const paymentsData: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const paymentData = doc.data();
        const customer = customersData.find(
          (c) => c.id === paymentData.customerId
        );
        paymentsData.push({
          id: doc.id,
          ...paymentData,
          customerName: customer?.name || "Unknown Customer",
        } as Payment);
      });

      setPayments(paymentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...payments];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (payment) =>
          payment.customerName
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          payment.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply customer filter
    if (filters.customer !== "all") {
      filtered = filtered.filter(
        (payment) => payment.customerId === filters.customer
      );
    }

    // Apply type filter
    if (filters.type !== "all") {
      filtered = filtered.filter((payment) => payment.type === filters.type);
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) <= new Date(filters.dateTo)
      );
    }

    // Group same-day check payments by customer
    const groupedPayments: Payment[] = [];
    const checkPaymentsByCustomerAndDate: { [key: string]: Payment[] } = {};

    // Separate cash payments and check payments
    const cashPayments = filtered.filter((payment) => payment.type === "cash");
    const checkPayments = filtered.filter(
      (payment) => payment.type === "check"
    );

    // Group check payments by customer and date
    checkPayments.forEach((payment) => {
      const key = `${payment.customerId}_${payment.date}`;
      if (!checkPaymentsByCustomerAndDate[key]) {
        checkPaymentsByCustomerAndDate[key] = [];
      }
      checkPaymentsByCustomerAndDate[key].push(payment);
    });

    // Create grouped check payments
    Object.values(checkPaymentsByCustomerAndDate).forEach((paymentGroup) => {
      if (paymentGroup.length === 1) {
        // Single payment, add as is
        groupedPayments.push(paymentGroup[0]);
      } else {
        // Multiple payments on same day for same customer, group them
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
        const allNotes = paymentGroup
          .map((p) => p.notes)
          .filter((note) => note)
          .join("; ");

        const groupedPayment: Payment = {
          ...firstPayment,
          amount: totalAmount,
          checkNumber: allCheckNumbers,
          checkBank: allBanks,
          notes: `دفعة شيكات متعددة (${paymentGroup.length} شيك)`,
          isGrouped: true,
          groupedCount: paymentGroup.length,
          originalPayments: paymentGroup,
        };

        groupedPayments.push(groupedPayment);
      }
    });

    // Combine cash payments and grouped check payments
    const finalPayments = [...cashPayments, ...groupedPayments];

    // Apply sorting
    finalPayments.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof Payment];
      let bValue: any = b[sortBy.field as keyof Payment];

      if (sortBy.field === "date") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredPayments(finalPayments);

    // Calculate pagination
    const totalPages = Math.ceil(finalPayments.length / itemsPerPage);
    setTotalPages(totalPages);

    // Reset to first page if current page is beyond total pages
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }

    // Get paginated data
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = finalPayments.slice(startIndex, endIndex);
    setPaginatedPayments(paginated);
  };

  // Custom dropdown functions for customers
  const getFilteredCustomers = (searchTerm: string) => {
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleCustomerSelect = (customer: Customer, isEdit = false) => {
    if (isEdit) {
      setPaymentForm({ ...paymentForm, customerId: customer.id });
      setEditCustomerSearchTerm(customer.name);
      setIsEditCustomerDropdownOpen(false);
      setSelectedEditCustomerIndex(-1);
    } else {
      setPaymentForm({ ...paymentForm, customerId: customer.id });
      setCustomerSearchTerm(customer.name);
      setIsCustomerDropdownOpen(false);
      setSelectedCustomerIndex(-1);
    }
  };

  // Helper function to scroll highlighted option into view
  const scrollToHighlighted = (index: number, isEdit = false) => {
    const dropdownSelector = isEdit
      ? ".modal .dropdown-options"
      : ".custom-dropdown .dropdown-options";
    const dropdown = document.querySelector(dropdownSelector);

    if (dropdown && index >= 0) {
      const option = dropdown.children[index] as HTMLElement;
      if (option) {
        const dropdownRect = dropdown.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();

        if (optionRect.bottom > dropdownRect.bottom) {
          // Option is below visible area
          dropdown.scrollTop += optionRect.bottom - dropdownRect.bottom;
        } else if (optionRect.top < dropdownRect.top) {
          // Option is above visible area
          dropdown.scrollTop -= dropdownRect.top - optionRect.top;
        }
      }
    }
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent, isEdit = false) => {
    const filteredCustomers = getFilteredCustomers(
      isEdit ? editCustomerSearchTerm : customerSearchTerm
    );
    const selectedIndex = isEdit
      ? selectedEditCustomerIndex
      : selectedCustomerIndex;
    const setSelectedIndex = isEdit
      ? setSelectedEditCustomerIndex
      : setSelectedCustomerIndex;
    const setDropdownOpen = isEdit
      ? setIsEditCustomerDropdownOpen
      : setIsCustomerDropdownOpen;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        const newDownIndex = Math.min(
          selectedIndex + 1,
          filteredCustomers.length - 1
        );
        setSelectedIndex(newDownIndex);
        setDropdownOpen(true);
        // Scroll highlighted option into view
        setTimeout(() => scrollToHighlighted(newDownIndex, isEdit), 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        const newUpIndex = Math.max(selectedIndex - 1, -1);
        setSelectedIndex(newUpIndex);
        setDropdownOpen(true);
        // Scroll highlighted option into view
        setTimeout(() => scrollToHighlighted(newUpIndex, isEdit), 0);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredCustomers.length) {
          handleCustomerSelect(filteredCustomers[selectedIndex], isEdit);
        }
        break;
      case "Escape":
        e.preventDefault();
        setDropdownOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleAddPayment = async () => {
    try {
      const newPayment = {
        ...paymentForm,
        createdAt: new Date().toISOString(),
      };

      // Add the payment
      const paymentRef = await addDoc(collection(db, "payments"), newPayment);
      const newPaymentWithId = {
        id: paymentRef.id,
        ...newPayment,
        customerName:
          customers.find((c) => c.id === paymentForm.customerId)?.name ||
          "Unknown Customer",
      };

      // If it's a check payment, also add it to the checks collection
      if (paymentForm.type === "check") {
        const customer = customers.find((c) => c.id === paymentForm.customerId);
        const newCheck = {
          customerId: paymentForm.customerId,
          customerName: customer?.name || "",
          checkNumber: paymentForm.checkNumber!,
          bank: paymentForm.checkBank!,
          amount: paymentForm.amount,
          dueDate: paymentForm.checkDate!, // Use check date as due date
          status: "pending" as "pending" | "collected" | "returned",
          notes: paymentForm.notes || `دفعة شيك - ${paymentForm.notes || ""}`,
          nameOnCheck: paymentForm.nameOnCheck || customer?.name || "",
          createdAt: new Date().toISOString(),
        };

        console.log("Creating new check from payment:", newCheck);
        const checkRef = await addDoc(
          collection(db, "customerChecks"),
          newCheck
        );
        console.log("Check created with ID:", checkRef.id);
      }

      // Show success message
      if (paymentForm.type === "check") {
        alert("تم إضافة الدفعة والشيك بنجاح!");
      }

      setShowAddModal(false);
      setPaymentForm({
        customerId: "",
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        amount: 0,
        notes: "",
        checkNumber: "",
        checkBank: "",
        checkDate: "",
        nameOnCheck: "",
      });
      setCustomerSearchTerm("");
      setIsCustomerDropdownOpen(false);
      setSelectedCustomerIndex(-1);
    } catch (error) {
      console.error("Error adding payment:", error);
    }
  };

  const handleEditPayment = (payment: Payment) => {
    // Don't allow editing grouped payments directly
    if (payment.isGrouped) {
      alert(
        "لا يمكن تعديل الدفعات المجمعة مباشرة. يرجى تعديل كل شيك على حدة من صفحة الشيكات."
      );
      return;
    }

    setEditingPayment(payment);
    const customer = customers.find((c) => c.id === payment.customerId);
    setPaymentForm({
      customerId: payment.customerId,
      date: payment.date,
      type: payment.type,
      amount: payment.amount,
      notes: payment.notes || "",
      checkNumber: payment.checkNumber || "",
      checkBank: payment.checkBank || "",
      checkDate: payment.checkDate || "",
      nameOnCheck: payment.nameOnCheck || "",
    });
    setEditCustomerSearchTerm(customer?.name || "");
    setShowEditModal(true);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment) return;

    try {
      const updatedPayment = {
        ...paymentForm,
        updatedAt: new Date().toISOString(),
      };

      // Update the payment
      await updateDoc(doc(db, "payments", editingPayment.id), updatedPayment);

      // Update cache
      const updatedPaymentWithId = {
        ...editingPayment,
        ...updatedPayment,
        customerName:
          customers.find((c) => c.id === paymentForm.customerId)?.name ||
          "Unknown Customer",
      };

      // If it's a check payment, also update the corresponding check
      if (paymentForm.type === "check") {
        const customer = customers.find((c) => c.id === paymentForm.customerId);
        const updatedCheck = {
          customerId: paymentForm.customerId,
          customerName: customer?.name || "",
          checkNumber: paymentForm.checkNumber!,
          bank: paymentForm.checkBank!,
          amount: paymentForm.amount,
          dueDate: paymentForm.checkDate!, // Use check date as due date
          notes: paymentForm.notes || `دفعة شيك - ${paymentForm.notes || ""}`,
          nameOnCheck: paymentForm.nameOnCheck || customer?.name || "",
          updatedAt: new Date().toISOString(),
        };

        // Find and update the corresponding check
        const checksSnapshot = await getDocs(
          query(
            collection(db, "customerChecks"),
            where("checkNumber", "==", editingPayment.checkNumber),
            where("customerId", "==", editingPayment.customerId)
          )
        );

        if (!checksSnapshot.empty) {
          const checkDoc = checksSnapshot.docs[0];
          await updateDoc(doc(db, "customerChecks", checkDoc.id), updatedCheck);
        }
      }

      alert("تم تحديث الدفعة بنجاح!");
      setShowEditModal(false);
      setEditingPayment(null);
      setPaymentForm({
        customerId: "",
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        amount: 0,
        notes: "",
        checkNumber: "",
        checkBank: "",
        checkDate: "",
        nameOnCheck: "",
      });
      setEditCustomerSearchTerm("");
      setIsEditCustomerDropdownOpen(false);
      setSelectedEditCustomerIndex(-1);
    } catch (error) {
      console.error("Error updating payment:", error);
    }
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (payment.isGrouped) {
      alert(
        "لا يمكن حذف الدفعات المجمعة مباشرة. يرجى حذف كل شيك على حدة من صفحة الشيكات."
      );
      return;
    }

    if (!confirm("هل أنت متأكد من حذف هذه الدفعة؟")) return;

    try {
      // Delete the payment
      await deleteDoc(doc(db, "payments", payment.id));

      // If it's a check payment, also delete the corresponding check
      if (payment.type === "check") {
        const checksSnapshot = await getDocs(
          query(
            collection(db, "customerChecks"),
            where("checkNumber", "==", payment.checkNumber),
            where("customerId", "==", payment.customerId)
          )
        );

        if (!checksSnapshot.empty) {
          const checkDoc = checksSnapshot.docs[0];
          await deleteDoc(doc(db, "customerChecks", checkDoc.id));
        }
      }

      alert("تم حذف الدفعة بنجاح!");
    } catch (error) {
      console.error("Error deleting payment:", error);
    }
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
      <SortAsc size={16} />
    ) : (
      <SortDesc size={16} />
    );
  };

  const getTypeIcon = (type: string) => {
    return type === "cash" ? (
      <Banknote className="type-icon" />
    ) : (
      <CreditCard className="type-icon" />
    );
  };

  const getTypeText = (type: string) => {
    return type === "cash" ? "نقدي" : "شيك";
  };

  const getTypeClass = (type: string) => {
    return type === "cash" ? "cash" : "check";
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

  const printPayments = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>قائمة المدفوعات</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .type-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; }
              .type-badge.cash { background-color: #10b981; }
              .type-badge.check { background-color: #3b82f6; }
              .grouped-indicator { color: #6b7280; font-size: 11px; }
              .summary { margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة المدفوعات</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString(
                "en-US"
              )}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>ملاحظات</th>
                  <th>تفاصيل الشيك</th>
                </tr>
              </thead>
              <tbody>
                ${filteredPayments
                  .map(
                    (payment) => `
                  <tr>
                    <td>${formatDate(payment.date)}</td>
                    <td>${payment.customerName}</td>
                    <td><span class="type-badge ${getTypeClass(
                      payment.type
                    )}">${getTypeText(payment.type)}</span></td>
                    <td>${formatCurrency(payment.amount)}</td>
                    <td>${payment.notes || "-"}</td>
                    <td>${
                      payment.type === "check"
                        ? `رقم: ${payment.checkNumber}, بنك: ${
                            payment.checkBank
                          }${
                            payment.isGrouped
                              ? ` <span class="grouped-indicator">(${payment.groupedCount} شيك)</span>`
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
              <h3>ملخص</h3>
              <p><strong>إجمالي المدفوعات:</strong> ${
                filteredPayments.length
              }</p>
              <p><strong>إجمالي المبالغ:</strong> ${formatCurrency(
                filteredPayments.reduce((sum, p) => sum + p.amount, 0)
              )}</p>
              <p><strong>المدفوعات النقدية:</strong> ${formatCurrency(
                filteredPayments
                  .filter((p) => p.type === "cash")
                  .reduce((sum, p) => sum + p.amount, 0)
              )}</p>
              <p><strong>المدفوعات بالشيك:</strong> ${formatCurrency(
                filteredPayments
                  .filter((p) => p.type === "check")
                  .reduce((sum, p) => sum + p.amount, 0)
              )}</p>
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

  // Pagination functions
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
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

  if (loading) {
    return (
      <div className="payments-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل المدفوعات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payments-container">
      {/* Header */}
      <div className="payments-header">
        <div className="header-content">
          <h1>المدفوعات</h1>
          <p>إدارة جميع المدفوعات من جميع العملاء</p>
        </div>
        <div className="header-actions">
          <button
            className="print-btn"
            onClick={printPayments}
            title="طباعة قائمة المدفوعات"
          >
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="add-payment-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة دفعة جديدة
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالعميل أو الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>العميل:</label>
            <select
              value={filters.customer}
              onChange={(e) =>
                setFilters({ ...filters, customer: e.target.value })
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
            <label>النوع:</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="filter-select"
            >
              <option value="all">جميع الأنواع</option>
              <option value="cash">نقدي</option>
              <option value="check">شيك</option>
            </select>
          </div>

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

      {/* Summary Section */}
      <div className="summary-section">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">
              <DollarSign />
            </div>
            <div className="summary-content">
              <h3>إجمالي المدفوعات</h3>
              <p className="summary-number">{filteredPayments.length}</p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <Banknote />
            </div>
            <div className="summary-content">
              <h3>إجمالي المبالغ</h3>
              <p className="summary-number">
                {formatCurrency(
                  filteredPayments.reduce(
                    (sum, payment) => sum + payment.amount,
                    0
                  )
                )}
              </p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <Banknote />
            </div>
            <div className="summary-content">
              <h3>المدفوعات النقدية</h3>
              <p className="summary-number">
                {formatCurrency(
                  filteredPayments
                    .filter((payment) => payment.type === "cash")
                    .reduce((sum, payment) => sum + payment.amount, 0)
                )}
              </p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <CreditCard />
            </div>
            <div className="summary-content">
              <h3>المدفوعات بالشيك</h3>
              <p className="summary-number">
                {formatCurrency(
                  filteredPayments
                    .filter((payment) => payment.type === "check")
                    .reduce((sum, payment) => sum + payment.amount, 0)
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="payments-table-container">
        <table className="payments-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("date")} className="sortable">
                <div className="th-content">
                  <Calendar className="th-icon" />
                  التاريخ
                  {getSortIcon("date")}
                </div>
              </th>
              <th
                onClick={() => handleSort("customerName")}
                className="sortable"
              >
                <div className="th-content">
                  <User className="th-icon" />
                  العميل
                  {getSortIcon("customerName")}
                </div>
              </th>
              <th>النوع</th>
              <th onClick={() => handleSort("amount")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  المبلغ
                  {getSortIcon("amount")}
                </div>
              </th>
              <th>ملاحظات</th>
              <th>تفاصيل الشيك</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedPayments.length === 0 ? (
              <tr>
                <td colSpan={7} className="no-data">
                  لا توجد مدفوعات
                </td>
              </tr>
            ) : (
              paginatedPayments.map((payment) => (
                <tr key={payment.id} className="payment-row">
                  <td>{formatDate(payment.date)}</td>
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {payment.customerName}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={`type-badge ${getTypeClass(payment.type)}`}>
                      {getTypeIcon(payment.type)}
                      {getTypeText(payment.type)}
                    </div>
                  </td>
                  <td>
                    <div className="payment-amount">
                      {formatCurrency(payment.amount)}
                    </div>
                  </td>
                  <td>
                    <div className="payment-notes">{payment.notes || "-"}</div>
                  </td>
                  <td>
                    {payment.type === "check" ? (
                      <div className="check-details">
                        <span>رقم: {payment.checkNumber}</span>
                        <span>بنك: {payment.checkBank}</span>
                        {payment.isGrouped && (
                          <span className="grouped-indicator">
                            ({payment.groupedCount} شيك)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="no-check">-</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className={`action-btn edit ${
                          payment.isGrouped ? "disabled" : ""
                        }`}
                        onClick={() => handleEditPayment(payment)}
                        title={
                          payment.isGrouped
                            ? "لا يمكن تعديل الدفعات المجمعة"
                            : "تعديل"
                        }
                        disabled={payment.isGrouped}
                      >
                        <Edit />
                      </button>
                      <button
                        className={`action-btn delete ${
                          payment.isGrouped ? "disabled" : ""
                        }`}
                        onClick={() => handleDeletePayment(payment)}
                        title={
                          payment.isGrouped
                            ? "لا يمكن حذف الدفعات المجمعة"
                            : "حذف"
                        }
                        disabled={payment.isGrouped}
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

      {/* Pagination Controls */}
      {filteredPayments.length > 0 && (
        <div className="pagination-container">
          <div className="pagination-info">
            <span>
              عرض {(currentPage - 1) * itemsPerPage + 1} إلى{" "}
              {Math.min(currentPage * itemsPerPage, filteredPayments.length)} من{" "}
              {filteredPayments.length} دفعة
            </span>
            <div className="items-per-page">
              <label>عدد العناصر في الصفحة:</label>
              <select
                value={itemsPerPage}
                onChange={(e) =>
                  handleItemsPerPageChange(Number(e.target.value))
                }
                className="pagination-select"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
            >
              الأولى
            </button>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              السابقة
            </button>

            {getPageNumbers().map((page) => (
              <button
                key={page}
                className={`pagination-btn ${
                  currentPage === page ? "active" : ""
                }`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}

            <button
              className="pagination-btn"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              التالية
            </button>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
            >
              الأخيرة
            </button>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة دفعة جديدة</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>العميل *</label>
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      setIsCustomerDropdownOpen(true);
                      setSelectedCustomerIndex(-1);
                    }}
                    onKeyDown={(e) => handleCustomerKeyDown(e, false)}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="ابحث عن العميل أو اختر من القائمة"
                    required={!paymentForm.customerId}
                  />
                  {isCustomerDropdownOpen && (
                    <div className="dropdown-options">
                      {getFilteredCustomers(customerSearchTerm).map(
                        (customer, index) => (
                          <div
                            key={customer.id}
                            className={`dropdown-option ${
                              index === selectedCustomerIndex
                                ? "highlighted"
                                : ""
                            } ${
                              paymentForm.customerId === customer.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleCustomerSelect(customer, false)
                            }
                          >
                            {customer.name}
                          </div>
                        )
                      )}
                      {getFilteredCustomers(customerSearchTerm).length ===
                        0 && (
                        <div className="dropdown-option disabled">
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, date: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>النوع *</label>
                  <select
                    value={paymentForm.type}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        type: e.target.value as Payment["type"],
                      })
                    }
                    className="form-select"
                  >
                    <option value="cash">نقدي</option>
                    <option value="check">شيك</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
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
                  placeholder="أدخل المبلغ"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>

              {paymentForm.type === "check" && (
                <div className="form-row">
                  <div className="form-group">
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
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
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
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {paymentForm.type === "check" && (
                <div className="form-row">
                  <div className="form-group">
                    <label>تاريخ الشيك *</label>
                    <input
                      type="date"
                      value={paymentForm.checkDate}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkDate: e.target.value,
                        })
                      }
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>الاسم على الشيك</label>
                    <input
                      type="text"
                      value={paymentForm.nameOnCheck}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          nameOnCheck: e.target.value,
                        })
                      }
                      placeholder="أدخل الاسم على الشيك (اختياري)"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {paymentForm.type === "check" && (
                <div className="form-info">
                  <p>
                    سيتم إضافة هذا الشيك تلقائياً إلى قائمة الشيكات للمتابعة
                  </p>
                </div>
              )}
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
                onClick={handleAddPayment}
                disabled={
                  !paymentForm.customerId ||
                  !paymentForm.date ||
                  paymentForm.amount <= 0 ||
                  (paymentForm.type === "check" &&
                    (!paymentForm.checkNumber ||
                      !paymentForm.checkBank ||
                      !paymentForm.checkDate))
                }
              >
                إضافة الدفعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل الدفعة</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>العميل *</label>
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={editCustomerSearchTerm}
                    onChange={(e) => {
                      setEditCustomerSearchTerm(e.target.value);
                      setIsEditCustomerDropdownOpen(true);
                      setSelectedEditCustomerIndex(-1);
                    }}
                    onKeyDown={(e) => handleCustomerKeyDown(e, true)}
                    onFocus={() => setIsEditCustomerDropdownOpen(true)}
                    placeholder="ابحث عن العميل أو اختر من القائمة"
                    required={!paymentForm.customerId}
                  />
                  {isEditCustomerDropdownOpen && (
                    <div className="dropdown-options">
                      {getFilteredCustomers(editCustomerSearchTerm).map(
                        (customer, index) => (
                          <div
                            key={customer.id}
                            className={`dropdown-option ${
                              index === selectedEditCustomerIndex
                                ? "highlighted"
                                : ""
                            } ${
                              paymentForm.customerId === customer.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => handleCustomerSelect(customer, true)}
                          >
                            {customer.name}
                          </div>
                        )
                      )}
                      {getFilteredCustomers(editCustomerSearchTerm).length ===
                        0 && (
                        <div className="dropdown-option disabled">
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, date: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>النوع *</label>
                  <select
                    value={paymentForm.type}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        type: e.target.value as Payment["type"],
                      })
                    }
                    className="form-select"
                  >
                    <option value="cash">نقدي</option>
                    <option value="check">شيك</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
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
                  placeholder="أدخل المبلغ"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>

              {paymentForm.type === "check" && (
                <div className="form-row">
                  <div className="form-group">
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
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
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
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {paymentForm.type === "check" && (
                <div className="form-row">
                  <div className="form-group">
                    <label>تاريخ الشيك *</label>
                    <input
                      type="date"
                      value={paymentForm.checkDate}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkDate: e.target.value,
                        })
                      }
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>الاسم على الشيك</label>
                    <input
                      type="text"
                      value={paymentForm.nameOnCheck}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          nameOnCheck: e.target.value,
                        })
                      }
                      placeholder="أدخل الاسم على الشيك (اختياري)"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {paymentForm.type === "check" && (
                <div className="form-info">
                  <p>سيتم تحديث الشيك المقترن بهذه الدفعة تلقائياً</p>
                </div>
              )}
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
                onClick={handleUpdatePayment}
                disabled={
                  !paymentForm.customerId ||
                  !paymentForm.date ||
                  paymentForm.amount <= 0 ||
                  (paymentForm.type === "check" &&
                    (!paymentForm.checkNumber ||
                      !paymentForm.checkBank ||
                      !paymentForm.checkDate))
                }
              >
                تحديث الدفعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
