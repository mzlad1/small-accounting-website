import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  DollarSign,
  Calendar,
  User,
  SortAsc,
  SortDesc,
  Printer,
  Download,
  Upload,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./SupplierPayments.css";

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  date: string;
  type: "cash" | "check" | "transfer";
  notes?: string;
  checkNumber?: string;
  checkBank?: string;
  createdAt: string;
  updatedAt?: string;
}

interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  totalOrdered: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate?: string;
  lastOrderDate?: string;
}

export function SupplierPayments() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<SupplierPayment[]>(
    []
  );
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalance[]>(
    []
  );
  const [filteredBalances, setFilteredBalances] = useState<SupplierBalance[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [balanceSearchTerm, setBalanceSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [sortBy, setSortBy] = useState({
    field: "date",
    order: "desc" as "asc" | "desc",
  });
  const [balanceSortBy, setBalanceSortBy] = useState({
    field: "balance",
    order: "desc" as "asc" | "desc",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [balanceCurrentPage, setBalanceCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [balanceItemsPerPage] = useState(10);
  const [showBalanceView, setShowBalanceView] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(
    null
  );
  const [paymentForm, setPaymentForm] = useState({
    supplierId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    type: "cash" as "cash" | "check" | "transfer",
    notes: "",
    checkNumber: "",
    checkBank: "",
  });

  // Custom dropdown states
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);
  const [isEditSupplierDropdownOpen, setIsEditSupplierDropdownOpen] =
    useState(false);
  const [editSupplierSearchTerm, setEditSupplierSearchTerm] = useState("");
  const [selectedEditSupplierIndex, setSelectedEditSupplierIndex] =
    useState(-1);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [
    payments,
    searchTerm,
    selectedSupplier,
    selectedType,
    sortBy,
    currentPage,
    itemsPerPage,
  ]);

  useEffect(() => {
    applyBalanceFiltersAndSort();
  }, [
    supplierBalances,
    balanceSearchTerm,
    balanceSortBy,
    balanceCurrentPage,
    balanceItemsPerPage,
  ]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".custom-dropdown")) {
        setIsSupplierDropdownOpen(false);
        setIsEditSupplierDropdownOpen(false);
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

      // Fetch suppliers
      const suppliersSnapshot = await getDocs(
        query(collection(db, "suppliers"), orderBy("name", "asc"))
      );
      const suppliersData: Supplier[] = [];
      suppliersSnapshot.forEach((doc) => {
        suppliersData.push({ id: doc.id, ...doc.data() } as Supplier);
      });
      setSuppliers(suppliersData);

      // Fetch supplier payments
      const paymentsSnapshot = await getDocs(
        query(collection(db, "supplierPayments"), orderBy("createdAt", "desc"))
      );
      const paymentsData: SupplierPayment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const paymentData = doc.data();
        const supplier = suppliersData.find(
          (s) => s.id === paymentData.supplierId
        );
        paymentsData.push({
          id: doc.id,
          ...paymentData,
          supplierName: supplier?.name || "Unknown Supplier",
        } as SupplierPayment);
      });
      setPayments(paymentsData);

      // Calculate supplier balances
      await calculateSupplierBalances(suppliersData, paymentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSupplierBalances = async (
    suppliersData: Supplier[],
    paymentsData: SupplierPayment[]
  ) => {
    try {
      // Fetch order items to calculate how much we owe suppliers
      const orderItemsSnapshot = await getDocs(collection(db, "orderItems"));
      const supplierTotals: {
        [supplierId: string]: { totalOrdered: number; lastOrderDate?: string };
      } = {};

      orderItemsSnapshot.forEach((doc) => {
        const item = doc.data();
        if (item.supplierId) {
          if (!supplierTotals[item.supplierId]) {
            supplierTotals[item.supplierId] = { totalOrdered: 0 };
          }
          supplierTotals[item.supplierId].totalOrdered += item.total || 0;

          // Track last order date
          if (item.createdAt) {
            const currentLast = supplierTotals[item.supplierId].lastOrderDate;
            if (
              !currentLast ||
              new Date(item.createdAt) > new Date(currentLast)
            ) {
              supplierTotals[item.supplierId].lastOrderDate = item.createdAt;
            }
          }
        }
      });

      // Calculate payment totals
      const paymentTotals: {
        [supplierId: string]: { totalPaid: number; lastPaymentDate?: string };
      } = {};
      paymentsData.forEach((payment) => {
        if (!paymentTotals[payment.supplierId]) {
          paymentTotals[payment.supplierId] = { totalPaid: 0 };
        }
        paymentTotals[payment.supplierId].totalPaid += payment.amount;

        // Track last payment date
        const currentLast = paymentTotals[payment.supplierId].lastPaymentDate;
        if (!currentLast || new Date(payment.date) > new Date(currentLast)) {
          paymentTotals[payment.supplierId].lastPaymentDate = payment.date;
        }
      });

      // Create balance summary
      const balances: SupplierBalance[] = suppliersData.map((supplier) => {
        const totalOrdered = supplierTotals[supplier.id]?.totalOrdered || 0;
        const totalPaid = paymentTotals[supplier.id]?.totalPaid || 0;
        const balance = totalOrdered - totalPaid;

        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          totalOrdered,
          totalPaid,
          balance,
          lastPaymentDate: paymentTotals[supplier.id]?.lastPaymentDate,
          lastOrderDate: supplierTotals[supplier.id]?.lastOrderDate,
        };
      });

      // Sort by balance (highest debt first)
      balances.sort((a, b) => b.balance - a.balance);
      setSupplierBalances(balances);
    } catch (error) {
      console.error("Error calculating supplier balances:", error);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...payments];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (payment) =>
          payment.supplierName
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          (payment.notes &&
            payment.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (payment.checkNumber &&
            payment.checkNumber
              .toLowerCase()
              .includes(searchTerm.toLowerCase()))
      );
    }

    // Apply supplier filter
    if (selectedSupplier) {
      filtered = filtered.filter(
        (payment) => payment.supplierId === selectedSupplier
      );
    }

    // Apply type filter
    if (selectedType) {
      filtered = filtered.filter((payment) => payment.type === selectedType);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy.field) {
        case "supplierName":
          aValue = a.supplierName;
          bValue = b.supplierName;
          break;
        case "amount":
          aValue = a.amount;
          bValue = b.amount;
          break;
        case "date":
          aValue = new Date(a.date);
          bValue = new Date(b.date);
          break;
        case "type":
          aValue = a.type;
          bValue = b.type;
          break;
        default:
          aValue = a.date;
          bValue = b.date;
      }

      if (aValue < bValue) return sortBy.order === "asc" ? -1 : 1;
      if (aValue > bValue) return sortBy.order === "asc" ? 1 : -1;
      return 0;
    });

    // Apply pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setFilteredPayments(filtered.slice(startIndex, endIndex));
  };

  const applyBalanceFiltersAndSort = () => {
    let filtered = [...supplierBalances];

    // Apply search
    if (balanceSearchTerm) {
      filtered = filtered.filter((balance) =>
        balance.supplierName
          .toLowerCase()
          .includes(balanceSearchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (balanceSortBy.field) {
        case "supplierName":
          aValue = a.supplierName;
          bValue = b.supplierName;
          break;
        case "totalOrdered":
          aValue = a.totalOrdered;
          bValue = b.totalOrdered;
          break;
        case "totalPaid":
          aValue = a.totalPaid;
          bValue = b.totalPaid;
          break;
        case "balance":
          aValue = a.balance;
          bValue = b.balance;
          break;
        default:
          aValue = a.balance;
          bValue = b.balance;
      }

      if (aValue < bValue) return balanceSortBy.order === "asc" ? -1 : 1;
      if (aValue > bValue) return balanceSortBy.order === "asc" ? 1 : -1;
      return 0;
    });

    // Apply pagination
    const startIndex = (balanceCurrentPage - 1) * balanceItemsPerPage;
    const endIndex = startIndex + balanceItemsPerPage;
    setFilteredBalances(filtered.slice(startIndex, endIndex));
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentForm.supplierId || !paymentForm.amount) {
      alert("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      const supplier = suppliers.find((s) => s.id === paymentForm.supplierId);
      const newPayment = {
        supplierId: paymentForm.supplierId,
        supplierName: supplier?.name || "",
        amount: parseFloat(paymentForm.amount),
        date: paymentForm.date,
        type: paymentForm.type,
        notes: paymentForm.notes,
        checkNumber:
          paymentForm.type === "check" ? paymentForm.checkNumber : "",
        checkBank: paymentForm.type === "check" ? paymentForm.checkBank : "",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "supplierPayments"), newPayment);

      setShowAddModal(false);
      setPaymentForm({
        supplierId: "",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        notes: "",
        checkNumber: "",
        checkBank: "",
      });
      setSupplierSearchTerm("");
      setIsSupplierDropdownOpen(false);
      setSelectedSupplierIndex(-1);

      fetchData();
      alert("تم إضافة الدفعة بنجاح!");
    } catch (error) {
      console.error("Error adding payment:", error);
      alert("حدث خطأ أثناء إضافة الدفعة");
    }
  };

  const handleEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingPayment || !paymentForm.supplierId || !paymentForm.amount) {
      alert("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      const supplier = suppliers.find((s) => s.id === paymentForm.supplierId);
      const updatedPayment = {
        supplierId: paymentForm.supplierId,
        supplierName: supplier?.name || "",
        amount: parseFloat(paymentForm.amount),
        date: paymentForm.date,
        type: paymentForm.type,
        notes: paymentForm.notes,
        checkNumber:
          paymentForm.type === "check" ? paymentForm.checkNumber : "",
        checkBank: paymentForm.type === "check" ? paymentForm.checkBank : "",
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(
        doc(db, "supplierPayments", editingPayment.id),
        updatedPayment
      );

      setShowEditModal(false);
      setEditingPayment(null);
      setEditSupplierSearchTerm("");
      setIsEditSupplierDropdownOpen(false);
      setSelectedEditSupplierIndex(-1);

      fetchData();
      alert("تم تحديث الدفعة بنجاح!");
    } catch (error) {
      console.error("Error updating payment:", error);
      alert("حدث خطأ أثناء تحديث الدفعة");
    }
  };

  const handleDeletePayment = async (payment: SupplierPayment) => {
    if (
      !confirm(
        `هل أنت متأكد من حذف دفعة ${payment.supplierName} بقيمة ${payment.amount} ₪؟`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "supplierPayments", payment.id));
      fetchData();
      alert("تم حذف الدفعة بنجاح!");
    } catch (error) {
      console.error("Error deleting payment:", error);
      alert("حدث خطأ أثناء حذف الدفعة");
    }
  };

  const openEditModal = (payment: SupplierPayment) => {
    setEditingPayment(payment);
    const supplier = suppliers.find((s) => s.id === payment.supplierId);
    setPaymentForm({
      supplierId: payment.supplierId,
      amount: payment.amount.toString(),
      date: payment.date,
      type: payment.type,
      notes: payment.notes || "",
      checkNumber: payment.checkNumber || "",
      checkBank: payment.checkBank || "",
    });
    setEditSupplierSearchTerm(supplier?.name || "");
    setShowEditModal(true);
  };

  const handleSort = (field: string) => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const handleBalanceSort = (field: string) => {
    setBalanceSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedSupplier("");
    setSelectedType("");
    setCurrentPage(1);
    setBalanceSearchTerm("");
    setBalanceCurrentPage(1);
  };

  // Print functionality
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const currentDate = new Date().toLocaleDateString("ar-EG");
    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>دفعات الموردين</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            direction: rtl; 
            text-align: right; 
            background: white;
            color: black;
            line-height: 1.4;
          }
          .print-header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #000; 
            padding-bottom: 20px; 
          }
          .print-header h1 { 
            font-size: 24px; 
            margin-bottom: 10px; 
            color: #000;
            font-weight: bold;
          }
          .print-date { 
            font-size: 14px; 
            color: #333; 
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          th, td { 
            border: 2px solid #000; 
            padding: 10px 8px; 
            text-align: center; 
            font-size: 12px;
            background: white;
            color: black;
          }
          th { 
            background-color: #f0f0f0 !important; 
            font-weight: bold;
            border: 2px solid #000;
          }
          .section-title { 
            font-size: 18px; 
            font-weight: bold; 
            margin: 25px 0 15px 0;
            color: #000;
            text-align: center;
            border-bottom: 1px solid #000;
            padding-bottom: 5px;
          }
          @media print { 
            body { 
              margin: 0 !important; 
              padding: 15px !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            table { 
              page-break-inside: avoid;
              border: 2px solid #000 !important;
            }
            th, td { 
              border: 2px solid #000 !important;
              background: white !important;
              color: black !important;
            }
            th {
              background-color: #f0f0f0 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>دفعات الموردين</h1>
          <div class="print-date">تاريخ الطباعة: ${currentDate}</div>
        </div>
        
        <div class="section-title">الدفعات</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">المورد</th>
              <th style="width: 15%;">المبلغ (₪)</th>
              <th style="width: 15%;">التاريخ</th>
              <th style="width: 15%;">النوع</th>
              <th style="width: 30%;">الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayments
              .map(
                (payment) => `
              <tr>
                <td style="font-weight: bold;">${payment.supplierName}</td>
                <td style="font-weight: bold; color: #000;">${payment.amount.toLocaleString()}</td>
                <td>${new Date(payment.date).toLocaleDateString("ar-EG")}</td>
                <td>${
                  payment.type === "cash"
                    ? "نقدي"
                    : payment.type === "check"
                    ? "شيك"
                    : "حوالة"
                }</td>
                <td>${payment.notes || "-"}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>

        <div class="section-title">أرصدة الموردين</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">اسم المورد</th>
              <th style="width: 25%;">إجمالي الطلبات (₪)</th>
              <th style="width: 25%;">إجمالي المدفوع (₪)</th>
              <th style="width: 25%;">الرصيد المستحق (₪)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredBalances
              .map(
                (balance) => `
              <tr>
                <td style="font-weight: bold;">${balance.supplierName}</td>
                <td>${balance.totalOrdered.toLocaleString()}</td>
                <td>${balance.totalPaid.toLocaleString()}</td>
                <td style="font-weight: bold; color: ${
                  balance.balance > 0 ? "#000" : "#000"
                };">${balance.balance.toLocaleString()}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        
        <div class="section-title">ملخص الدفعات</div>
        <table style="width: 50%; margin: 0 auto;">
          <tbody>
            <tr>
              <td style="font-weight: bold; background-color: #f0f0f0;">إجمالي عدد الدفعات</td>
              <td style="font-weight: bold;">${filteredPayments.length}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; background-color: #f0f0f0;">إجمالي المدفوع (₪)</td>
              <td style="font-weight: bold;">${filteredPayments
                .reduce((sum, payment) => sum + payment.amount, 0)
                .toLocaleString()}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; background-color: #f0f0f0;">عدد الموردين</td>
              <td style="font-weight: bold;">${filteredBalances.length}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Custom dropdown functions
  const getFilteredSuppliers = (searchTerm: string) => {
    return suppliers.filter((supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleSupplierSelect = (supplier: Supplier, isEdit = false) => {
    if (isEdit) {
      setPaymentForm({ ...paymentForm, supplierId: supplier.id });
      setEditSupplierSearchTerm(supplier.name);
      setIsEditSupplierDropdownOpen(false);
      setSelectedEditSupplierIndex(-1);
    } else {
      setPaymentForm({ ...paymentForm, supplierId: supplier.id });
      setSupplierSearchTerm(supplier.name);
      setIsSupplierDropdownOpen(false);
      setSelectedSupplierIndex(-1);
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

  const handleSupplierKeyDown = (e: React.KeyboardEvent, isEdit = false) => {
    const filteredSuppliers = getFilteredSuppliers(
      isEdit ? editSupplierSearchTerm : supplierSearchTerm
    );
    const selectedIndex = isEdit
      ? selectedEditSupplierIndex
      : selectedSupplierIndex;
    const setSelectedIndex = isEdit
      ? setSelectedEditSupplierIndex
      : setSelectedSupplierIndex;
    const setDropdownOpen = isEdit
      ? setIsEditSupplierDropdownOpen
      : setIsSupplierDropdownOpen;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        const newDownIndex = Math.min(
          selectedIndex + 1,
          filteredSuppliers.length - 1
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
        if (selectedIndex >= 0 && selectedIndex < filteredSuppliers.length) {
          handleSupplierSelect(filteredSuppliers[selectedIndex], isEdit);
        }
        break;
      case "Escape":
        e.preventDefault();
        setDropdownOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const totalPayments = payments.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );
  const totalBalance = supplierBalances.reduce(
    (sum, balance) => sum + balance.balance,
    0
  );

  return (
    <div className="supplier-payments">
      <div className="page-header">
        <h1>دفعات الموردين</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handlePrint}
            title="طباعة التقرير"
          >
            <Printer size={20} />
            طباعة
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={20} />
            إضافة دفعة
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          className={`tab ${!showBalanceView ? "active" : ""}`}
          onClick={() => setShowBalanceView(false)}
        >
          <CreditCard size={18} />
          الدفعات
        </button>
        <button
          className={`tab ${showBalanceView ? "active" : ""}`}
          onClick={() => setShowBalanceView(true)}
        >
          <User size={18} />
          أرصدة الموردين
        </button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon">
            <DollarSign size={24} />
          </div>
          <div className="summary-content">
            <h3>إجمالي المدفوعات</h3>
            <p className="summary-amount">{totalPayments.toFixed(2)} ₪</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <User size={24} />
          </div>
          <div className="summary-content">
            <h3>عدد الموردين</h3>
            <p className="summary-amount">{suppliers.length}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <Calendar size={24} />
          </div>
          <div className="summary-content">
            <h3>إجمالي المستحقات</h3>
            <p className="summary-amount">{totalBalance.toFixed(2)} ₪</p>
          </div>
        </div>
      </div>

      {showBalanceView ? (
        /* Supplier Balances View */
        <>
          <div className="section">
            <h2>أرصدة الموردين</h2>

            {/* Balance Filters */}
            <div className="filters">
              <div className="filter-group">
                <Search size={20} />
                <input
                  type="text"
                  placeholder="البحث في الموردين..."
                  value={balanceSearchTerm}
                  onChange={(e) => setBalanceSearchTerm(e.target.value)}
                />
              </div>

              <button className="btn btn-secondary" onClick={resetFilters}>
                <Filter size={18} />
                إعادة تعيين
              </button>
            </div>

            {/* Balances Table */}
            <div className="table-container">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th onClick={() => handleBalanceSort("supplierName")}>
                      اسم المورد
                      {balanceSortBy.field === "supplierName" &&
                        (balanceSortBy.order === "asc" ? (
                          <SortAsc size={16} />
                        ) : (
                          <SortDesc size={16} />
                        ))}
                    </th>
                    <th onClick={() => handleBalanceSort("totalOrdered")}>
                      إجمالي الطلبات
                      {balanceSortBy.field === "totalOrdered" &&
                        (balanceSortBy.order === "asc" ? (
                          <SortAsc size={16} />
                        ) : (
                          <SortDesc size={16} />
                        ))}
                    </th>
                    <th onClick={() => handleBalanceSort("totalPaid")}>
                      إجمالي المدفوع
                      {balanceSortBy.field === "totalPaid" &&
                        (balanceSortBy.order === "asc" ? (
                          <SortAsc size={16} />
                        ) : (
                          <SortDesc size={16} />
                        ))}
                    </th>
                    <th onClick={() => handleBalanceSort("balance")}>
                      الرصيد المستحق
                      {balanceSortBy.field === "balance" &&
                        (balanceSortBy.order === "asc" ? (
                          <SortAsc size={16} />
                        ) : (
                          <SortDesc size={16} />
                        ))}
                    </th>
                    <th>آخر دفعة</th>
                    <th>آخر طلب</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center">
                        لا توجد أرصدة
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map((balance) => (
                      <tr key={balance.supplierId}>
                        <td>{balance.supplierName}</td>
                        <td className="amount">
                          {balance.totalOrdered.toFixed(2)} ₪
                        </td>
                        <td className="amount">
                          {balance.totalPaid.toFixed(2)} ₪
                        </td>
                        <td
                          className={`amount ${
                            balance.balance > 0
                              ? "debt"
                              : balance.balance < 0
                              ? "credit"
                              : ""
                          }`}
                        >
                          {balance.balance.toFixed(2)} ₪
                        </td>
                        <td>
                          {balance.lastPaymentDate
                            ? new Date(
                                balance.lastPaymentDate
                              ).toLocaleDateString("en-US")
                            : "لا توجد دفعات"}
                        </td>
                        <td>
                          {balance.lastOrderDate
                            ? new Date(
                                balance.lastOrderDate
                              ).toLocaleDateString("en-US")
                            : "لا توجد طلبات"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Balance Pagination */}
            {supplierBalances.length > balanceItemsPerPage && (
              <div className="pagination">
                <button
                  onClick={() =>
                    setBalanceCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={balanceCurrentPage === 1}
                  className="pagination-btn"
                >
                  <ChevronRight size={16} />
                  السابق
                </button>

                <span className="pagination-info">
                  صفحة {balanceCurrentPage} من{" "}
                  {Math.ceil(supplierBalances.length / balanceItemsPerPage)}
                </span>

                <button
                  onClick={() =>
                    setBalanceCurrentPage((prev) =>
                      Math.min(
                        Math.ceil(
                          supplierBalances.length / balanceItemsPerPage
                        ),
                        prev + 1
                      )
                    )
                  }
                  disabled={
                    balanceCurrentPage ===
                    Math.ceil(supplierBalances.length / balanceItemsPerPage)
                  }
                  className="pagination-btn"
                >
                  التالي
                  <ChevronLeft size={16} />
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Payments View */
        <>
          {/* Filters */}
          <div className="filters">
            <div className="filter-group">
              <Search size={20} />
              <input
                type="text"
                placeholder="البحث في الدفعات..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="">جميع الموردين</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">جميع الأنواع</option>
              <option value="cash">نقد</option>
              <option value="check">شيك</option>
              <option value="transfer">تحويل</option>
            </select>

            <button className="btn btn-secondary" onClick={resetFilters}>
              <Filter size={18} />
              إعادة تعيين
            </button>
          </div>

          {/* Payments Table */}
          <div className="table-container">
            <table className="payments-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("supplierName")}>
                    المورد
                    {sortBy.field === "supplierName" &&
                      (sortBy.order === "asc" ? (
                        <SortAsc size={16} />
                      ) : (
                        <SortDesc size={16} />
                      ))}
                  </th>
                  <th onClick={() => handleSort("amount")}>
                    المبلغ
                    {sortBy.field === "amount" &&
                      (sortBy.order === "asc" ? (
                        <SortAsc size={16} />
                      ) : (
                        <SortDesc size={16} />
                      ))}
                  </th>
                  <th onClick={() => handleSort("date")}>
                    التاريخ
                    {sortBy.field === "date" &&
                      (sortBy.order === "asc" ? (
                        <SortAsc size={16} />
                      ) : (
                        <SortDesc size={16} />
                      ))}
                  </th>
                  <th onClick={() => handleSort("type")}>
                    النوع
                    {sortBy.field === "type" &&
                      (sortBy.order === "asc" ? (
                        <SortAsc size={16} />
                      ) : (
                        <SortDesc size={16} />
                      ))}
                  </th>
                  <th>ملاحظات</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center">
                      لا توجد دفعات
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.supplierName}</td>
                      <td className="amount">{payment.amount.toFixed(2)} ₪</td>
                      <td>
                        {new Date(payment.date).toLocaleDateString("en-US")}
                      </td>
                      <td>
                        <span className={`type-badge ${payment.type}`}>
                          {payment.type === "cash"
                            ? "نقد"
                            : payment.type === "check"
                            ? "شيك"
                            : "تحويل"}
                        </span>
                      </td>
                      <td>{payment.notes}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEditModal(payment)}
                            title="تعديل"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeletePayment(payment)}
                            title="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Payments Pagination */}
          {payments.length > itemsPerPage && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                <ChevronRight size={16} />
                السابق
              </button>

              <span className="pagination-info">
                صفحة {currentPage} من{" "}
                {Math.ceil(payments.length / itemsPerPage)}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((prev) =>
                    Math.min(
                      Math.ceil(payments.length / itemsPerPage),
                      prev + 1
                    )
                  )
                }
                disabled={
                  currentPage === Math.ceil(payments.length / itemsPerPage)
                }
                className="pagination-btn"
              >
                التالي
                <ChevronLeft size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Add Payment Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة دفعة جديدة</h3>
              <button
                className="modal-close"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddPayment}>
              <div className="form-group">
                <label>المورد *</label>
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={supplierSearchTerm}
                    onChange={(e) => {
                      setSupplierSearchTerm(e.target.value);
                      setIsSupplierDropdownOpen(true);
                      setSelectedSupplierIndex(-1);
                    }}
                    onKeyDown={(e) => handleSupplierKeyDown(e, false)}
                    onFocus={() => setIsSupplierDropdownOpen(true)}
                    placeholder="ابحث عن المورد أو اختر من القائمة"
                    required={!paymentForm.supplierId}
                  />
                  {isSupplierDropdownOpen && (
                    <div className="dropdown-options">
                      {getFilteredSuppliers(supplierSearchTerm).map(
                        (supplier, index) => (
                          <div
                            key={supplier.id}
                            className={`dropdown-option ${
                              index === selectedSupplierIndex
                                ? "highlighted"
                                : ""
                            } ${
                              paymentForm.supplierId === supplier.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleSupplierSelect(supplier, false)
                            }
                          >
                            {supplier.name}
                          </div>
                        )
                      )}
                      {getFilteredSuppliers(supplierSearchTerm).length ===
                        0 && (
                        <div className="dropdown-option disabled">
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>المبلغ *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>التاريخ *</label>
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, date: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>نوع الدفع *</label>
                <select
                  value={paymentForm.type}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      type: e.target.value as any,
                    })
                  }
                  required
                >
                  <option value="cash">نقد</option>
                  <option value="check">شيك</option>
                  <option value="transfer">تحويل</option>
                </select>
              </div>

              {paymentForm.type === "check" && (
                <>
                  <div className="form-group">
                    <label>رقم الشيك</label>
                    <input
                      type="text"
                      value={paymentForm.checkNumber}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkNumber: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>البنك</label>
                    <input
                      type="text"
                      value={paymentForm.checkBank}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkBank: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </button>
                <button type="submit">إضافة الدفعة</button>
              </div>
            </form>
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
                className="modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditPayment}>
              <div className="form-group">
                <label>المورد *</label>
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={editSupplierSearchTerm}
                    onChange={(e) => {
                      setEditSupplierSearchTerm(e.target.value);
                      setIsEditSupplierDropdownOpen(true);
                      setSelectedEditSupplierIndex(-1);
                    }}
                    onKeyDown={(e) => handleSupplierKeyDown(e, true)}
                    onFocus={() => setIsEditSupplierDropdownOpen(true)}
                    placeholder="ابحث عن المورد أو اختر من القائمة"
                    required={!paymentForm.supplierId}
                  />
                  {isEditSupplierDropdownOpen && (
                    <div className="dropdown-options">
                      {getFilteredSuppliers(editSupplierSearchTerm).map(
                        (supplier, index) => (
                          <div
                            key={supplier.id}
                            className={`dropdown-option ${
                              index === selectedEditSupplierIndex
                                ? "highlighted"
                                : ""
                            } ${
                              paymentForm.supplierId === supplier.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => handleSupplierSelect(supplier, true)}
                          >
                            {supplier.name}
                          </div>
                        )
                      )}
                      {getFilteredSuppliers(editSupplierSearchTerm).length ===
                        0 && (
                        <div className="dropdown-option disabled">
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>المبلغ *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>التاريخ *</label>
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, date: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>نوع الدفع *</label>
                <select
                  value={paymentForm.type}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      type: e.target.value as any,
                    })
                  }
                  required
                >
                  <option value="cash">نقد</option>
                  <option value="check">شيك</option>
                  <option value="transfer">تحويل</option>
                </select>
              </div>

              {paymentForm.type === "check" && (
                <>
                  <div className="form-group">
                    <label>رقم الشيك</label>
                    <input
                      type="text"
                      value={paymentForm.checkNumber}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkNumber: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label>البنك</label>
                    <input
                      type="text"
                      value={paymentForm.checkBank}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkBank: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowEditModal(false)}>
                  إلغاء
                </button>
                <button type="submit">حفظ التغييرات</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
