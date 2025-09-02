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
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  SortAsc,
  SortDesc,
  Edit,
  Trash2,
  Printer,
  Upload,
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
import { CacheManager, createCacheKey } from "../utils/cache";
import "./Checks.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface CustomerCheck {
  id: string;
  customerId: string;
  customerName: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: "pending" | "collected" | "returned" | "overdue" | "غير محدد";
  notes?: string;
  nameOnCheck?: string;
  autoCollected?: boolean;
  autoCollectedAt?: string;
  createdAt: string;
}

export function Checks() {
  const [checks, setChecks] = useState<CustomerCheck[]>([]);
  const [filteredChecks, setFilteredChecks] = useState<CustomerCheck[]>([]);
  const [paginatedChecks, setPaginatedChecks] = useState<CustomerCheck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    customer: "all",
    status: "all",
    dueDateFilter: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "dueDate",
    order: "asc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CustomerCheck | null>(
    null
  );
  const [checkForm, setCheckForm] = useState({
    customerId: "",
    checkNumber: "",
    bank: "",
    amount: 0,
    dueDate: new Date().toISOString().split("T")[0],
    notes: "",
    nameOnCheck: "",
  });

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState({
    customerId: "",
    file: null as File | null,
  });
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [checks, searchTerm, filters, sortBy, currentPage, itemsPerPage]);

  const fetchData = async (forceRefresh = false) => {
    try {
      setLoading(true);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedChecks = CacheManager.get<CustomerCheck[]>(
          CacheManager.KEYS.CHECKS
        );
        const cachedCustomers = CacheManager.get<Customer[]>(
          CacheManager.KEYS.CUSTOMERS
        );

        if (cachedChecks && cachedCustomers) {
          setChecks(cachedChecks);
          setCustomers(cachedCustomers);
          setLoading(false);
          return;
        }
      }

      // Fetch customers
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);

      // Fetch customer checks with customer names
      const checksSnapshot = await getDocs(
        query(collection(db, "customerChecks"), orderBy("dueDate", "asc"))
      );
      const checksData: CustomerCheck[] = [];
      checksSnapshot.forEach((checkDoc) => {
        const checkData = checkDoc.data();
        const customer = customersData.find(
          (c) => c.id === checkData.customerId
        );
        const check: CustomerCheck = {
          id: checkDoc.id,
          customerId: checkData.customerId,
          checkNumber: checkData.checkNumber,
          bank: checkData.bank,
          amount: checkData.amount,
          dueDate: checkData.dueDate,
          status: checkData.status,
          notes: checkData.notes,
          nameOnCheck: checkData.nameOnCheck,
          autoCollected: checkData.autoCollected,
          autoCollectedAt: checkData.autoCollectedAt,
          createdAt: checkData.createdAt,
          customerName: customer?.name || "Unknown Customer",
        };

        // Auto-mark as collected if due date has passed
        if (
          (check.status === "pending" || check.status === "غير محدد") &&
          new Date(check.dueDate) < new Date()
        ) {
          check.status = "collected";
          // Update the status in the database
          updateDoc(doc(db, "customerChecks", check.id), {
            status: "collected",
            autoCollected: true,
            autoCollectedAt: new Date().toISOString(),
          }).catch((error) => {
            console.error("Error auto-updating check status:", error);
          });
        }

        checksData.push(check);
      });

      // Cache the data
      CacheManager.set(CacheManager.KEYS.CHECKS, checksData);
      CacheManager.set(CacheManager.KEYS.CUSTOMERS, customersData);

      setChecks(checksData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...checks];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (check) =>
          check.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.checkNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply customer filter
    if (filters.customer !== "all") {
      filtered = filtered.filter(
        (check) => check.customerId === filters.customer
      );
    }

    // Apply status filter
    if (filters.status !== "all") {
      filtered = filtered.filter((check) => check.status === filters.status);
    }

    // Apply due date filters
    if (filters.dueDateFilter !== "all") {
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );

      switch (filters.dueDateFilter) {
        case "today":
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return (
              dueDate >= startOfDay &&
              dueDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
            );
          });
          break;
        case "week":
          const endOfWeek = new Date(
            startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000
          );
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return dueDate >= startOfDay && dueDate < endOfWeek;
          });
          break;
        case "month":
          const endOfMonth = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0
          );
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return dueDate >= startOfDay && dueDate <= endOfMonth;
          });
          break;
        case "range":
          if (filters.dateFrom) {
            filtered = filtered.filter(
              (check) => new Date(check.dueDate) >= new Date(filters.dateFrom)
            );
          }
          if (filters.dateTo) {
            filtered = filtered.filter(
              (check) => new Date(check.dueDate) <= new Date(filters.dateTo)
            );
          }
          break;
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof CustomerCheck];
      let bValue: any = b[sortBy.field as keyof CustomerCheck];

      if (sortBy.field === "dueDate") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredChecks(filtered);

    // Calculate pagination
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    setTotalPages(totalPages);

    // Reset to first page if current page is beyond total pages
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }

    // Get paginated data
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    setPaginatedChecks(paginated);
  };

  const handleAddCheck = async () => {
    try {
      const newCheck = {
        ...checkForm,
        status: "pending" as CustomerCheck["status"],
        createdAt: new Date().toISOString(),
      };

      // Add the check
      const checkRef = await addDoc(collection(db, "customerChecks"), newCheck);
      const newCheckWithId = {
        id: checkRef.id,
        ...newCheck,
        customerName:
          customers.find((c) => c.id === checkForm.customerId)?.name ||
          "Unknown Customer",
      };

      // Update cache
      CacheManager.addArrayItem(CacheManager.KEYS.CHECKS, newCheckWithId);

      // Also add it as a payment
      const customer = customers.find((c) => c.id === checkForm.customerId);
      const newPayment = {
        customerId: checkForm.customerId,
        customerName: customer?.name || "",
        date: new Date().toISOString().split("T")[0], // Use current date for payment
        type: "check" as "cash" | "check",
        amount: checkForm.amount,
        notes: checkForm.notes || `دفعة شيك - ${checkForm.notes || ""}`,
        checkNumber: checkForm.checkNumber,
        checkBank: checkForm.bank,
        checkDate: checkForm.dueDate, // Use due date as check date
        nameOnCheck: checkForm.nameOnCheck || customer?.name || "",
        createdAt: new Date().toISOString(),
      };

      console.log("Creating new payment from check:", newPayment);
      const paymentRef = await addDoc(collection(db, "payments"), newPayment);
      console.log("Payment created with ID:", paymentRef.id);

      // Show success message
      alert("تم إضافة الشيك والدفعة بنجاح!");

      setShowAddModal(false);
      setCheckForm({
        customerId: "",
        checkNumber: "",
        bank: "",
        amount: 0,
        dueDate: new Date().toISOString().split("T")[0],
        notes: "",
        nameOnCheck: "",
      });
    } catch (error) {
      console.error("Error adding check:", error);
    }
  };

  const handleEditCheck = async () => {
    if (!selectedCheck) return;

    try {
      const updatedCheck = {
        ...checkForm,
      };

      // Update the check
      await updateDoc(
        doc(db, "customerChecks", selectedCheck.id),
        updatedCheck
      );

      // Update cache
      const updatedCheckWithId = {
        ...selectedCheck,
        ...updatedCheck,
        customerName:
          customers.find((c) => c.id === checkForm.customerId)?.name ||
          "Unknown Customer",
      };
      CacheManager.updateArrayItem(
        CacheManager.KEYS.CHECKS,
        selectedCheck.id,
        updatedCheckWithId
      );

      // Also update the corresponding payment
      const customer = customers.find((c) => c.id === checkForm.customerId);
      const updatedPayment = {
        customerId: checkForm.customerId,
        customerName: customer?.name || "",
        date: new Date().toISOString().split("T")[0], // Use current date for payment
        type: "check" as "cash" | "check",
        amount: checkForm.amount,
        notes: checkForm.notes || `دفعة شيك - ${checkForm.notes || ""}`,
        checkNumber: checkForm.checkNumber,
        checkBank: checkForm.bank,
        checkDate: checkForm.dueDate, // Use due date as check date
        nameOnCheck: checkForm.nameOnCheck || customer?.name || "",
        updatedAt: new Date().toISOString(),
      };

      // Find and update the corresponding payment
      const paymentsSnapshot = await getDocs(
        query(
          collection(db, "payments"),
          where("checkNumber", "==", selectedCheck.checkNumber),
          where("customerId", "==", selectedCheck.customerId),
          where("type", "==", "check")
        )
      );

      if (!paymentsSnapshot.empty) {
        const paymentDoc = paymentsSnapshot.docs[0];
        await updateDoc(doc(db, "payments", paymentDoc.id), updatedPayment);
        console.log("Updated corresponding payment:", paymentDoc.id);
      }

      alert("تم تحديث الشيك والدفعة بنجاح!");
      setShowEditModal(false);
      setSelectedCheck(null);
      setCheckForm({
        customerId: "",
        checkNumber: "",
        bank: "",
        amount: 0,
        dueDate: new Date().toISOString().split("T")[0],
        notes: "",
        nameOnCheck: "",
      });
    } catch (error) {
      console.error("Error updating check:", error);
    }
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;

    try {
      // Delete the check
      await deleteDoc(doc(db, "customerChecks", selectedCheck.id));

      // Update cache
      CacheManager.removeArrayItem(CacheManager.KEYS.CHECKS, selectedCheck.id);

      // Also delete the corresponding payment if it exists
      const paymentsSnapshot = await getDocs(
        query(
          collection(db, "payments"),
          where("checkNumber", "==", selectedCheck.checkNumber),
          where("customerId", "==", selectedCheck.customerId),
          where("type", "==", "check")
        )
      );

      if (!paymentsSnapshot.empty) {
        const paymentDoc = paymentsSnapshot.docs[0];
        await deleteDoc(doc(db, "payments", paymentDoc.id));
        console.log("Deleted corresponding payment:", paymentDoc.id);
      }

      setShowDeleteModal(false);
      setSelectedCheck(null);
    } catch (error) {
      console.error("Error deleting check:", error);
    }
  };

  const handleStatusUpdate = async (
    checkId: string,
    newStatus: CustomerCheck["status"]
  ) => {
    try {
      await updateDoc(doc(db, "customerChecks", checkId), {
        status: newStatus,
      });
      fetchData();
    } catch (error) {
      console.error("Error updating check status:", error);
    }
  };

  const openEditModal = (check: CustomerCheck) => {
    setSelectedCheck(check);
    setCheckForm({
      customerId: check.customerId,
      checkNumber: check.checkNumber,
      bank: check.bank,
      amount: check.amount,
      dueDate: check.dueDate,
      notes: check.notes || "",
      nameOnCheck: check.nameOnCheck || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (check: CustomerCheck) => {
    setSelectedCheck(check);
    setShowDeleteModal(true);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "collected":
        return <CheckCircle className="status-icon" />;
      case "pending":
        return <Clock className="status-icon" />;
      case "returned":
        return <XCircle className="status-icon" />;
      case "overdue":
        return <AlertCircle className="status-icon" />;
      default:
        return <Clock className="status-icon" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "collected":
        return "محصّل";
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

  const getStatusClass = (status: string) => {
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

  const printChecks = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>شيكات العملاء</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .status-pending { color: #f59e0b; }
              .status-collected { color: #10b981; }
              .status-returned { color: #ef4444; }
              .status-overdue { color: #dc2626; }
              .summary { margin-top: 20px; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>شيكات العملاء</h1>
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-US")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>رقم الشيك</th>
                  <th>البنك</th>
                  <th>الاسم على الشيك</th>
                  <th>المبلغ</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${filteredChecks
                  .map(
                    (check) => `
                  <tr>
                    <td>${check.customerName}</td>
                    <td>${check.checkNumber}</td>
                    <td>${check.bank}</td>
                    <td>${check.nameOnCheck || "-"}</td>
                    <td>${check.amount.toLocaleString("en-IL", {
                      style: "currency",
                      currency: "ILS",
                    })}</td>
                    <td>${new Date(check.dueDate).toLocaleDateString(
                      "en-US"
                    )}</td>
                    <td class="status-${check.status}">${getStatusText(
                      check.status
                    )}</td>
                    <td>${check.notes || "-"}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <p><strong>إجمالي الشيكات:</strong> ${filteredChecks.length}</p>
              <p><strong>إجمالي المبالغ:</strong> ${filteredChecks
                .reduce((sum, check) => sum + check.amount, 0)
                .toLocaleString("en-IL", {
                  style: "currency",
                  currency: "ILS",
                })}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing checks:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  // Import functions
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportForm({ ...importForm, file });
      parseCSVFile(file);
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n");
      const headers = lines[0].split(",");

      const parsedData = lines
        .slice(1)
        .map((line, index) => {
          if (line.trim()) {
            const values = line.split(",");
            // Skip rows where cumulative account (values[0]) is empty or invalid
            // This helps avoid importing incorrect checks
            if (
              !values[0] ||
              values[0].trim() === "" ||
              values[8]?.trim() === ""
            ) {
              return null;
            }
            return {
              row: index + 2,
              checkNumber: values[8]?.trim() || "",
              amount: parseFloat(values[7]) || 0,
              dueDate: values[4]?.trim() || "",
              bank: values[3]?.trim() || "",
              notes: values[1]?.trim() || "",
              nameOnCheck: values[2]?.trim() || "",
            };
          }
          return null;
        })
        .filter(Boolean);

      setImportPreview(parsedData);
    };
    reader.readAsText(file);
  };

  const handleImportChecks = async () => {
    if (
      !importForm.customerId ||
      !importForm.file ||
      importPreview.length === 0
    ) {
      alert("يرجى اختيار العميل ورفع الملف");
      return;
    }

    setImporting(true);
    try {
      const customer = customers.find((c) => c.id === importForm.customerId);
      if (!customer) {
        alert("العميل المحدد غير موجود");
        return;
      }

      // Get existing check numbers to avoid duplicates
      const existingCheckNumbers = checks.map((check) => check.checkNumber);

      let importedCount = 0;
      let skippedCount = 0;
      const skippedChecks: string[] = [];

      for (const checkData of importPreview) {
        // Check if check number already exists
        if (existingCheckNumbers.includes(checkData.checkNumber)) {
          skippedCount++;
          skippedChecks.push(checkData.checkNumber);
          continue;
        }

        // Convert date format from DD/MM/YYYY to YYYY-MM-DD
        const dateParts = checkData.dueDate.split("/");
        const formattedDate =
          dateParts.length === 3
            ? `${dateParts[2]}-${dateParts[1].padStart(
                2,
                "0"
              )}-${dateParts[0].padStart(2, "0")}`
            : new Date().toISOString().split("T")[0];

        const newCheck = {
          customerId: importForm.customerId,
          customerName: customer.name,
          checkNumber: checkData.checkNumber,
          bank: checkData.bank,
          amount: checkData.amount,
          dueDate: formattedDate,
          status: "غير محدد" as CustomerCheck["status"],
          notes: checkData.notes,
          nameOnCheck: checkData.nameOnCheck,
          createdAt: new Date().toISOString(),
        };

        await addDoc(collection(db, "customerChecks"), newCheck);

        // Also add it as a payment
        const newPayment = {
          customerId: importForm.customerId,
          customerName: customer.name,
          date: new Date().toISOString().split("T")[0], // Use current date for payment
          type: "check" as "cash" | "check",
          amount: checkData.amount,
          notes: checkData.notes || `دفعة شيك - ${checkData.notes || ""}`,
          checkNumber: checkData.checkNumber,
          checkBank: checkData.bank,
          checkDate: formattedDate, // Use due date as check date
          nameOnCheck: checkData.nameOnCheck || customer.name,
          createdAt: new Date().toISOString(),
        };

        await addDoc(collection(db, "payments"), newPayment);
        importedCount++;
      }

      // Show detailed import results
      let message = `تم استيراد ${importedCount} شيك ودفعة بنجاح`;
      if (skippedCount > 0) {
        message += `\nتم تخطي ${skippedCount} شيك موجود مسبقاً`;
        if (skippedChecks.length <= 5) {
          message += `\nالأرقام المتكررة: ${skippedChecks.join(", ")}`;
        } else {
          message += `\nالأرقام المتكررة: ${skippedChecks
            .slice(0, 5)
            .join(", ")} و ${skippedChecks.length - 5} أخرى`;
        }
      }

      alert(message);
      setShowImportModal(false);
      setImportForm({ customerId: "", file: null });
      setImportPreview([]);
      fetchData();
    } catch (error) {
      console.error("Error importing checks:", error);
      alert("حدث خطأ أثناء استيراد الشيكات");
    } finally {
      setImporting(false);
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

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
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

  if (loading) {
    return (
      <div className="checks-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الشيكات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checks-container">
      {/* Header */}
      <div className="checks-header">
        <div className="header-content">
          <h1>شيكات العملاء</h1>
          <p>إدارة الشيكات المستلمة من العملاء</p>
        </div>
        <div className="header-actions">
          <button className="print-btn" onClick={printChecks}>
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="import-btn"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="btn-icon" />
            استيراد شيكات
          </button>
          <button
            className="add-check-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة شيك جديد
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالعميل أو رقم الشيك أو البنك..."
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
            <label>الحالة:</label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="filter-select"
            >
              <option value="all">جميع الحالات</option>
              <option value="pending">في الانتظار</option>
              <option value="collected">محصّل</option>
              <option value="returned">مرتجع</option>
              <option value="overdue">متأخر</option>
            </select>
          </div>

          <div className="filter-group">
            <label>تاريخ الاستحقاق:</label>
            <select
              value={filters.dueDateFilter}
              onChange={(e) =>
                setFilters({ ...filters, dueDateFilter: e.target.value })
              }
              className="filter-select"
            >
              <option value="all">جميع التواريخ</option>
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
              <option value="range">نطاق مخصص</option>
            </select>
          </div>

          {filters.dueDateFilter === "range" && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Summary Section */}
      <div className="summary-section">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">
              <CreditCard />
            </div>
            <div className="summary-content">
              <h3>إجمالي الشيكات</h3>
              <p className="summary-number">{filteredChecks.length}</p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <DollarSign />
            </div>
            <div className="summary-content">
              <h3>إجمالي المبالغ</h3>
              <p className="summary-number">
                {formatCurrency(
                  filteredChecks.reduce((sum, check) => sum + check.amount, 0)
                )}
              </p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <Clock />
            </div>
            <div className="summary-content">
              <h3>في الانتظار</h3>
              <p className="summary-number">
                {
                  filteredChecks.filter(
                    (check) =>
                      check.status === "pending" || check.status === "غير محدد"
                  ).length
                }
              </p>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">
              <CheckCircle />
            </div>
            <div className="summary-content">
              <h3>محصّلة</h3>
              <p className="summary-number">
                {
                  filteredChecks.filter((check) => check.status === "collected")
                    .length
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Checks Table */}
      <div className="table-container">
        <table className="checks-table">
          <thead>
            <tr>
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
              <th>رقم الشيك</th>
              <th>البنك</th>
              <th>الاسم على الشيك</th>
              <th onClick={() => handleSort("amount")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  المبلغ
                  {getSortIcon("amount")}
                </div>
              </th>
              <th onClick={() => handleSort("dueDate")} className="sortable">
                <div className="th-content">
                  <Calendar className="th-icon" />
                  تاريخ الاستحقاق
                  {getSortIcon("dueDate")}
                </div>
              </th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedChecks.length === 0 ? (
              <tr>
                <td colSpan={9} className="no-data">
                  لا توجد شيكات
                </td>
              </tr>
            ) : (
              paginatedChecks.map((check) => (
                <tr
                  key={check.id}
                  className={`check-row ${
                    isOverdue(check.dueDate) ? "overdue" : ""
                  }`}
                >
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {check.customerName}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="check-number">{check.checkNumber}</div>
                  </td>
                  <td>
                    <div className="bank-name">{check.bank}</div>
                  </td>
                  <td>
                    <div className="name-on-check">
                      {check.nameOnCheck || "-"}
                    </div>
                  </td>
                  <td>
                    <div className="check-amount">
                      {formatCurrency(check.amount)}
                    </div>
                  </td>
                  <td>
                    <div
                      className={`due-date ${
                        isOverdue(check.dueDate) ? "overdue" : ""
                      }`}
                    >
                      {formatDate(check.dueDate)}
                    </div>
                  </td>
                  <td>
                    <div
                      className={`status-badge ${getStatusClass(check.status)}`}
                    >
                      {getStatusIcon(check.status)}
                      {getStatusText(check.status)}
                    </div>
                  </td>
                  <td>
                    <div className="check-notes">{check.notes || "-"}</div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <div className="status-update-dropdown">
                        <select
                          value={check.status}
                          onChange={(e) =>
                            handleStatusUpdate(
                              check.id,
                              e.target.value as CustomerCheck["status"]
                            )
                          }
                          className="status-select"
                        >
                          <option value="pending">في الانتظار</option>
                          <option value="collected">محصّل</option>
                          <option value="returned">مرتجع</option>
                        </select>
                      </div>
                      <button
                        className="action-btn edit"
                        onClick={() => openEditModal(check)}
                        title="تعديل"
                      >
                        <Edit />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => openDeleteModal(check)}
                        title="حذف"
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
      {filteredChecks.length > 0 && (
        <div className="pagination-container">
          <div className="pagination-info">
            <span>
              عرض {(currentPage - 1) * itemsPerPage + 1} إلى{" "}
              {Math.min(currentPage * itemsPerPage, filteredChecks.length)} من{" "}
              {filteredChecks.length} شيك
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

      {/* Add Check Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة شيك جديد</h3>
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
                <select
                  value={checkForm.customerId}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, customerId: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="">اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
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
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>البنك *</label>
                  <input
                    type="text"
                    value={checkForm.bank}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, bank: e.target.value })
                    }
                    placeholder="أدخل اسم البنك"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>الاسم على الشيك</label>
                <input
                  type="text"
                  value={checkForm.nameOnCheck}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, nameOnCheck: e.target.value })
                  }
                  placeholder="أدخل الاسم على الشيك (اختياري)"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
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
                    placeholder="أدخل المبلغ"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الاستحقاق *</label>
                  <input
                    type="date"
                    value={checkForm.dueDate}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, dueDate: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={checkForm.notes}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, notes: e.target.value })
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
                onClick={handleAddCheck}
                disabled={
                  !checkForm.customerId ||
                  !checkForm.checkNumber ||
                  !checkForm.bank ||
                  checkForm.amount <= 0 ||
                  !checkForm.dueDate
                }
              >
                إضافة الشيك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Check Modal */}
      {showEditModal && selectedCheck && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل الشيك</h3>
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
                <select
                  value={checkForm.customerId}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, customerId: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="">اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
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
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>البنك *</label>
                  <input
                    type="text"
                    value={checkForm.bank}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, bank: e.target.value })
                    }
                    placeholder="أدخل اسم البنك"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>الاسم على الشيك</label>
                <input
                  type="text"
                  value={checkForm.nameOnCheck}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, nameOnCheck: e.target.value })
                  }
                  placeholder="أدخل الاسم على الشيك (اختياري)"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
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
                    placeholder="أدخل المبلغ"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الاستحقاق *</label>
                  <input
                    type="date"
                    value={checkForm.dueDate}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, dueDate: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={checkForm.notes}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, notes: e.target.value })
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
                onClick={handleEditCheck}
                disabled={
                  !checkForm.customerId ||
                  !checkForm.checkNumber ||
                  !checkForm.bank ||
                  checkForm.amount <= 0 ||
                  !checkForm.dueDate
                }
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Check Modal */}
      {showDeleteModal && selectedCheck && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>حذف الشيك</h3>
              <button
                className="close-btn"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف الشيك رقم "{selectedCheck.checkNumber}"؟
              </p>
              <p className="warning-text">لا يمكن التراجع عن هذا الإجراء.</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                إلغاء
              </button>
              <button className="btn-danger" onClick={handleDeleteCheck}>
                <Trash2 className="btn-icon" />
                حذف الشيك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal import-modal">
            <div className="modal-header">
              <h3>استيراد الشيكات</h3>
              <button
                className="close-btn"
                onClick={() => {
                  setShowImportModal(false);
                  setImportForm({ customerId: "", file: null });
                  setImportPreview([]);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اختر العميل:</label>
                <select
                  value={importForm.customerId}
                  onChange={(e) =>
                    setImportForm({ ...importForm, customerId: e.target.value })
                  }
                  className="form-select"
                  required
                >
                  <option value="">اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>رفع ملف CSV:</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="form-input"
                  required
                />
                <small className="form-hint">
                  يجب أن يحتوي الملف على الأعمدة: رقم الشيك، المبلغ، التاريخ،
                  المصرف، ملاحظات، صاحب الشيك
                </small>
              </div>

              {importPreview.length > 0 && (
                <div className="import-preview">
                  <h4>معاينة البيانات ({importPreview.length} شيك):</h4>
                  <div className="preview-table">
                    <table>
                      <thead>
                        <tr>
                          <th>رقم الشيك</th>
                          <th>المبلغ</th>
                          <th>التاريخ</th>
                          <th>المصرف</th>
                          <th>الملاحظات</th>
                          <th>صاحب الشيك</th>
                          <th>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 5).map((check, index) => {
                          const isDuplicate = checks.some(
                            (existingCheck) =>
                              existingCheck.checkNumber === check.checkNumber
                          );
                          return (
                            <tr
                              key={index}
                              className={isDuplicate ? "duplicate-row" : ""}
                            >
                              <td>{check.checkNumber}</td>
                              <td>{check.amount}</td>
                              <td>{check.dueDate}</td>
                              <td>{check.bank}</td>
                              <td>{check.notes}</td>
                              <td>{check.nameOnCheck}</td>
                              <td>
                                {isDuplicate ? (
                                  <span className="duplicate-badge">
                                    موجود مسبقاً
                                  </span>
                                ) : (
                                  <span className="new-badge">جديد</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {importPreview.length > 5 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                textAlign: "center",
                                fontStyle: "italic",
                              }}
                            >
                              ... و {importPreview.length - 5} شيك إضافي
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="preview-summary">
                    <p>
                      <span className="new-count">
                        جديد:{" "}
                        {
                          importPreview.filter(
                            (check) =>
                              !checks.some(
                                (existingCheck) =>
                                  existingCheck.checkNumber ===
                                  check.checkNumber
                              )
                          ).length
                        }
                      </span>
                      <span className="duplicate-count">
                        موجود مسبقاً:{" "}
                        {
                          importPreview.filter((check) =>
                            checks.some(
                              (existingCheck) =>
                                existingCheck.checkNumber === check.checkNumber
                            )
                          ).length
                        }
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowImportModal(false);
                  setImportForm({ customerId: "", file: null });
                  setImportPreview([]);
                }}
                disabled={importing}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleImportChecks}
                disabled={
                  !importForm.customerId || !importForm.file || importing
                }
              >
                {importing ? (
                  <>
                    <div className="spinner-small"></div>
                    جاري الاستيراد...
                  </>
                ) : (
                  <>
                    <Upload className="btn-icon" />
                    استيراد الشيكات
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
