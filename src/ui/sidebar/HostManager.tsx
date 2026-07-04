/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  useState,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/button";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  FolderPlus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/popover";
import { toast } from "sonner";
import {
  getSSHHosts,
  getCredentials,
  deleteCredential,
  duplicateCredential,
  deployCredentialToHost,
  renameCredentialFolder,
  updateCredential,
  getLinkedCredentialIds,
} from "@/main-axios";

import type { Host, Credential } from "@/types/ui-types";
import { CredentialEditorView } from "./CredentialEditorView";
import { HostEditor } from "./HostEditor";
import { mapCredentials, sshHostToHost } from "./HostManagerData";
import { HostCredentialList } from "./HostCredentialList";
import type {
  CredentialFilterState,
  CredentialSortKey,
} from "./CredentialsPanel";
import {
  makeCredentialTabs,
  makeHostTabs,
  makeHostSshSubTabs,
  SSH_GROUP_TABS,
  TabStrip,
} from "./HostManagerTabs";

function sortCredentials(
  creds: Credential[],
  key: CredentialSortKey,
): Credential[] {
  if (key === "default") return creds;
  const sorted = [...creds];
  switch (key) {
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "username-asc":
      sorted.sort((a, b) => a.username.localeCompare(b.username));
      break;
    case "username-desc":
      sorted.sort((a, b) => b.username.localeCompare(a.username));
      break;
  }
  return sorted;
}

function credentialPassesFilters(
  cred: Credential,
  filters: CredentialFilterState,
): boolean {
  if (filters.type.length > 0 && !filters.type.includes(cred.type))
    return false;
  if (
    filters.tags.length > 0 &&
    !filters.tags.some((tag) => cred.tags?.includes(tag))
  )
    return false;
  return true;
}

