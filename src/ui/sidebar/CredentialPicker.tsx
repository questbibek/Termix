import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, KeyRound, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";

/**
 * Searchable credential selector for the host editor — the same combobox
 * pattern as FolderPathPicker, so a long credential list can be filtered by
 * name or username instead of scrolling a native <select>.
 */
type CredentialOption = {
  id: string;
  name: string;
  username: string;
  type?: "key" | "password";
};

// KEY / PWD badge — same look as the credentials list, so the auth type is
// unambiguous when two credentials share a similar name.
function TypeBadge({ type }: { type?: "key" | "password" }) {
  const isKey = type === "key";
  return (
    <span
      className={`text-[9px] px-1 py-px font-bold border leading-none shrink-0 ${
        isKey
          ? "border-accent-brand/30 text-accent-brand"
          : "border-border/60 text-muted-foreground/60"
      }`}
    >
      {isKey ? "KEY" : "PWD"}
    </span>
  );
}

export function CredentialPicker({
  value,
  onChange,
  credentials,
}: {
  value: string;
  onChange: (id: string) => void;
  credentials: CredentialOption[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return credentials;
    return credentials.filter((c) =>
      `${c.name} ${c.username ?? ""}`.toLowerCase().includes(query),
    );
  }, [credentials, query]);

  const selected = credentials.find((c) => c.id === value);

  function commit(id: string) {
    onChange(id);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-9 w-full min-w-0 border border-border bg-background px-3 text-xs transition-colors hover:border-ring/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 outline-none"
        >
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0 flex-1">
              <KeyRound className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="truncate text-foreground">
                {selected.name}
                {selected.username ? (
                  <span className="text-muted-foreground/60">
                    {" "}
                    ({selected.username})
                  </span>
                ) : null}
              </span>
              <TypeBadge type={selected.type} />
            </span>
          ) : (
            <span className="flex-1 text-left text-muted-foreground">
              {t("hosts.selectACredential")}
            </span>
          )}
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                commit("");
              }}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="size-3" />
            </span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="w-(--radix-popover-trigger-width) max-h-(--radix-popover-content-available-height) p-0 rounded-none border-0 ring-1 ring-border shadow-md flex flex-col overflow-hidden"
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
                if (filtered.length > 0) commit(filtered[0].id);
              }
            }}
            placeholder={t("hosts.credentialPickerSearch")}
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 text-foreground min-w-0"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => commit(c.id)}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors ${
                c.id === value
                  ? "bg-accent/60 text-foreground"
                  : "text-foreground/80"
              }`}
            >
              <KeyRound className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="truncate flex-1">
                {c.name}
                {c.username ? (
                  <span className="text-muted-foreground/60"> ({c.username})</span>
                ) : null}
              </span>
              <TypeBadge type={c.type} />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t("hosts.credentialPickerEmpty")}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
