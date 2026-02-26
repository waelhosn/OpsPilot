"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format } from "date-fns";
import {
  Bot,
  CalendarClock,
  Loader2,
  LogOut,
  Package,
  Search,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { EventsV2ExternalModule } from "@/components/events-v2-external-module";
import { TablePagination, paginateItems, getTotalPages } from "@/components/table-pagination";
import { apiRequest } from "@/lib/api/client";
import type {
  CopilotResponse,
  EventDescriptionResponse,
  EventDraft,
  EventInviteOut,
  EventOut,
  InventoryDuplicateSuggestionResponse,
  InventoryItemOut,
  InventoryStatus,
  MeResponse,
  ReceiptExtraction,
  Role,
  SuggestAlternativesResponse,
  WorkspaceMemberOut
} from "@/lib/api/types";
import { cn, formatDateTime, parseEmailList } from "@/lib/utils";

type AppSection = "inventory" | "events" | "admin";
type DuplicateAction = "auto" | "merge" | "create_new" | "review";
type EventWorkflow = "calendar" | "create" | "ai" | "workspace";
type EventFormState = {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  description: string;
  status: EventOut["status"];
};
type CalendarHoverCard = {
  x: number;
  y: number;
  title: string;
  schedule: string;
  location: string;
  status: EventOut["status"];
  description: string;
};

type EditableImportRow = {
  name: string;
  quantity: number;
  unit: string;
  vendor: string;
  category: string;
  price?: number | null;
  duplicate_action: DuplicateAction;
  duplicate_candidates: string;
  merge_item_id?: number | null;
};

const inventoryStatuses: InventoryStatus[] = ["in_stock", "low_stock", "ordered", "discontinued"];

export default function AppDashboardPage(): JSX.Element {
  const router = useRouter();
  const {
    token,
    me,
    role,
    workspaceId,
    isHydrating,
    isLoadingMe,
    setWorkspaceId,
    logout
  } = useAuth();

  const [section, setSection] = useState<AppSection>("inventory");
  const activeWorkspaceId =
    workspaceId ?? (me && me.workspaces.length > 0 ? me.workspaces[0].workspace_id : null);

  useEffect(() => {
    if (isHydrating) return;
    if (!token) {
      router.replace("/login");
    }
  }, [isHydrating, token, router]);

  useEffect(() => {
    if (!me) return;
    if (activeWorkspaceId === null) return;
    if (workspaceId === activeWorkspaceId) return;
    setWorkspaceId(activeWorkspaceId);
  }, [me, activeWorkspaceId, workspaceId, setWorkspaceId]);

  function onLogout(): void {
    logout();
    router.replace("/login");
  }

  if (isHydrating || !token) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center">
        <div className="panel flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading app...
        </div>
      </main>
    );
  }

  if (isLoadingMe) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center">
        <div className="panel flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profile...
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-6">
          <h1 className="text-lg font-semibold text-slate-900">Unable to load profile</h1>
          <p className="mt-2 text-sm text-slate-500">Please log in again to continue.</p>
          <button
            className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={onLogout}
          >
            Return to login
          </button>
        </div>
      </main>
    );
  }

  if (activeWorkspaceId === null && me.workspaces.length === 0) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center px-4">
        <section className="panel w-full max-w-lg p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">OpsPilot</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Account setup incomplete</h1>
          <p className="mt-2 text-sm text-slate-500">
            No team membership was found for this account. Contact the administrator to be added.
          </p>
        </section>
      </main>
    );
  }

  if (activeWorkspaceId === null) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-6">
          <h1 className="text-lg font-semibold text-slate-900">Team unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">Your account does not have an active team context.</p>
        </div>
      </main>
    );
  }

  const navItems: Array<{ key: AppSection; label: string; icon: JSX.Element }> = [
    { key: "inventory", label: "Inventory Hub", icon: <Package className="h-4 w-4" /> },
    { key: "events", label: "Events Planner", icon: <CalendarClock className="h-4 w-4" /> },
    { key: "admin", label: "Team Admin", icon: <Shield className="h-4 w-4" /> }
  ];

  return (
    <main className="app-shell-bg min-h-screen p-4 md:p-6">
      <div className="mx-auto grid max-w-[1500px] gap-4 md:grid-cols-[260px,1fr]">
        <aside className="panel h-fit p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">OpsPilot</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Operations Console</h2>
          <p className="mt-1 text-xs text-slate-500">Inventory, scheduling, and AI workflows.</p>

          <nav className="mt-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={cn(
                  "inline-flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                  section === item.key
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50"
                )}
                onClick={() => setSection(item.key)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-4">
          <header className="panel p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">OpsPilot</h1>
                <p className="text-sm text-slate-500">
                  Signed in as {me.name} ({me.email})
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                  Role: {role ?? "-"}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </header>

          {section === "inventory" ? (
            <InventoryModule token={token} workspaceId={activeWorkspaceId} />
          ) : null}

          {section === "events" ? (
            <EventsSection
              token={token}
              workspaceId={activeWorkspaceId}
              me={me}
            />
          ) : null}

          {section === "admin" ? (
            <AdminModule token={token} workspaceId={activeWorkspaceId} role={role} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

type ModuleProps = {
  token: string;
  workspaceId: number;
};

function EventsSection({
  token,
  workspaceId,
  me,
}: ModuleProps & { me: MeResponse }): JSX.Element {
  return (
    <section className="space-y-4">
      <EventsV2ExternalModule token={token} workspaceId={workspaceId} me={me} />
    </section>
  );
}

function InventoryModule({ token, workspaceId }: ModuleProps): JSX.Element {
  const queryClient = useQueryClient();
  const [tableSearch, setTableSearch] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showCopilotDetails, setShowCopilotDetails] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const [newItem, setNewItem] = useState({
    name: "",
    quantity: 1,
    unit: "units",
    vendor: "",
    category: "",
    low_stock_threshold: 1,
    status: "in_stock" as InventoryStatus
  });
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(10);
  const [importPage, setImportPage] = useState(1);
  const [importPageSize, setImportPageSize] = useState(5);
  const [itemDrafts, setItemDrafts] = useState<Record<number, InventoryItemOut>>({});
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedImport, setParsedImport] = useState<ReceiptExtraction | null>(null);
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<InventoryDuplicateSuggestionResponse["suggestions"]>([]);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);

  const [copilotQuery, setCopilotQuery] = useState("what item has the lowest stock?");
  const [copilotResponse, setCopilotResponse] = useState<CopilotResponse | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["inventory-items", workspaceId],
    queryFn: () =>
      apiRequest<InventoryItemOut[]>("/inventory/items", {
        token,
        workspaceId
      })
  });

  const createItem = useMutation({
    mutationFn: () =>
      apiRequest<InventoryItemOut>("/inventory/items", {
        method: "POST",
        token,
        workspaceId,
        body: newItem
      }),
    onSuccess: () => {
      toast.success("Inventory item saved");
      setNewItem({
        name: "",
        quantity: 1,
        unit: "units",
        vendor: "",
        category: "",
        low_stock_threshold: 1,
        status: "in_stock"
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-items", workspaceId] });
      setInventoryPage(1);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save item")
  });

  const updateItem = useMutation({
    mutationFn: (item: InventoryItemOut) =>
      apiRequest<InventoryItemOut>(`/inventory/items/${item.id}`, {
        method: "PATCH",
        token,
        workspaceId,
        body: {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          vendor: item.vendor ?? null,
          category: item.category,
          low_stock_threshold: item.low_stock_threshold,
          status: item.status
        }
      }),
    onSuccess: () => {
      toast.success("Item updated");
      queryClient.invalidateQueries({ queryKey: ["inventory-items", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update")
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest<{ message: string }>(`/inventory/items/${itemId}`, {
        method: "DELETE",
        token,
        workspaceId
      }),
    onSuccess: () => {
      toast.success("Item deleted");
      queryClient.invalidateQueries({ queryKey: ["inventory-items", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete")
  });

  const parseImport = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (importText.trim()) formData.append("text", importText.trim());
      if (importFile) formData.append("file", importFile, importFile.name);

      const parsed = await apiRequest<ReceiptExtraction>("/inventory/import/parse", {
        method: "POST",
        token,
        workspaceId,
        formData
      });
      const duplicates = await apiRequest<InventoryDuplicateSuggestionResponse>(
        "/inventory/import/suggest-duplicates",
        {
          method: "POST",
          token,
          workspaceId,
          body: { items: parsed.items }
        }
      );
      return { parsed, duplicates };
    },
    onSuccess: ({ parsed, duplicates }) => {
      setParsedImport(parsed);
      setDuplicateSuggestions(duplicates.suggestions ?? []);
      const suggestionsByIndex = new Map<number, InventoryDuplicateSuggestionResponse["suggestions"][number]>();
      duplicates.suggestions.forEach((entry) => suggestionsByIndex.set(entry.import_index, entry));
      const rows: EditableImportRow[] = parsed.items.map((item, index) => {
        const suggestion = suggestionsByIndex.get(index);
        const candidates = suggestion?.candidates ?? [];
        return {
          name: item.name,
          quantity: Number(item.quantity ?? 1),
          unit: item.unit ?? "units",
          vendor: item.vendor ?? parsed.vendor ?? "",
          category: item.category ?? "",
          price: item.price ?? null,
          duplicate_action: (suggestion?.recommended_action ?? "auto") as DuplicateAction,
          duplicate_candidates:
            candidates.length > 0
              ? candidates
                  .map((candidate) => `${candidate.name} (${candidate.unit}) score ${candidate.similarity_score}`)
                  .join("; ")
              : "No close matches",
          merge_item_id: suggestion?.recommended_merge_item_id ?? null
        };
      });
      setEditableRows(rows);
      setImportPage(1);
      toast.success("Import parsed");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to parse import")
  });

  const commitImport = useMutation({
    mutationFn: async () => {
      const unresolved = editableRows.some((row) => row.duplicate_action === "review");
      if (unresolved) {
        throw new Error("Resolve duplicate decisions before commit.");
      }

      const payloadItems = editableRows.map((row, index) => {
        let mergeItemId = row.merge_item_id ?? null;
        if (row.duplicate_action === "merge" && !mergeItemId) {
          const fallback = duplicateSuggestions[index]?.recommended_merge_item_id;
          mergeItemId = fallback ?? null;
        }
        return {
          name: row.name,
          quantity: Number(row.quantity),
          unit: row.unit,
          vendor: row.vendor || null,
          category: row.category || null,
          price: row.price ?? null,
          duplicate_action: row.duplicate_action,
          merge_item_id: mergeItemId
        };
      });

      return apiRequest<InventoryItemOut[]>("/inventory/import/commit", {
        method: "POST",
        token,
        workspaceId,
        body: {
          items: payloadItems
        }
      });
    },
    onSuccess: (items) => {
      toast.success(`Imported ${items.length} item(s)`);
      setParsedImport(null);
      setDuplicateSuggestions([]);
      setEditableRows([]);
      setImportText("");
      setImportFile(null);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["inventory-items", workspaceId] });
      setImportPage(1);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Commit failed")
  });

  const runCopilot = useMutation({
    mutationFn: () =>
      apiRequest<CopilotResponse>("/inventory/copilot", {
        method: "POST",
        token,
        workspaceId,
        body: {
          query: copilotQuery
        }
      }),
    onSuccess: (response) => {
      setCopilotResponse(response);
      setShowCopilotDetails(false);
      toast.success("Copilot completed");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Copilot failed")
  });

  const items = itemsQuery.data ?? [];
  const totalImportPages = getTotalPages(editableRows.length, importPageSize);
  const filteredItems = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        (item.vendor ?? "").toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.unit.toLowerCase().includes(term) ||
        item.status.toLowerCase().includes(term)
      );
    });
  }, [items, tableSearch]);
  const totalInventoryPages = getTotalPages(filteredItems.length, inventoryPageSize);

  useEffect(() => {
    const nextDrafts: Record<number, InventoryItemOut> = {};
    items.forEach((item) => {
      nextDrafts[item.id] = { ...item };
    });
    setItemDrafts(nextDrafts);
  }, [items]);

  useEffect(() => {
    if (inventoryPage > totalInventoryPages) {
      setInventoryPage(totalInventoryPages);
    }
  }, [inventoryPage, totalInventoryPages]);

  useEffect(() => {
    setInventoryPage(1);
  }, [tableSearch]);

  useEffect(() => {
    if (importPage > totalImportPages) {
      setImportPage(totalImportPages);
    }
  }, [importPage, totalImportPages]);

  const lowStockCount = useMemo(
    () => items.filter((item) => item.status === "low_stock").length,
    [items]
  );
  const categoryCount = useMemo(
    () => new Set(items.map((item) => item.category.toLowerCase())).size,
    [items]
  );
  const paginatedItems = useMemo(
    () => paginateItems(filteredItems, inventoryPage, inventoryPageSize),
    [filteredItems, inventoryPage, inventoryPageSize]
  );
  const paginatedImportRows = useMemo(
    () => paginateItems(editableRows, importPage, importPageSize),
    [editableRows, importPage, importPageSize]
  );
  const importPageStartIndex = (importPage - 1) * importPageSize;

  function updateItemDraft(itemId: number, patch: Partial<InventoryItemOut>): void {
    setItemDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? (items.find((item) => item.id === itemId) as InventoryItemOut)),
        ...patch
      }
    }));
  }

  function isItemDirty(item: InventoryItemOut, draft: InventoryItemOut): boolean {
    return (
      item.name !== draft.name ||
      Number(item.quantity) !== Number(draft.quantity) ||
      item.unit !== draft.unit ||
      (item.vendor ?? "") !== (draft.vendor ?? "") ||
      item.category !== draft.category ||
      Number(item.low_stock_threshold) !== Number(draft.low_stock_threshold) ||
      item.status !== draft.status
    );
  }

  function saveItemRow(itemId: number): void {
    const draft = itemDrafts[itemId];
    if (!draft) return;
    setUpdatingItemId(itemId);
    updateItem.mutate(draft, {
      onSuccess: () => {
        setEditingItemId(null);
      },
      onSettled: () => setUpdatingItemId(null)
    });
  }

  function deleteItemRow(itemId: number): void {
    if (editingItemId === itemId) {
      setEditingItemId(null);
    }
    setDeletingItemId(itemId);
    deleteItem.mutate(itemId, {
      onSettled: () => setDeletingItemId(null)
    });
  }

  function startEditingItem(item: InventoryItemOut): void {
    setItemDrafts((prev) => ({
      ...prev,
      [item.id]: { ...item }
    }));
    setEditingItemId(item.id);
  }

  function cancelEditingItem(itemId: number): void {
    const original = items.find((item) => item.id === itemId);
    if (original) {
      setItemDrafts((prev) => ({
        ...prev,
        [itemId]: { ...original }
      }));
    }
    setEditingItemId(null);
  }

  function handleEditableRowChange(index: number, patch: Partial<EditableImportRow>): void {
    setEditableRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-end justify-end gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={() => itemsQuery.refetch()}
            disabled={itemsQuery.isFetching}
          >
            {itemsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>

        {itemsQuery.isFetching ? (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Syncing inventory...
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="kpi">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Items</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{items.length}</p>
          </div>
          <div className="kpi">
            <p className="text-xs uppercase tracking-wide text-slate-500">Low Stock</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{lowStockCount}</p>
          </div>
          <div className="kpi">
            <p className="text-xs uppercase tracking-wide text-slate-500">Categories</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{categoryCount}</p>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="panel-title">AI Import + Copilot</h3>
        <p className="mt-1 text-sm text-slate-500">Always available while you work in inventory.</p>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-700" />
              <h4 className="text-sm font-semibold text-slate-900">AI Import</h4>
            </div>
            <p className="mt-1 text-xs text-slate-500">Parse pasted text or text-based files (txt/csv/html), review extracted rows, then commit to inventory.</p>

            <div className="mt-3 space-y-2">
              <textarea
                className="h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Paste receipt text here"
              />
              <input
                ref={importFileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.csv,.pdf,.png,.jpg,.jpeg,.html,.htm"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setImportFile(event.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => importFileInputRef.current?.click()}
                >
                  Choose file
                </button>
                <span className="text-xs text-slate-500">
                  {importFile ? importFile.name : "No file selected"}
                </span>
                {importFile ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setImportFile(null);
                      if (importFileInputRef.current) {
                        importFileInputRef.current.value = "";
                      }
                    }}
                  >
                    Clear file
                  </button>
                ) : null}
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => parseImport.mutate()}
                disabled={parseImport.isPending || (!importText.trim() && !importFile)}
              >
                {parseImport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Parse with AI
              </button>
            </div>

            {parsedImport ? (
              <>
                <p className="mt-3 text-xs text-slate-600">
                  Vendor: <strong>{parsedImport.vendor ?? "unknown"}</strong> | Date: {parsedImport.date ?? "-"}
                </p>
                <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2">Vendor</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Duplicate action</th>
                        <th className="px-3 py-2">Suggestions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedImportRows.map((row, rowOffset) => {
                        const index = importPageStartIndex + rowOffset;
                        return (
                          <tr key={`${row.name}-${index}`}>
                            <td className="px-2 py-2">
                              <input
                                className="w-full rounded-lg border border-slate-300 px-2 py-1"
                                value={row.name}
                                onChange={(event) => handleEditableRowChange(index, { name: event.target.value })}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1"
                                value={row.quantity}
                                onChange={(event) =>
                                  handleEditableRowChange(index, { quantity: Number(event.target.value || 0) })
                                }
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                                value={row.unit}
                                onChange={(event) => handleEditableRowChange(index, { unit: event.target.value })}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className="w-36 rounded-lg border border-slate-300 px-2 py-1"
                                value={row.vendor}
                                onChange={(event) => handleEditableRowChange(index, { vendor: event.target.value })}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                                value={row.category}
                                onChange={(event) => handleEditableRowChange(index, { category: event.target.value })}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                className="rounded-lg border border-slate-300 px-2 py-1"
                                value={row.duplicate_action}
                                onChange={(event) =>
                                  handleEditableRowChange(index, {
                                    duplicate_action: event.target.value as DuplicateAction
                                  })
                                }
                              >
                                <option value="auto">auto</option>
                                <option value="merge">merge</option>
                                <option value="create_new">create_new</option>
                                <option value="review">review</option>
                              </select>
                            </td>
                            <td className="px-2 py-2 text-xs text-slate-600">{row.duplicate_candidates}</td>
                          </tr>
                        );
                      })}
                      {editableRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={7}>
                            No parsed rows.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={editableRows.length}
                  currentPage={importPage}
                  pageSize={importPageSize}
                  onPageChange={setImportPage}
                  onPageSizeChange={(size) => {
                    setImportPageSize(size);
                    setImportPage(1);
                  }}
                  itemLabel="rows"
                />
                <button
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => commitImport.mutate()}
                  disabled={commitImport.isPending}
                >
                  {commitImport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Commit parsed items
                </button>
              </>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-brand-700" />
              <h4 className="text-sm font-semibold text-slate-900">Inventory Copilot</h4>
            </div>
            <p className="mt-1 text-xs text-slate-500">Ask natural-language questions any time.</p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={copilotQuery}
                onChange={(event) => setCopilotQuery(event.target.value)}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => runCopilot.mutate()}
                disabled={runCopilot.isPending || !copilotQuery.trim()}
              >
                {runCopilot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Run
              </button>
            </div>

            {copilotResponse ? (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-900">{copilotResponse.answer}</p>
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:text-brand-800"
                  onClick={() => setShowCopilotDetails((prev) => !prev)}
                >
                  {showCopilotDetails ? "Hide technical details" : "Show technical details"}
                </button>
                {showCopilotDetails ? (
                  <>
                    <p className="text-xs text-slate-500">
                      Tools: {copilotResponse.tools_used.join(", ") || "none"}
                    </p>
                    {copilotResponse.data ? (
                      <pre className="overflow-auto rounded-lg bg-white p-2 text-xs text-slate-700">
                        {JSON.stringify(copilotResponse.data, null, 2)}
                      </pre>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="panel-title">Inventory Table</h3>
            <p className="mt-1 text-sm text-slate-500">Click Edit to modify a row, then Save.</p>
          </div>
          <form
            className="grid w-full gap-2 sm:w-auto sm:grid-cols-9"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newItem.name.trim()) return;
              createItem.mutate();
            }}
          >
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Item name
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.name}
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Quantity
              <input
                type="number"
                min={0}
                step="0.1"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.quantity}
                onChange={(event) => setNewItem((prev) => ({ ...prev, quantity: Number(event.target.value || 0) }))}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Unit
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.unit}
                onChange={(event) => setNewItem((prev) => ({ ...prev, unit: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Vendor
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.vendor}
                onChange={(event) => setNewItem((prev) => ({ ...prev, vendor: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Category
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.category}
                onChange={(event) => setNewItem((prev) => ({ ...prev, category: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Low threshold
              <input
                type="number"
                min={0}
                step="0.1"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.low_stock_threshold}
                onChange={(event) =>
                  setNewItem((prev) => ({ ...prev, low_stock_threshold: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Status
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={newItem.status}
                onChange={(event) =>
                  setNewItem((prev) => ({ ...prev, status: event.target.value as InventoryStatus }))
                }
              >
                {inventoryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={createItem.isPending}
              className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {createItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </button>
          </form>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Search table
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search item, vendor, category, unit, status..."
            />
          </div>
        </label>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Low threshold</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedItems.map((item) => {
                const draft = itemDrafts[item.id] ?? item;
                const dirty = isItemDirty(item, draft);
                const isSaving = updateItem.isPending && updatingItemId === item.id;
                const isDeleting = deleteItem.isPending && deletingItemId === item.id;
                const isEditing = editingItemId === item.id;

                return (
                  <tr key={item.id}>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          className="w-40 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.name}
                          onChange={(event) => updateItemDraft(item.id, { name: event.target.value })}
                        />
                      ) : (
                        <span className="text-slate-800">{item.name}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          className="w-36 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.vendor ?? ""}
                          onChange={(event) => updateItemDraft(item.id, { vendor: event.target.value })}
                        />
                      ) : (
                        <span className="text-slate-600">{item.vendor || "-"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          className="w-32 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.category}
                          onChange={(event) => updateItemDraft(item.id, { category: event.target.value })}
                        />
                      ) : (
                        <span className="text-slate-600">{item.category}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.quantity}
                          onChange={(event) => updateItemDraft(item.id, { quantity: Number(event.target.value || 0) })}
                        />
                      ) : (
                        <span className="text-slate-600">{item.quantity}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.unit}
                          onChange={(event) => updateItemDraft(item.id, { unit: event.target.value })}
                        />
                      ) : (
                        <span className="text-slate-600">{item.unit}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.low_stock_threshold}
                          onChange={(event) =>
                            updateItemDraft(item.id, { low_stock_threshold: Number(event.target.value || 0) })
                          }
                        />
                      ) : (
                        <span className="text-slate-600">{item.low_stock_threshold}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <select
                          className="rounded-lg border border-slate-300 px-2 py-1"
                          value={draft.status}
                          onChange={(event) => updateItemDraft(item.id, { status: event.target.value as InventoryStatus })}
                        >
                          {inventoryStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          {item.status}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        {isEditing ? (
                          <>
                            <button
                              className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                              onClick={() => saveItemRow(item.id)}
                              disabled={!dirty || isSaving}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => cancelEditingItem(item.id)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => startEditingItem(item)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                          onClick={() => deleteItemRow(item.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={8}>
                    No inventory items found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalItems={filteredItems.length}
          currentPage={inventoryPage}
          pageSize={inventoryPageSize}
          onPageChange={setInventoryPage}
          onPageSizeChange={(size) => {
            setInventoryPageSize(size);
            setInventoryPage(1);
          }}
        />
      </section>
    </div>
  );
}

function EventsModule({ token, workspaceId, me }: ModuleProps & { me: MeResponse }): JSX.Element {
  const queryClient = useQueryClient();
  const [eventsWorkflow, setEventsWorkflow] = useState<EventWorkflow>("calendar");
  const [query, setQuery] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [calendarMode, setCalendarMode] = useState<"timeGridWeek" | "dayGridMonth">("timeGridWeek");
  const [calendarDensity, setCalendarDensity] = useState<"compact" | "comfortable">("compact");
  const [selectedEventDraftId, setSelectedEventDraftId] = useState<number | null>(null);

  const [createInvitees, setCreateInvitees] = useState("");
  const [createDescriptionHint, setCreateDescriptionHint] = useState("");
  const [createForm, setCreateForm] = useState<EventFormState>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start: "09:00",
    end: "10:00",
    location: "",
    description: "",
    status: "upcoming"
  });

  const [nlPrompt, setNlPrompt] = useState("standup tomorrow 12pm invite wael@gmail.com");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [draftInvitees, setDraftInvitees] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResponseLabel, setInviteResponseLabel] = useState("");
  const [inviteResponseStatus, setInviteResponseStatus] = useState("attending");
  const [eventInvitesPage, setEventInvitesPage] = useState(1);
  const [eventInvitesPageSize, setEventInvitesPageSize] = useState(5);

  const [conflictDate, setConflictDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [conflictStart, setConflictStart] = useState("09:00");
  const [conflictEnd, setConflictEnd] = useState("10:00");
  const [conflictResult, setConflictResult] = useState<SuggestAlternativesResponse | null>(null);
  const [selectedDescriptionHint, setSelectedDescriptionHint] = useState("");
  const [calendarHover, setCalendarHover] = useState<CalendarHoverCard | null>(null);
  const [selectedEventDraft, setSelectedEventDraft] = useState<EventFormState>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start: "09:00",
    end: "10:00",
    location: "",
    description: "",
    status: "upcoming"
  });

  const eventsQuery = useQuery({
    queryKey: ["events", workspaceId, query],
    queryFn: () =>
      apiRequest<EventOut[]>("/events", {
        token,
        workspaceId,
        params: { query }
      }),
    refetchInterval: 15_000
  });

  const events = eventsQuery.data ?? [];

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null);
      setSelectedEventDraftId(null);
      return;
    }
    if (selectedEventId && events.some((event) => event.id === selectedEventId)) return;
    setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    if (!selectedEvent) return;
    if (selectedEventDraftId === selectedEvent.id) return;
    setSelectedEventDraftId(selectedEvent.id);
    setSelectedEventDraft({
      title: selectedEvent.title,
      date: format(new Date(selectedEvent.start_at), "yyyy-MM-dd"),
      start: format(new Date(selectedEvent.start_at), "HH:mm"),
      end: format(new Date(selectedEvent.end_at), "HH:mm"),
      location: selectedEvent.location ?? "",
      description: selectedEvent.description ?? "",
      status: selectedEvent.status
    });
    setConflictDate(format(new Date(selectedEvent.start_at), "yyyy-MM-dd"));
    setConflictStart(format(new Date(selectedEvent.start_at), "HH:mm"));
    setConflictEnd(format(new Date(selectedEvent.end_at), "HH:mm"));
  }, [selectedEvent, selectedEventDraftId]);

  const invitesQuery = useQuery({
    queryKey: ["event-invites", workspaceId, selectedEventId],
    queryFn: () =>
      apiRequest<EventInviteOut[]>(`/events/${selectedEventId}/invites`, {
        token,
        workspaceId
      }),
    enabled: Boolean(selectedEventId),
    refetchInterval: selectedEventId ? 15_000 : false
  });
  const eventInvites = invitesQuery.data ?? [];
  const paginatedEventInvites = useMemo(
    () => paginateItems(eventInvites, eventInvitesPage, eventInvitesPageSize),
    [eventInvites, eventInvitesPage, eventInvitesPageSize]
  );
  const totalEventInvitePages = getTotalPages(eventInvites.length, eventInvitesPageSize);

  useEffect(() => {
    if (eventInvitesPage > totalEventInvitePages) {
      setEventInvitesPage(totalEventInvitePages);
    }
  }, [eventInvitesPage, totalEventInvitePages]);

  useEffect(() => {
    setEventInvitesPage(1);
  }, [selectedEventId]);

  const actionableInvites = useMemo(() => {
    const invites = invitesQuery.data ?? [];
    return invites.filter(
      (invite) => invite.invited_user_email === me.email || invite.invited_user_id === me.id
    );
  }, [invitesQuery.data, me.email, me.id]);

  useEffect(() => {
    if (!actionableInvites.length) {
      setInviteResponseLabel("");
      return;
    }
    if (inviteResponseLabel && actionableInvites.some((invite) => String(invite.id) === inviteResponseLabel)) return;
    setInviteResponseLabel(String(actionableInvites[0].id));
  }, [actionableInvites, inviteResponseLabel]);

  const createEvent = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<EventOut>("/events", {
        method: "POST",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: (event) => {
      toast.success("Event created");
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      setSelectedEventId(event.id);
      setSelectedEventDraftId(null);
      setCreateForm((prev) => ({ ...prev, title: "", location: "", description: "" }));
      setCreateInvitees("");
      setDraft(null);
      setDraftInvitees("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create event")
  });

  const updateEvent = useMutation({
    mutationFn: (payload: Partial<EventOut>) =>
      apiRequest<EventOut>(`/events/${selectedEventId}`, {
        method: "PATCH",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: (event) => {
      toast.success("Event updated");
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      setSelectedEventId(event.id);
      setSelectedEventDraftId(event.id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update event")
  });

  const deleteEvent = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string }>(`/events/${selectedEventId}`, {
        method: "DELETE",
        token,
        workspaceId
      }),
    onSuccess: () => {
      toast.success("Event deleted");
      setSelectedEventId(null);
      setSelectedEventDraftId(null);
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId] });
      setConflictResult(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete event")
  });

  const generateDraft = useMutation({
    mutationFn: () =>
      apiRequest<EventDraft>("/events/nl-create", {
        method: "POST",
        token,
        workspaceId,
        body: { prompt: nlPrompt }
      }),
    onSuccess: (response) => {
      setDraft(response);
      setDraftInvitees(response.invitees.join(","));
      toast.success("Draft generated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to parse prompt")
  });

  const sendInvite = useMutation({
    mutationFn: () =>
      apiRequest<EventInviteOut>(`/events/${selectedEventId}/invite`, {
        method: "POST",
        token,
        workspaceId,
        body: { email: inviteEmail }
      }),
    onSuccess: () => {
      toast.success("Invite sent");
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to send invite")
  });

  const respondInvite = useMutation({
    mutationFn: () =>
      apiRequest<EventInviteOut>("/events/invites/respond", {
        method: "POST",
        token,
        workspaceId,
        body: {
          invite_id: Number(inviteResponseLabel),
          status: inviteResponseStatus
        }
      }),
    onSuccess: () => {
      toast.success("Response saved");
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to respond")
  });

  const checkConflicts = useMutation({
    mutationFn: () =>
      apiRequest<SuggestAlternativesResponse>("/events/suggest-alternatives", {
        method: "POST",
        token,
        workspaceId,
        body: {
          start_at: `${conflictDate}T${conflictStart}:00`,
          end_at: `${conflictDate}T${conflictEnd}:00`
        }
      }),
    onSuccess: (response) => {
      setConflictResult(response);
      toast.success("Conflict analysis ready");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Conflict check failed")
  });

  const generateDescription = useMutation({
    mutationFn: async (target: "create" | "selected") => {
      if (target === "create") {
        const response = await apiRequest<EventDescriptionResponse>("/events/generate-description", {
          method: "POST",
          token,
          workspaceId,
          body: {
            title: createForm.title.trim() || "New Event",
            start_at: `${createForm.date}T${createForm.start}:00`,
            end_at: `${createForm.date}T${createForm.end}:00`,
            location: createForm.location,
            description: createDescriptionHint.trim() || createForm.description
          }
        });
        return { target, response };
      }

      if (!selectedEvent) {
        throw new Error("Select an event first");
      }

      const response = await apiRequest<EventDescriptionResponse>("/events/generate-description", {
        method: "POST",
        token,
        workspaceId,
        body: {
          title: selectedEventDraft.title.trim() || selectedEvent.title,
          start_at: `${selectedEventDraft.date}T${selectedEventDraft.start}:00`,
          end_at: `${selectedEventDraft.date}T${selectedEventDraft.end}:00`,
          location: selectedEventDraft.location,
          description: selectedDescriptionHint.trim() || selectedEventDraft.description
        }
      });
      return { target, response };
    },
    onSuccess: ({ target, response }) => {
      const description = response.description.trim();
      if (target === "create") {
        setCreateForm((prev) => ({ ...prev, description }));
      } else {
        setSelectedEventDraft((prev) => ({ ...prev, description }));
      }
      toast.success("Description draft generated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to generate description")
  });

  function onCreateManualEvent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!createForm.title.trim()) return;
    createEvent.mutate({
      title: createForm.title.trim(),
      start_at: `${createForm.date}T${createForm.start}:00`,
      end_at: `${createForm.date}T${createForm.end}:00`,
      location: createForm.location,
      description: createForm.description,
      status: createForm.status,
      invitees: parseEmailList(createInvitees)
    });
  }

  function onCreateDraftEvent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!draft) return;
    createEvent.mutate({
      title: draft.title,
      start_at: draft.start_at,
      end_at: draft.end_at,
      location: draft.location || "",
      description: draft.description || "",
      status: "upcoming",
      invitees: parseEmailList(draftInvitees)
    });
  }

  function onUpdateSelectedEvent(): void {
    if (!selectedEvent) return;
    if (!selectedEventDraft.title.trim()) {
      toast.error("Event title is required");
      return;
    }

    updateEvent.mutate({
      title: selectedEventDraft.title.trim(),
      start_at: `${selectedEventDraft.date}T${selectedEventDraft.start}:00`,
      end_at: `${selectedEventDraft.date}T${selectedEventDraft.end}:00`,
      location: selectedEventDraft.location,
      description: selectedEventDraft.description,
      status: selectedEventDraft.status
    });
  }

  const selectedInvitees =
    (invitesQuery.data ?? []).map((invite) => invite.invited_user_email).join(", ") || "No invitees yet";
  const selectedEventSummary = selectedEvent
    ? `${selectedEvent.title} • ${formatDateTime(selectedEvent.start_at)}`
    : "No event selected";

  useEffect(() => {
    if (eventsWorkflow !== "calendar") {
      setCalendarHover(null);
    }
  }, [eventsWorkflow]);

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Events Workflow</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "calendar", label: "Calendar" },
              { key: "create", label: "Create Event" },
              { key: "ai", label: "AI Draft" },
              { key: "workspace", label: "Event Workspace" }
            ].map((workflow) => (
              <button
                key={workflow.key}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
                  eventsWorkflow === workflow.key
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                )}
                onClick={() => setEventsWorkflow(workflow.key as EventWorkflow)}
              >
                {workflow.label}
              </button>
            ))}
          </div>
          <div className="w-full md:w-[380px]">
            <label className="block text-sm font-medium text-slate-700">
              Selected event
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={selectedEventId ?? ""}
                onChange={(event) => {
                  const nextId = Number(event.target.value);
                  if (Number.isFinite(nextId)) {
                    setSelectedEventId(nextId);
                  }
                }}
              >
                <option value="" disabled>
                  Choose an event
                </option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} | {formatDateTime(event.start_at)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-slate-500">{selectedEventSummary}</p>
          </div>
        </div>
      </section>

      {eventsWorkflow === "calendar" ? (
        <section className="panel p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-full text-sm font-medium text-slate-700 md:w-80">
              Search events
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                  placeholder="standup, planning, demo..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </label>

            <label className="w-full text-sm font-medium text-slate-700 md:w-60">
              Calendar view
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={calendarMode}
                onChange={(event) => setCalendarMode(event.target.value as typeof calendarMode)}
              >
                <option value="timeGridWeek">Week</option>
                <option value="dayGridMonth">Month</option>
              </select>
            </label>

            <label className="w-full text-sm font-medium text-slate-700 md:w-56">
              Density
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={calendarDensity}
                onChange={(event) => setCalendarDensity(event.target.value as typeof calendarDensity)}
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>

            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => eventsQuery.refetch()}
              disabled={eventsQuery.isFetching}
            >
              {eventsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Refresh
            </button>
          </div>

          {eventsQuery.isFetching ? (
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing events...
            </p>
          ) : null}

          <div
            className={cn(
              "mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-2",
              calendarDensity === "compact" ? "calendar-compact" : "calendar-comfortable"
            )}
          >
            <FullCalendar
              key={`${calendarMode}-${calendarDensity}`}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={calendarMode}
              eventTimeFormat={{
                hour: "numeric",
                minute: "2-digit",
                meridiem: "short"
              }}
              displayEventTime={calendarMode !== "dayGridMonth"}
              events={events.map((event) => ({
                id: String(event.id),
                title: event.title,
                start: event.start_at,
                end: event.end_at,
                color:
                  event.status === "attending"
                    ? "#2f855a"
                    : event.status === "maybe"
                      ? "#b7791f"
                      : event.status === "declined"
                        ? "#b83280"
                        : "#24778f"
              }))}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay"
              }}
              eventDidMount={(info) => {
                const eventId = Number(info.event.id);
                const raw = events.find((event) => event.id === eventId);
                if (!raw) return;
                info.el.setAttribute(
                  "title",
                  `${raw.title} | ${formatDateTime(raw.start_at)} - ${formatDateTime(raw.end_at)} | ${raw.location || "No location"}`
                );
              }}
              eventMouseEnter={(info) => {
                const eventId = Number(info.event.id);
                const raw = events.find((event) => event.id === eventId);
                if (!raw) return;
                setCalendarHover({
                  x: info.jsEvent.clientX + 12,
                  y: info.jsEvent.clientY + 12,
                  title: raw.title,
                  schedule: `${formatDateTime(raw.start_at)} - ${formatDateTime(raw.end_at)}`,
                  location: raw.location || "No location",
                  status: raw.status,
                  description: raw.description || ""
                });
              }}
              eventMouseLeave={() => setCalendarHover(null)}
              eventClick={(clickInfo) => {
                const nextId = Number(clickInfo.event.id);
                if (Number.isFinite(nextId)) {
                  setSelectedEventId(nextId);
                  toast.success("Event selected");
                }
              }}
              height={calendarDensity === "compact" ? 540 : 680}
              dayMaxEventRows={calendarDensity === "compact" ? 2 : 4}
              dayMaxEvents={calendarDensity === "compact" ? 2 : 4}
              expandRows={calendarDensity !== "compact"}
              nowIndicator
            />
          </div>

          {calendarHover ? (
            <div
              className="pointer-events-none fixed z-50 w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-panel"
              style={{ top: calendarHover.y, left: calendarHover.x }}
            >
              <p className="text-sm font-semibold text-slate-900">{calendarHover.title}</p>
              <p className="mt-1 text-xs text-slate-600">{calendarHover.schedule}</p>
              <p className="text-xs text-slate-600">{calendarHover.location}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{calendarHover.status}</p>
              {calendarHover.description ? (
                <p className="mt-1 text-xs text-slate-600">{calendarHover.description}</p>
              ) : null}
            </div>
          ) : null}

          {selectedEvent ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Selected event: {selectedEvent.title}</p>
              <p>When: {formatDateTime(selectedEvent.start_at)} - {formatDateTime(selectedEvent.end_at)}</p>
              <p>Where: {selectedEvent.location || "No location"}</p>
              <p>With: {selectedInvitees}</p>
              <button
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                onClick={() => setEventsWorkflow("workspace")}
              >
                Open Event Workspace
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {eventsWorkflow === "create" ? (
        <section className="panel p-5">
          <h3 className="panel-title">Create Event</h3>
          <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={onCreateManualEvent}>
            <label className="text-sm text-slate-700 sm:col-span-2">
              Title
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.title}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-slate-700">
              Date
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.date}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-slate-700">
              Status
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, status: event.target.value as EventOut["status"] }))
                }
              >
                <option value="upcoming">upcoming</option>
                <option value="attending">attending</option>
                <option value="maybe">maybe</option>
                <option value="declined">declined</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Start
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.start}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, start: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-slate-700">
              End
              <input
                type="time"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.end}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, end: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-slate-700 sm:col-span-2">
              Location
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.location}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, location: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-700 sm:col-span-2">
              Description
              <div className="mt-1 grid gap-2 sm:grid-cols-[1fr,auto]">
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={createDescriptionHint}
                  onChange={(event) => setCreateDescriptionHint(event.target.value)}
                  placeholder="Optional guidance for AI: agenda, tone, outcomes"
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:opacity-60"
                  onClick={() => generateDescription.mutate("create")}
                  disabled={generateDescription.isPending}
                >
                  {generateDescription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Draft with AI
                </button>
              </div>
              <textarea
                className="mt-2 h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Optional. Use AI draft if you want a quick event summary."
              />
            </label>
            <label className="text-sm text-slate-700 sm:col-span-2">
              Invite emails (comma separated)
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={createInvitees}
                onChange={(event) => setCreateInvitees(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={createEvent.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-60"
            >
              {createEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create event
            </button>
          </form>
        </section>
      ) : null}

      {eventsWorkflow === "ai" ? (
        <section className="panel p-5">
          <h3 className="panel-title">AI Prompt to Draft</h3>
          <p className="mt-1 text-sm text-slate-500">Generate a structured event draft from natural language.</p>

          <textarea
            className="mt-4 h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={nlPrompt}
            onChange={(event) => setNlPrompt(event.target.value)}
          />

          <button
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => generateDraft.mutate()}
            disabled={generateDraft.isPending || !nlPrompt.trim()}
          >
            {generateDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate draft
          </button>

          {draft ? (
            <form className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={onCreateDraftEvent}>
              <p className="text-sm font-semibold text-slate-900">Draft preview</p>
              <p className="text-sm text-slate-700">{draft.title}</p>
              <p className="text-xs text-slate-500">
                {formatDateTime(draft.start_at)} - {formatDateTime(draft.end_at)}
              </p>
              <p className="text-xs text-slate-500">Location: {draft.location || "No location"}</p>
              <label className="block text-sm text-slate-700">
                Invitees
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1"
                  value={draftInvitees}
                  onChange={(event) => setDraftInvitees(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={createEvent.isPending}
              >
                {createEvent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create from draft
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {eventsWorkflow === "workspace" ? (
        <section className="panel p-5">
        <h3 className="panel-title">Selected Event Workspace</h3>
        <p className="mt-1 text-sm text-slate-500">Edit details, draft descriptions, invite participants, and check conflicts in one place.</p>

        {!selectedEvent ? (
          <p className="mt-4 text-sm text-slate-500">Select an event from the calendar first.</p>
        ) : (
          <>
            <form
              className="mt-4 grid gap-2 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                onUpdateSelectedEvent();
              }}
            >
              <label className="text-sm text-slate-700 sm:col-span-2">
                Event
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={selectedEventId ?? ""}
                  onChange={(event) => setSelectedEventId(Number(event.target.value))}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} | {formatDateTime(event.start_at)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700 sm:col-span-2">
                Title
                <input
                  value={selectedEventDraft.title}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="text-sm text-slate-700">
                Date
                <input
                  type="date"
                  value={selectedEventDraft.date}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-700">
                Status
                <select
                  value={selectedEventDraft.status}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({
                      ...prev,
                      status: event.target.value as EventOut["status"]
                    }))
                  }
                >
                  <option value="upcoming">upcoming</option>
                  <option value="attending">attending</option>
                  <option value="maybe">maybe</option>
                  <option value="declined">declined</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Start
                <input
                  type="time"
                  value={selectedEventDraft.start}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-700">
                End
                <input
                  type="time"
                  value={selectedEventDraft.end}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-700 sm:col-span-2">
                Location
                <input
                  value={selectedEventDraft.location}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, location: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-700 sm:col-span-2">
                Description
                <div className="mt-1 grid gap-2 sm:grid-cols-[1fr,auto]">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={selectedDescriptionHint}
                    onChange={(event) => setSelectedDescriptionHint(event.target.value)}
                    placeholder="Optional AI guidance: objective, audience, decisions"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:opacity-60"
                    onClick={() => generateDescription.mutate("selected")}
                    disabled={generateDescription.isPending}
                  >
                    {generateDescription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Draft with AI
                  </button>
                </div>
                <textarea
                  value={selectedEventDraft.description}
                  className="mt-2 h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
                  onChange={(event) =>
                    setSelectedEventDraft((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={updateEvent.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {updateEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => deleteEvent.mutate()}
                  disabled={deleteEvent.isPending}
                  className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  Delete event
                </button>
              </div>
            </form>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">Invitations</h4>
                {invitesQuery.isFetching ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Syncing invitations...
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="invitee@email.com"
                  />
                  <button
                    className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={!inviteEmail.trim() || sendInvite.isPending}
                    onClick={() => sendInvite.mutate()}
                  >
                    Invite
                  </button>
                </div>

                <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Invitee</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedEventInvites.map((invite) => (
                        <tr key={invite.id}>
                          <td className="px-3 py-2 text-slate-700">{invite.invited_user_email}</td>
                          <td className="px-3 py-2 text-slate-600">{invite.status}</td>
                        </tr>
                      ))}
                      {eventInvites.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={2}>
                            No invites yet
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={eventInvites.length}
                  currentPage={eventInvitesPage}
                  pageSize={eventInvitesPageSize}
                  onPageChange={setEventInvitesPage}
                  onPageSizeChange={(size) => {
                    setEventInvitesPageSize(size);
                    setEventInvitesPage(1);
                  }}
                  itemLabel="invites"
                />

                {actionableInvites.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Respond to your invite</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        value={inviteResponseLabel}
                        onChange={(event) => setInviteResponseLabel(event.target.value)}
                      >
                        {actionableInvites.map((invite) => (
                          <option key={invite.id} value={invite.id}>
                            {invite.invited_user_email} ({invite.status})
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        value={inviteResponseStatus}
                        onChange={(event) => setInviteResponseStatus(event.target.value)}
                      >
                        <option value="attending">attending</option>
                        <option value="maybe">maybe</option>
                        <option value="declined">declined</option>
                      </select>
                    </div>

                    <button
                      className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={!inviteResponseLabel || respondInvite.isPending}
                      onClick={() => respondInvite.mutate()}
                    >
                      Save response
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">Conflict Checker</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input
                    type="date"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={conflictDate}
                    onChange={(event) => setConflictDate(event.target.value)}
                  />
                  <input
                    type="time"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={conflictStart}
                    onChange={(event) => setConflictStart(event.target.value)}
                  />
                  <input
                    type="time"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={conflictEnd}
                    onChange={(event) => setConflictEnd(event.target.value)}
                  />
                </div>
                <button
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  onClick={() => checkConflicts.mutate()}
                  disabled={checkConflicts.isPending}
                >
                  {checkConflicts.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Check conflicts
                </button>

                {conflictResult ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                    <p>Has conflict: {String(conflictResult.has_conflict)}</p>
                    <p>Conflicts: {conflictResult.conflicts.length}</p>
                    <p>Alternatives: {conflictResult.suggestions.length}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
        </section>
      ) : null}
    </div>
  );
}

function AdminModule({ token, workspaceId, role }: ModuleProps & { role: Role | null }): JSX.Element {
  const queryClient = useQueryClient();
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);

  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => apiRequest<WorkspaceMemberOut[]>(`/workspaces/${workspaceId}/members`, { token }),
    enabled: role === "admin"
  });
  const members = membersQuery.data ?? [];
  const totalMemberPages = getTotalPages(members.length, membersPageSize);
  const paginatedMembers = useMemo(
    () => paginateItems(members, membersPage, membersPageSize),
    [members, membersPage, membersPageSize]
  );

  useEffect(() => {
    if (membersPage > totalMemberPages) {
      setMembersPage(totalMemberPages);
    }
  }, [membersPage, totalMemberPages]);

  const inviteMember = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string }>(`/workspaces/${workspaceId}/members/invite`, {
        method: "POST",
        token,
        body: {
          email: newMemberEmail,
          role: "member"
        }
      }),
    onSuccess: () => {
      toast.success("Member added/updated");
      setNewMemberEmail("");
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add member")
  });

  if (role !== "admin") {
    return (
      <section className="panel p-6">
        <div className="flex items-center gap-2 text-slate-700">
          <Shield className="h-4 w-4" />
          <h2 className="text-base font-semibold">Admin access required</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">You need admin role to manage members.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="panel p-5">
        <h3 className="panel-title">Team Members</h3>
        <p className="mt-1 text-sm text-slate-500">All users are members by default. The first registered user is the admin.</p>
        {membersQuery.isFetching ? (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing members...
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedMembers.map((member) => {
                return (
                  <tr key={member.email}>
                    <td className="px-3 py-2 text-slate-800">{member.name}</td>
                    <td className="px-3 py-2 text-slate-600">{member.email}</td>
                    <td className="px-3 py-2 text-slate-600">{member.role}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDateTime(member.joined_at)}</td>
                  </tr>
                );
              })}
              {members.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={4}>
                    No members found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalItems={members.length}
          currentPage={membersPage}
          pageSize={membersPageSize}
          onPageChange={setMembersPage}
          onPageSizeChange={(size) => {
            setMembersPageSize(size);
            setMembersPage(1);
          }}
          itemLabel="members"
        />
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-700" />
          <h3 className="panel-title">Add Member</h3>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr,auto]">
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="member@example.com"
            value={newMemberEmail}
            onChange={(event) => setNewMemberEmail(event.target.value)}
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => inviteMember.mutate()}
            disabled={inviteMember.isPending || !newMemberEmail.trim()}
          >
            {inviteMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add member
          </button>
        </div>
      </div>
    </section>
  );
}
