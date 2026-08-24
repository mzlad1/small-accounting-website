import React, { useState, useEffect, useRef } from "react";
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
  Landmark,
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
import { fetchCacheFirst } from "../utils/cacheFirst";
import {
  buildCheckSeries,
  SeriesInterval,
} from "../utils/checkSeries";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { Pagination } from "../components/Pagination";
import {
  FiltersBar,
  SearchField,
  SelectField,
  DateField,
  SortControl,
} from "../components/Filters";

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

  // Custom dropdown states for Checks
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [isEditCustomerDropdownOpen, setIsEditCustomerDropdownOpen] =
    useState(false);
  const [editCustomerSearchTerm, setEditCustomerSearchTerm] = useState("");
  const [selectedEditCustomerIndex, setSelectedEditCustomerIndex] =
    useState(-1);
  const [isImportCustomerDropdownOpen, setIsImportCustomerDropdownOpen] =
    useState(false);
  const [importCustomerSearchTerm, setImportCustomerSearchTerm] = useState("");
  const [selectedImportCustomerIndex, setSelectedImportCustomerIndex] =
    useState(-1);

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

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several checks can be entered in a row.
  const addModalRef = useRef<HTMLDivElement | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesCount, setSeriesCount] = useState(6);
  const [seriesInterval, setSeriesInterval] = useState<SeriesInterval>("month");
  const [addSuccessCount, setAddSuccessCount] = useState(1);
  const [seriesEntries, setSeriesEntries] = useState<
    Array<{ checkNumber: string; dueDate: string; amount: number }>
  >([]);

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
      setSeriesEnabled(false);
      focusFirstField();
    }
  }, [showAddModal]);

  // Regenerate the editable series whenever the template inputs change
  // (manual per-row edits below survive until a template input changes)
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


  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        collection(db, "customers"),
        query(collection(db, "customerChecks"), orderBy("dueDate", "asc")),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [checks, searchTerm, filters, sortBy, currentPage, itemsPerPage]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".custom-dropdown")) {
        setIsCustomerDropdownOpen(false);
        setIsEditCustomerDropdownOpen(false);
        setIsImportCustomerDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const applySnapshots = (
    snapshots: Array<QuerySnapshot<DocumentData>>,
    fromCache = false
  ) => {
    const [customersSnapshot, checksSnapshot] = snapshots;

    const customersData: Customer[] = [];
    customersSnapshot.forEach((doc) => {
      customersData.push({ id: doc.id, ...doc.data() } as Customer);
    });
    setCustomers(customersData);

    // Map customer checks with customer names
    const checksData: CustomerCheck[] = [];
    checksSnapshot.forEach((checkDoc) => {
      const checkData = checkDoc.data();
      const customer = customersData.find((c) => c.id === checkData.customerId);
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
        // Update the status in the database — server pass only, so the
        // write doesn't fire twice per load (apply runs cache + server)
        if (!fromCache) {
          updateDoc(doc(db, "customerChecks", check.id), {
            status: "collected",
            autoCollected: true,
            autoCollectedAt: new Date().toISOString(),
          }).catch((error) => {
            console.error("Error auto-updating check status:", error);
          });
        }
      }

      checksData.push(check);
    });

    setChecks(checksData);
  };

  const applyFiltersAndSort = () => {
    let filtered = [...checks];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter((check) => matchesSearch(check, searchTerm));
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

    // Apply sorting — every column header is sortable, so normalise per
    // field kind: amounts numerically, dates by their raw ISO value
    // (YYYY-MM-DD sorts chronologically), everything else as a string.
    const numericSortFields = ["amount"];
    const dateSortFields = ["dueDate", "createdAt", "autoCollectedAt"];
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof CustomerCheck];
      let bValue: any = b[sortBy.field as keyof CustomerCheck];

      if (numericSortFields.includes(sortBy.field)) {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else if (dateSortFields.includes(sortBy.field)) {
        aValue = aValue ?? "";
        bValue = bValue ?? "";
      } else {
        aValue = (aValue ?? "").toString();
        bValue = (bValue ?? "").toString();
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

  // Custom dropdown functions for customers in checks
  const getFilteredCustomers = (searchTerm: string) => {
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleCustomerSelect = (
    customer: Customer,
    modalType: "add" | "edit" | "import" = "add"
  ) => {
    if (modalType === "edit") {
      setCheckForm({ ...checkForm, customerId: customer.id });
      setEditCustomerSearchTerm(customer.name);
      setIsEditCustomerDropdownOpen(false);
      setSelectedEditCustomerIndex(-1);
    } else if (modalType === "import") {
      setImportForm({ ...importForm, customerId: customer.id });
      setImportCustomerSearchTerm(customer.name);
      setIsImportCustomerDropdownOpen(false);
      setSelectedImportCustomerIndex(-1);
    } else {
      setCheckForm({ ...checkForm, customerId: customer.id });
      setCustomerSearchTerm(customer.name);
      setIsCustomerDropdownOpen(false);
      setSelectedCustomerIndex(-1);
    }
  };

  // Helper function to scroll highlighted option into view
  const scrollToHighlighted = (
    index: number,
    modalType: "add" | "edit" | "import" = "add"
  ) => {
    const dropdownSelector =
      modalType === "add"
        ? ".modal .dropdown-options"
        : modalType === "edit"
        ? ".modal .dropdown-options"
        : ".import-modal .dropdown-options";
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

  const handleCustomerKeyDown = (
    e: React.KeyboardEvent,
    modalType: "add" | "edit" | "import" = "add"
  ) => {
    const searchTerm =
      modalType === "edit"
        ? editCustomerSearchTerm
        : modalType === "import"
        ? importCustomerSearchTerm
        : customerSearchTerm;
    const filteredCustomers = getFilteredCustomers(searchTerm);
    const selectedIndex =
      modalType === "edit"
        ? selectedEditCustomerIndex
        : modalType === "import"
        ? selectedImportCustomerIndex
        : selectedCustomerIndex;
    const setSelectedIndex =
      modalType === "edit"
        ? setSelectedEditCustomerIndex
        : modalType === "import"
        ? setSelectedImportCustomerIndex
        : setSelectedCustomerIndex;
    const setDropdownOpen =
      modalType === "edit"
        ? setIsEditCustomerDropdownOpen
        : modalType === "import"
        ? setIsImportCustomerDropdownOpen
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
        setTimeout(() => scrollToHighlighted(newDownIndex, modalType), 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        const newUpIndex = Math.max(selectedIndex - 1, -1);
        setSelectedIndex(newUpIndex);
        setDropdownOpen(true);
        // Scroll highlighted option into view
        setTimeout(() => scrollToHighlighted(newUpIndex, modalType), 0);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredCustomers.length) {
          handleCustomerSelect(filteredCustomers[selectedIndex], modalType);
        }
        break;
      case "Escape":
        e.preventDefault();
        setDropdownOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleAddCheck = async () => {
    try {
      // Series mode: create every check (and its mirrored payment)
      // in ONE atomic batch
      if (seriesEnabled && seriesEntries.length >= 2) {
        if (
          seriesEntries.some((entry) => !entry.checkNumber || !entry.dueDate)
        ) {
          alert("أكمل رقم وتاريخ كل شيك في السلسلة");
          return;
        }
        const customer = customers.find((c) => c.id === checkForm.customerId);
        const entries = seriesEntries;
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();
        const today = nowIso.split("T")[0];

        entries.forEach((entry) => {
          const checkRef = doc(collection(db, "customerChecks"));
          batch.set(checkRef, {
            ...checkForm,
            checkNumber: entry.checkNumber,
            dueDate: entry.dueDate,
            amount: entry.amount,
            status: "pending" as CustomerCheck["status"],
            createdAt: nowIso,
          });

          const paymentRef = doc(collection(db, "payments"));
          batch.set(paymentRef, {
            customerId: checkForm.customerId,
            customerName: customer?.name || "",
            date: today,
            type: "check" as "cash" | "check",
            amount: entry.amount,
            notes: checkForm.notes || `دفعة شيك - ${checkForm.notes || ""}`,
            checkNumber: entry.checkNumber,
            checkBank: checkForm.bank,
            checkDate: entry.dueDate,
            nameOnCheck: checkForm.nameOnCheck || customer?.name || "",
            createdAt: nowIso,
          });
        });

        await batch.commit();

        setCheckForm({
          customerId: "",
          checkNumber: "",
          bank: "",
          amount: 0,
          dueDate: new Date().toISOString().split("T")[0],
          notes: "",
          nameOnCheck: "",
        });
        setCustomerSearchTerm("");
        setIsCustomerDropdownOpen(false);
        setSelectedCustomerIndex(-1);
        setSeriesEnabled(false);
        setAddSuccessCount(entries.length);
        setAddSuccess(true);
        focusFirstField();
        setTimeout(() => setAddSuccess(false), 2500);
        return;
      }

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

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setCheckForm({
        customerId: "",
        checkNumber: "",
        bank: "",
        amount: 0,
        dueDate: new Date().toISOString().split("T")[0],
        notes: "",
        nameOnCheck: "",
      });
      setCustomerSearchTerm("");
      setIsCustomerDropdownOpen(false);
      setSelectedCustomerIndex(-1);
      setAddSuccessCount(1);
      setAddSuccess(true);
      focusFirstField();
      setTimeout(() => setAddSuccess(false), 2500);
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
      setEditCustomerSearchTerm("");
      setIsEditCustomerDropdownOpen(false);
      setSelectedEditCustomerIndex(-1);
    } catch (error) {
      console.error("Error updating check:", error);
    }
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;

    try {
      // Delete the check
      await deleteDoc(doc(db, "customerChecks", selectedCheck.id));

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
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error updating check status:", error);
    }
  };

  const openEditModal = (check: CustomerCheck) => {
    setSelectedCheck(check);
    const customer = customers.find((c) => c.id === check.customerId);
    setCheckForm({
      customerId: check.customerId,
      checkNumber: check.checkNumber,
      bank: check.bank,
      amount: check.amount,
      dueDate: check.dueDate,
      notes: check.notes || "",
      nameOnCheck: check.nameOnCheck || "",
    });
    setEditCustomerSearchTerm(customer?.name || "");
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

  // Cheque stamp tone — mirrors the colour family the status pill uses
  // (olive = collected, brick = returned/overdue, ochre = waiting).
  const getStampTone = (status: string) => {
    const cls = getStatusClass(status);
    if (cls === "collected") return "chq-ok";
    if (cls === "returned" || cls === "overdue") return "chq-bad";
    return "chq-warn";
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
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .status-pending { color: #a9741f; }
              .status-collected { color: #4a7c59; }
              .status-returned { color: #b23b2e; }
              .status-overdue { color: #b23b2e; }
              .summary { margin-top: 20px; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>شيكات العملاء</h1>
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-GB")}</p>
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
                    <td>${new Date(check.dueDate).toLocaleDateString("en-GB")}</td>
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
      // The live subscription picks up the change automatically.
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
    return new Date(dateString).toLocaleDateString("en-GB");
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

      {/* Search and Filters */}
      <FiltersBar
        onClear={() => {
          setSearchTerm("");
          setFilters({
            customer: "all",
            status: "all",
            dueDateFilter: "all",
            dateFrom: "",
            dateTo: "",
          });
        }}
      >
        <SearchField value={searchTerm} onChange={setSearchTerm} />
        <SelectField
          label="العميل"
          value={filters.customer}
          onChange={(value) => setFilters({ ...filters, customer: value })}
          options={[
            { value: "all", label: "جميع العملاء" },
            ...customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            })),
          ]}
        />
        <SelectField
          label="الحالة"
          value={filters.status}
          onChange={(value) => setFilters({ ...filters, status: value })}
          options={[
            { value: "all", label: "جميع الحالات" },
            { value: "pending", label: "في الانتظار" },
            { value: "collected", label: "محصّل" },
            { value: "returned", label: "مرتجع" },
            { value: "overdue", label: "متأخر" },
          ]}
        />
        <SelectField
          label="تاريخ الاستحقاق"
          value={filters.dueDateFilter}
          onChange={(value) => setFilters({ ...filters, dueDateFilter: value })}
          options={[
            { value: "all", label: "جميع التواريخ" },
            { value: "today", label: "اليوم" },
            { value: "week", label: "هذا الأسبوع" },
            { value: "month", label: "هذا الشهر" },
            { value: "range", label: "نطاق مخصص" },
          ]}
        />
        {filters.dueDateFilter === "range" && (
          <>
            <DateField
              label="من تاريخ"
              value={filters.dateFrom}
              onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            />
            <DateField
              label="إلى تاريخ"
              value={filters.dateTo}
              onChange={(value) => setFilters({ ...filters, dateTo: value })}
            />
          </>
        )}
        <SortControl
          value={sortBy.field}
          onChange={(field) => setSortBy((prev) => ({ ...prev, field }))}
          options={[
            { value: "customerName", label: "العميل" },
            { value: "checkNumber", label: "رقم الشيك" },
            { value: "bank", label: "البنك" },
            { value: "nameOnCheck", label: "الاسم على الشيك" },
            { value: "amount", label: "المبلغ" },
            { value: "dueDate", label: "تاريخ الاستحقاق" },
            { value: "status", label: "الحالة" },
            { value: "notes", label: "ملاحظات" },
          ]}
          order={sortBy.order}
          onToggleOrder={() =>
            setSortBy((prev) => ({
              ...prev,
              order: prev.order === "asc" ? "desc" : "asc",
            }))
          }
        />
      </FiltersBar>

      {/* Checks — cheque cards */}
      {paginatedChecks.length === 0 ? (
        <div className="chq-empty">
          <CreditCard size={34} color="#D8CDBB" />
          <p>لا توجد شيكات مطابقة</p>
        </div>
      ) : (
        <div className="chq-grid">
          {paginatedChecks.map((check) => (
            <article
              key={check.id}
              className={`chq-cheque ${
                isOverdue(check.dueDate) ? "chq-overdue" : ""
              }`}
            >
              <div className="chq-cheque-top">
                <span className="chq-bank">
                  <Landmark size={15} />
                  <span className="chq-bank-name">{check.bank || "-"}</span>
                </span>
                <span className="chq-chqnum">#{check.checkNumber}</span>
              </div>

              <div className="chq-payline">
                لأمر: <b>{check.customerName}</b>
              </div>

              <div className="chq-cheque-mid">
                <div className="chq-amountbox">
                  {formatCurrency(check.amount)}
                </div>
                <div className="chq-due">
                  <span>تاريخ الاستحقاق</span>
                  <b>{formatDate(check.dueDate)}</b>
                </div>
                <div className={`chq-stamp ${getStampTone(check.status)}`}>
                  {getStatusText(check.status)}
                </div>
              </div>

              {check.notes && <div className="chq-note">{check.notes}</div>}

              <div className="chq-cheque-foot">
                <span className="chq-meta">
                  الاسم على الشيك: <b>{check.nameOnCheck || "-"}</b>
                </span>
                <div className="chq-actions">
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
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredChecks.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredChecks.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
          itemLabel="شيك"
        />
      )}

      {/* Add Check Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal" ref={addModalRef}>
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
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  {addSuccessCount > 1
                    ? `تمت إضافة ${addSuccessCount} شيكات بنجاح`
                    : "تمت الإضافة بنجاح"}
                </div>
              )}
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
                    onKeyDown={(e) => handleCustomerKeyDown(e, "add")}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="ابحث عن العميل أو اختر من القائمة"
                    required={!checkForm.customerId}
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
                              checkForm.customerId === customer.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleCustomerSelect(customer, "add")
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
                          className="form-input"
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
                          className="form-input"
                          value={seriesInterval}
                          onChange={(e) =>
                            setSeriesInterval(e.target.value as SeriesInterval)
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
                          رقم الشيك يجب أن يحتوي على أرقام حتى يتم توليد أرقام
                          السلسلة تلقائياً
                        </p>
                      )}
                    {seriesEntries.length > 0 && (
                      <div className="series-preview">
                        <div className="series-preview-row series-preview-head">
                          <span className="series-preview-index">#</span>
                          <span className="series-preview-number">
                            رقم الشيك
                          </span>
                          <span className="series-preview-date">التاريخ</span>
                          <span className="series-preview-amount">المبلغ</span>
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
                                updateSeriesEntry(i, "dueDate", e.target.value)
                              }
                            />
                            <input
                              type="number"
                              className="series-input series-input-amount"
                              value={entry.amount}
                              onChange={(e) =>
                                updateSeriesEntry(i, "amount", e.target.value)
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
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={editCustomerSearchTerm}
                    onChange={(e) => {
                      setEditCustomerSearchTerm(e.target.value);
                      setIsEditCustomerDropdownOpen(true);
                      setSelectedEditCustomerIndex(-1);
                    }}
                    onKeyDown={(e) => handleCustomerKeyDown(e, "edit")}
                    onFocus={() => setIsEditCustomerDropdownOpen(true)}
                    placeholder="ابحث عن العميل أو اختر من القائمة"
                    required={!checkForm.customerId}
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
                              checkForm.customerId === customer.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleCustomerSelect(customer, "edit")
                            }
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
                <div className="custom-dropdown">
                  <input
                    type="text"
                    value={importCustomerSearchTerm}
                    onChange={(e) => {
                      setImportCustomerSearchTerm(e.target.value);
                      setIsImportCustomerDropdownOpen(true);
                      setSelectedImportCustomerIndex(-1);
                    }}
                    onKeyDown={(e) => handleCustomerKeyDown(e, "import")}
                    onFocus={() => setIsImportCustomerDropdownOpen(true)}
                    placeholder="ابحث عن العميل أو اختر من القائمة"
                    required={!importForm.customerId}
                  />
                  {isImportCustomerDropdownOpen && (
                    <div className="dropdown-options">
                      {getFilteredCustomers(importCustomerSearchTerm).map(
                        (customer, index) => (
                          <div
                            key={customer.id}
                            className={`dropdown-option ${
                              index === selectedImportCustomerIndex
                                ? "highlighted"
                                : ""
                            } ${
                              importForm.customerId === customer.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleCustomerSelect(customer, "import")
                            }
                          >
                            {customer.name}
                          </div>
                        )
                      )}
                      {getFilteredCustomers(importCustomerSearchTerm).length ===
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