// VRIT: contextual action bar shown above the credential list while in
// multi-select mode. "Move to folder" doubles as folder creation — typing a
// new name and confirming assigns it (credential folders are derived from the
// folder field, so assignment is creation).
function CredentialSelectionBar({
  count,
  folders,
  onMove,
  onDelete,
  onCancel,
}: {
  count: number;
  folders: string[];
  onMove: (folder: string | null) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [moveOpen, setMoveOpen] = useState(false);
  const [search, setSearch] = useState("");

  const realFolders = folders
    .filter((f) => f && f !== "Uncategorized")
    .sort((a, b) => a.localeCompare(b));
  const query = search.trim();
  const queryLower = query.toLowerCase();
  const filtered = query
    ? realFolders.filter((f) => f.toLowerCase().includes(queryLower))
    : realFolders;
  const canCreate =
    query.length > 0 &&
    !realFolders.some((f) => f.toLowerCase() === queryLower);

  function move(folder: string | null) {
    setMoveOpen(false);
    setSearch("");
    onMove(folder);
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 shrink-0 border-b border-border/60 bg-accent-brand/5">
      <span className="text-xs font-semibold text-accent-brand">
        {t("credentials.nSelected", { count })}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <Popover open={moveOpen} onOpenChange={setMoveOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={count === 0}
              className="flex items-center gap-1 h-7 px-2 text-[10px] font-medium text-foreground hover:bg-muted/60 border border-border rounded-sm transition-colors disabled:opacity-40"
            >
              <FolderPlus className="size-3 shrink-0" />
              {t("credentials.moveToFolder")}
              <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground/50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={4}
            className="w-56 max-h-(--radix-popover-content-available-height) p-0 rounded-none border-0 ring-1 ring-border shadow-md flex flex-col overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5 h-8 shrink-0">
              <Search className="size-3 shrink-0 text-muted-foreground/60" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canCreate) move(query);
                    else if (filtered.length > 0) move(filtered[0]);
                  }
                }}
                placeholder={t("credentials.folderPickerSearch")}
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 text-foreground min-w-0"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => move(null)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <X className="size-3.5 shrink-0" />
                {t("credentials.moveToNoFolder")}
              </button>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => move(query)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-accent-brand hover:bg-accent transition-colors"
                >
                  <FolderPlus className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {t("credentials.folderPickerCreate", { name: query })}
                  </span>
                </button>
              )}
              {filtered.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => move(f)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Check className="size-3.5 shrink-0 opacity-0" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          disabled={count === 0}
          onClick={onDelete}
          className="flex items-center gap-1 h-7 px-2 text-[10px] font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-sm transition-colors disabled:opacity-40"
        >
          <Trash2 className="size-3 shrink-0" />
          {t("credentials.deleteSelected")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          title={t("credentials.cancelSelection")}
          className="flex items-center justify-center size-7 text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/60 rounded-sm transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function HostManager({
  pendingEditId,
  pendingAction,
  onEditingChange,
  hideListHeader,
  externalSearch,
  externalSort,
  externalFilter,
  onTagsChange,
  active = true,
}: {
  pendingEditId?: MutableRefObject<string | null>;
  pendingAction?: MutableRefObject<"add-host" | "add-credential" | null>;
  onEditingChange?: (editing: boolean) => void;
  hideListHeader?: boolean;
  externalSearch?: string;
  externalSort?: CredentialSortKey;
  externalFilter?: CredentialFilterState;
  onTagsChange?: (tags: string[]) => void;
  active?: boolean;
} = {}) {
  const { t } = useTranslation();
  const [editingHost, setEditingHost] = useState<Host | "new" | null>(null);
  const [editingCredential, setEditingCredential] = useState<
    Credential | "new" | null
  >(null);
  const [activeHostTab, setActiveHostTab] = useState("general");
  const [activeCredentialTab, setActiveCredentialTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const effectiveSearch = externalSearch ?? searchQuery;
  const [hosts, setHosts] = useState<Host[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [deployDialog, setDeployDialog] = useState<{
    cred: Credential;
    hostId: string;
  } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [editingProtocols, setEditingProtocols] = useState({
    enableSsh: true,
    enableRdp: false,
    enableVnc: false,
    enableTelnet: false,
  });
  const hostsRef = useRef<Host[]>([]);
  useEffect(() => {
    hostsRef.current = hosts;
  }, [hosts]);
  const credentialsRef = useRef<Credential[]>([]);
  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);
  const [editingCredFolderName, setEditingCredFolderName] = useState<
    string | null
  >(null);
  const [editingCredFolderValue, setEditingCredFolderValue] = useState("");
  const [termixIdLinkedIds, setTermixIdLinkedIds] = useState<Set<number>>(
    new Set(),
  );

  // VRIT: credential multi-select + folder open-state (parity with the host
  // list). selectionMode is toggled from the Credentials toolbar via a
  // CustomEvent; openFolders controls which credential folders are expanded.
  const [credSelectionMode, setCredSelectionMode] = useState(false);
  const [selectedCredIds, setSelectedCredIds] = useState<Set<string>>(
    new Set(),
  );
  const [openCredFolders, setOpenCredFolders] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    onTagsChange?.([...new Set(credentials.flatMap((c) => c.tags ?? []))]);
  }, [credentials]);

  const applyPendingEdit = (hostList: Host[]) => {
    if (pendingEditId?.current) {
      const id = pendingEditId.current;
      pendingEditId.current = null;
      const host = hostList.find((h) => h.id === id);
      if (host) {
        setEditingHost(host);
        setEditingCredential(null);
        setActiveHostTab("general");
        setEditingProtocols({
          enableSsh: host.enableSsh,
          enableRdp: host.enableRdp,
          enableVnc: host.enableVnc,
          enableTelnet: host.enableTelnet,
        });
        return true;
      }
    }
    return false;
  };

  const reloadHosts = () => {
    getSSHHosts()
      .then((raw) => {
        const converted = raw.map(sshHostToHost);
        setHosts(converted);
        applyPendingEdit(converted);
      })
      .catch(() => {});
  };

  const reloadCredentials = () => {
    getCredentials()
      .then((res) => setCredentials(mapCredentials(res)))
      .catch(() => {})
      .finally(() => setCredentialsLoading(false));
  };

  const reloadLinkedIds = () => {
    getLinkedCredentialIds()
      .then((d) => setTermixIdLinkedIds(new Set(d.credentialIds)))
      .catch(() => {});
  };

  useEffect(() => {
    reloadHosts();
    reloadCredentials();
    reloadLinkedIds();

    window.addEventListener("termix:hosts-changed", reloadHosts);
    window.addEventListener("termix:credentials-changed", reloadCredentials);
    return () => {
      window.removeEventListener("termix:hosts-changed", reloadHosts);
      window.removeEventListener(
        "termix:credentials-changed",
        reloadCredentials,
      );
    };
  }, []);

  useEffect(() => {
    if (pendingAction?.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      if (action === "add-host") {
        setEditingHost("new");
        setEditingCredential(null);
        setEditingProtocols({
          enableSsh: true,
          enableRdp: false,
          enableVnc: false,
          enableTelnet: false,
        });
        setActiveHostTab("general");
      } else if (action === "add-credential") {
        setEditingCredential("new");
        setEditingHost(null);
        setActiveCredentialTab("general");
      }
    }
  }, [pendingEditId, pendingAction]);

  useEffect(() => {
    if (!active) return;
    const handleAddHost = () => {
      setEditingHost("new");
      setEditingCredential(null);
      setEditingProtocols({
        enableSsh: true,
        enableRdp: false,
        enableVnc: false,
        enableTelnet: false,
      });
      setActiveHostTab("general");
    };
    const handleAddCredential = () => {
      setEditingCredential("new");
      setEditingHost(null);
      setActiveCredentialTab("general");
    };
    const handleEditHost = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const host = hostsRef.current.find((h) => h.id === id);
      if (host) {
        setEditingHost(host);
        setEditingCredential(null);
        setActiveHostTab("general");
        setEditingProtocols({
          enableSsh: host.enableSsh,
          enableRdp: host.enableRdp,
          enableVnc: host.enableVnc,
          enableTelnet: host.enableTelnet,
        });
      }
    };
    // VRIT: credential toolbar actions (Select / Expand all / Collapse all).
    const handleToggleSelect = () =>
      setCredSelectionMode((on) => {
        if (on) setSelectedCredIds(new Set());
        return !on;
      });
    const handleExpandAll = () =>
      setOpenCredFolders(
        new Set(credentialsRef.current.map((c) => c.folder || "Uncategorized")),
      );
    const handleCollapseAll = () => setOpenCredFolders(new Set());
    window.addEventListener("host-manager:add-host", handleAddHost);
    window.addEventListener("host-manager:add-credential", handleAddCredential);
    window.addEventListener("host-manager:edit-host", handleEditHost);
    window.addEventListener("credentials:toggle-select", handleToggleSelect);
    window.addEventListener("credentials:expand-all", handleExpandAll);
    window.addEventListener("credentials:collapse-all", handleCollapseAll);
    return () => {
      window.removeEventListener("host-manager:add-host", handleAddHost);
      window.removeEventListener(
        "host-manager:add-credential",
        handleAddCredential,
      );
      window.removeEventListener("host-manager:edit-host", handleEditHost);
      window.removeEventListener(
        "credentials:toggle-select",
        handleToggleSelect,
      );
      window.removeEventListener("credentials:expand-all", handleExpandAll);
      window.removeEventListener("credentials:collapse-all", handleCollapseAll);
    };
  }, [active]);

  const allHosts = hosts;
  const searchedCredentials = credentials.filter((c) => {
    // VRIT: guard null name/username (key-only creds) — toLowerCase on null
    // crashed the page when typing in the credentials search.
    const q = effectiveSearch.toLowerCase();
    return (
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.username ?? "").toLowerCase().includes(q)
    );
  });
  const filteredCredentials = sortCredentials(
    externalFilter
      ? searchedCredentials.filter((c) =>
          credentialPassesFilters(c, externalFilter),
        )
      : searchedCredentials,
    externalSort ?? "default",
  );

  const credentialFolders = Array.from(
    new Set(filteredCredentials.map((c) => c.folder || "Uncategorized")),
  ).sort();

  const handleRenameCredentialFolder = async (
    folder: string,
    newName: string,
  ) => {
    try {
      await renameCredentialFolder(folder, newName);
      const res = await getCredentials();
      setCredentials(mapCredentials(res));
      toast.success(t("hosts.folderRenamedTo", { name: newName }));
    } catch {
      toast.error(t("hosts.failedToRenameFolder"));
    }
  };

  const handleDeleteCredential = async (cred: Credential) => {
    await deleteCredential(Number(cred.id));
    setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
  };

  const handleDuplicateCredential = async (cred: Credential) => {
    try {
      await duplicateCredential(Number(cred.id));
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(t("hosts.duplicatedCredential", { name: cred.name }));
    } catch {
      toast.error(t("hosts.failedToDuplicateCredential"));
    }
  };

  // VRIT: bulk actions for credential multi-select.
  const toggleCredSelected = (id: string) =>
    setSelectedCredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCredFolderOpen = (folder: string) =>
    setOpenCredFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const exitCredSelection = () => {
    setCredSelectionMode(false);
    setSelectedCredIds(new Set());
  };

  const handleBulkDeleteCredentials = () => {
    const ids = [...selectedCredIds];
    if (ids.length === 0) return;
    setConfirmDialog({
      message: t("credentials.bulkDeleteConfirm", { count: ids.length }),
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((id) => deleteCredential(Number(id))));
          setCredentials((prev) => prev.filter((c) => !selectedCredIds.has(c.id)));
          toast.success(t("credentials.bulkDeleted", { count: ids.length }));
        } catch {
          toast.error(t("hosts.failedToDeleteCredential2"));
        } finally {
          exitCredSelection();
        }
      },
    });
  };

  const handleMoveCredentialsToFolder = async (folder: string | null) => {
    const ids = [...selectedCredIds];
    if (ids.length === 0) return;
    try {
      await Promise.all(
        ids.map((id) => updateCredential(Number(id), { folder })),
      );
      setCredentials((prev) =>
        prev.map((c) =>
          selectedCredIds.has(c.id) ? { ...c, folder: folder ?? "" } : c,
        ),
      );
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(
        t("credentials.bulkMoved", {
          count: ids.length,
          folder: folder || t("credentials.noFolderLabel"),
        }),
      );
    } catch {
      toast.error(t("hosts.failedToRenameFolder"));
    } finally {
      exitCredSelection();
    }
  };

  // Editor view: full-width with top tab bar instead of side nav
  const renderEditorView = () => {
    const isHost = !!editingHost;
    const tabs = isHost
      ? makeHostTabs(t).filter((tab) => {
          if (tab.id === "general") return true;
          if (tab.id === "ssh") return editingProtocols.enableSsh;
          if (tab.id === "rdp") return editingProtocols.enableRdp;
          if (tab.id === "vnc") return editingProtocols.enableVnc;
          if (tab.id === "telnet") return editingProtocols.enableTelnet;
          return false;
        })
      : makeCredentialTabs(t);
    const activeTab = isHost ? activeHostTab : activeCredentialTab;
    const setActiveTab = isHost ? setActiveHostTab : setActiveCredentialTab;
    const showSshSubTabs =
      isHost &&
      editingProtocols.enableSsh &&
      SSH_GROUP_TABS.has(activeHostTab as never);
    const sshSubTabs = makeHostSshSubTabs(t);

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Back bar + tab strip */}
        <div className="flex flex-col shrink-0 border-b border-border">
          <button
            onClick={() => {
              if (isHost) {
                setEditingHost(null);
                setActiveHostTab("general");
              } else {
                setEditingCredential(null);
                setActiveCredentialTab("general");
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-b border-border/50"
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            <span>
              {isHost ? t("hosts.backToHosts") : t("hosts.backToCredentials")}
            </span>
            {isHost && editingHost !== "new" && (
              <span
                className="ml-auto font-semibold text-foreground truncate max-w-[200px]"
                title={(editingHost as Host).name}
              >
                {(editingHost as Host).name}
              </span>
            )}
          </button>
          <TabStrip
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(id) => {
              if (isHost && id === "ssh") {
                if (!SSH_GROUP_TABS.has(activeHostTab as never)) {
                  setActiveHostTab("ssh");
                }
              } else {
                setActiveTab(id);
              }
            }}
            isActive={
              isHost
                ? (id) =>
                    id === "ssh"
                      ? SSH_GROUP_TABS.has(activeHostTab as never)
                      : activeHostTab === id
                : undefined
            }
          />
          {showSshSubTabs && (
            <TabStrip
              tabs={sshSubTabs}
              activeTab={activeHostTab}
              onTabChange={setActiveHostTab}
              variant="secondary"
            />
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {isHost ? (
            <HostEditor
              key={
                editingHost === "new" ? "new-host" : (editingHost as Host).id
              }
              host={editingHost === "new" ? null : (editingHost as Host)}
              activeTab={activeHostTab}
              onBack={() => {
                setEditingHost(null);
                setActiveHostTab("general");
              }}
              onSave={(saved) => {
                const updated = sshHostToHost(saved);
                setHosts((prev) => {
                  const idx = prev.findIndex((h) => h.id === updated.id);
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = updated;
                    return next;
                  }
                  return [...prev, updated];
                });
                window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
                setEditingHost(null);
                setActiveHostTab("general");
              }}
              protocols={editingProtocols}
              onProtocolChange={(p) =>
                setEditingProtocols((prev) => ({ ...prev, ...p }))
              }
              onTabChange={setActiveHostTab}
              hosts={hosts}
              credentials={credentials}
            />
          ) : (
            <CredentialEditorView
              key={
                editingCredential === "new"
                  ? "new-cred"
                  : (editingCredential as Credential).id
              }
              credential={
                editingCredential === "new"
                  ? null
                  : (editingCredential as Credential)
              }
              activeTab={activeCredentialTab}
              onBack={() => {
                setEditingCredential(null);
                setActiveCredentialTab("general");
              }}
              onSave={(saved) => {
                setCredentials((prev) => {
                  const idx = prev.findIndex((c) => c.id === String(saved.id));
                  const updated: Credential = {
                    id: String(saved.id),
                    name: saved.name,
                    username: saved.username ?? "",
                    type: saved.authType === "key" ? "key" : "password",
                    value: saved.value,
                    password: saved.password,
                    publicKey: saved.publicKey,
                    passphrase: saved.passphrase,
                    description: saved.description,
                    folder: saved.folder ?? "",
                    tags: saved.tags ?? [],
                  };
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = updated;
                    return next;
                  }
                  return [...prev, updated];
                });
                setEditingCredential(null);
                setActiveCredentialTab("general");
              }}
            />
          )}
        </div>
      </div>
    );
  };

  const isEditing = !!editingHost || !!editingCredential;

  useEffect(() => {
    if (active) onEditingChange?.(isEditing);
  }, [isEditing, active]);

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
      {isEditing ? (
        renderEditorView()
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Search bar — hidden when parent supplies its own */}
          {!hideListHeader && (
            <div className="px-2 py-1.5 shrink-0 border-b border-border/40">
              <div className="flex items-center gap-2 px-2.5 h-7 bg-muted/60 border border-border/60">
                <Search className="size-3 text-muted-foreground/60 shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("hosts.searchCredentialsPlaceholder")}
                  className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 text-foreground min-w-0"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {credSelectionMode && (
            <CredentialSelectionBar
              count={selectedCredIds.size}
              folders={credentialFolders}
              onMove={handleMoveCredentialsToFolder}
              onDelete={handleBulkDeleteCredentials}
              onCancel={exitCredSelection}
            />
          )}

          <HostCredentialList
            credentialFolders={credentialFolders}
            filteredCredentials={filteredCredentials}
            credentialsLoading={credentialsLoading}
            allHosts={allHosts}
            editingFolderName={editingCredFolderName}
            editingFolderValue={editingCredFolderValue}
            termixIdLinkedIds={termixIdLinkedIds}
            onEditingFolderNameChange={setEditingCredFolderName}
            onEditingFolderValueChange={setEditingCredFolderValue}
            onRenameFolder={handleRenameCredentialFolder}
            onDeployCredential={(cred) => setDeployDialog({ cred, hostId: "" })}
            onEditCredential={(cred) => {
              setEditingCredential(cred);
              setActiveCredentialTab("general");
            }}
            onDuplicateCredential={handleDuplicateCredential}
            onDeleteCredential={handleDeleteCredential}
            onAddCredential={() => {
              setEditingCredential("new");
              setActiveCredentialTab("general");
            }}
            onConfirmDialogChange={setConfirmDialog}
            selectionMode={credSelectionMode}
            selectedIds={selectedCredIds}
            onToggleSelect={toggleCredSelected}
            openFolders={openCredFolders}
            onToggleFolder={toggleCredFolderOpen}
          />
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-popover border border-border shadow-xl w-full max-w-xs flex flex-col gap-4 p-4">
            <p className="text-sm text-foreground">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-3 py-1.5 text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                {t("hosts.cancelBtn")}
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-3 py-1.5 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded transition-colors"
              >
                {t("hosts.deleteConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy credential dialog */}
      {deployDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-popover border border-border shadow-xl w-full max-w-sm flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                {t("hosts.deploySSHKeyTitle")}
              </span>
              <button
                onClick={() => setDeployDialog(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("hosts.deployDialogDesc", { name: deployDialog.cred.name })}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.targetHostLabel")}
              </label>
              <select
                className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                value={deployDialog.hostId}
                onChange={(e) =>
                  setDeployDialog({ ...deployDialog, hostId: e.target.value })
                }
              >
                <option value="">{t("hosts.selectHostOption")}</option>
                {allHosts
                  .filter(
                    (h) =>
                      h.enableSsh ||
                      (!h.enableRdp && !h.enableVnc && !h.enableTelnet),
                  )
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name || h.ip}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeployDialog(null)}
                disabled={deploying}
              >
                {t("hosts.cancelBtn")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10"
                disabled={!deployDialog.hostId || deploying}
                onClick={async () => {
                  setDeploying(true);
                  try {
                    await deployCredentialToHost(
                      Number(deployDialog.cred.id),
                      Number(deployDialog.hostId),
                    );
                    toast.success(t("hosts.keyDeployedSuccess"));
                    setDeployDialog(null);
                  } catch {
                    toast.error(t("hosts.failedToDeployKey2"));
                  } finally {
                    setDeploying(false);
                  }
                }}
              >
                {deploying ? t("hosts.deployingBtn") : t("hosts.deployBtn")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
