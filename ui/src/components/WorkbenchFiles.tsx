import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { workbenchApi, type WorkbenchEntry } from "../api/workbench";
import { useToastActions } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface WorkbenchFilesProps {
  companyId: string;
  projectId?: string | null;
  className?: string;
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function parentPath(value: string) {
  const parts = value.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function entryIcon(entry: WorkbenchEntry) {
  if (entry.kind === "directory") return Folder;
  if (entry.contentType?.startsWith("image/")) return FileImage;
  if (entry.contentType?.startsWith("text/") || entry.contentType?.includes("json")) return FileCode2;
  if (entry.contentType === "application/pdf") return FileText;
  if (/\.(zip|tar|gz|rar|7z)$/i.test(entry.name)) return FileArchive;
  return File;
}

function isProtectedEntry(entry: WorkbenchEntry) {
  return entry.path.split("/").some((segment) => segment === ".git" || segment === ".paperclip");
}

function fileKey(companyId: string, projectId: string | null | undefined, path: string) {
  return ["workbench", "file", companyId, projectId ?? "company", path] as const;
}

function listKey(companyId: string, projectId: string | null | undefined, path: string, query: string) {
  return ["workbench", "files", companyId, projectId ?? "company", path, query] as const;
}

export function WorkbenchFiles({ companyId, projectId, className }: WorkbenchFilesProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<WorkbenchEntry | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "directory" | null>(null);
  const [createName, setCreateName] = useState("");
  const [renameEntry, setRenameEntry] = useState<WorkbenchEntry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<WorkbenchEntry | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const listQuery = useQuery({
    queryKey: listKey(companyId, projectId, path, debouncedSearch),
    queryFn: ({ signal }) => workbenchApi.list(companyId, { projectId, path, q: debouncedSearch }, signal),
  });
  const fileQuery = useQuery({
    queryKey: fileKey(companyId, projectId, selected?.path ?? ""),
    queryFn: ({ signal }) => workbenchApi.read(companyId, { projectId, path: selected!.path }, signal),
    enabled: selected?.kind === "file" && !selected.restricted,
    retry: false,
  });

  useEffect(() => {
    if (fileQuery.data?.kind !== "text") return;
    setDraft(fileQuery.data.content ?? "");
    setDirty(false);
  }, [fileQuery.data]);

  useEffect(() => {
    setSelected(null);
    setDirty(false);
  }, [companyId, projectId, path]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workbench", "files", companyId, projectId ?? "company"] });
  };
  const mutationOptions = {
    onError: (error: Error) => pushToast({ title: error.message, tone: "error" as const }),
  };
  const createMutation = useMutation({
    mutationFn: async () => {
      const destination = joinPath(path, createName.trim());
      if (createKind === "directory") return workbenchApi.createFolder(companyId, { projectId, path: destination });
      return workbenchApi.saveFile(companyId, { projectId, path: destination, content: "" });
    },
    onSuccess: async () => {
      setCreateKind(null);
      setCreateName("");
      await invalidate();
      pushToast({ title: createKind === "directory" ? "Folder created" : "File created", tone: "success" });
    },
    ...mutationOptions,
  });
  const renameMutation = useMutation({
    mutationFn: () => workbenchApi.move(companyId, {
      projectId,
      path: renameEntry!.path,
      destination: joinPath(parentPath(renameEntry!.path), renameName.trim()),
    }),
    onSuccess: async () => {
      setRenameEntry(null);
      setSelected(null);
      await invalidate();
      pushToast({ title: "Renamed", tone: "success" });
    },
    ...mutationOptions,
  });
  const deleteMutation = useMutation({
    mutationFn: () => workbenchApi.remove(companyId, {
      projectId,
      path: deleteEntry!.path,
      recursive: deleteEntry!.kind === "directory",
    }),
    onSuccess: async () => {
      setDeleteEntry(null);
      setSelected(null);
      await invalidate();
      pushToast({ title: "Deleted", tone: "success" });
    },
    ...mutationOptions,
  });
  const saveMutation = useMutation({
    mutationFn: () => workbenchApi.saveFile(companyId, {
      projectId,
      path: selected!.path,
      content: draft,
      expectedModifiedAt: fileQuery.data?.modifiedAt,
    }),
    onSuccess: async ({ file }) => {
      queryClient.setQueryData(fileKey(companyId, projectId, file.path), file);
      setDirty(false);
      await invalidate();
      pushToast({ title: "File saved", tone: "success" });
    },
    ...mutationOptions,
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => workbenchApi.upload(companyId, { projectId, path, file }),
    onSuccess: async () => {
      await invalidate();
      pushToast({ title: "Upload complete", tone: "success" });
    },
    ...mutationOptions,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && dirty && selected) {
        event.preventDefault();
        saveMutation.mutate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saveMutation, selected]);

  const navigateTo = (nextPath: string) => {
    if (dirty && !window.confirm("Discard the unsaved changes?")) return;
    setHistory((current) => [...current, path]);
    setPath(nextPath);
    setSearch("");
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setHistory((current) => current.slice(0, -1));
    setPath(previous);
  };
  const openEntry = (entry: WorkbenchEntry) => {
    if (entry.kind === "directory") navigateTo(entry.path);
    else setSelected(entry);
  };

  const breadcrumbParts = useMemo(() => path.split("/").filter(Boolean), [path]);
  const root = listQuery.data?.root;
  const entries = listQuery.data?.entries ?? [];
  const selectedDownload = selected && !selected.restricted
    ? workbenchApi.downloadUrl(companyId, { projectId, path: selected.path })
    : null;
  const selectedPreview = selected && !selected.restricted
    ? workbenchApi.previewUrl(companyId, { projectId, path: selected.path })
    : null;

  return (
    <div className={cn("workbench-surface flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={goBack} disabled={history.length === 0} aria-label="Back">
            <ArrowLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigateTo(parentPath(path))} disabled={!path} aria-label="Up one folder">
            <Folder />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void listQuery.refetch()} aria-label="Refresh files">
            <RefreshCw className={cn(listQuery.isFetching && "animate-spin")} />
          </Button>
        </div>

        <nav className="flex min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-border bg-background px-2 py-1 text-sm" aria-label="Current folder">
          <button type="button" onClick={() => navigateTo("")} className="flex shrink-0 items-center gap-1.5 font-medium hover:text-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            {root?.name ?? "Workspace"}
          </button>
          {breadcrumbParts.map((part, index) => (
            <span key={`${part}-${index}`} className="flex shrink-0 items-center">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button type="button" onClick={() => navigateTo(breadcrumbParts.slice(0, index + 1).join("/"))} className="hover:text-foreground">
                {part}
              </button>
            </span>
          ))}
        </nav>

        <div className="relative min-w-44 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this workspace" className="h-9 pl-8" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm"><Plus />New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setCreateKind("file")}><File className="mr-2" />New file</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCreateKind("directory")}><FolderPlus className="mr-2" />New folder</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => uploadRef.current?.click()}><Upload className="mr-2" />Upload file</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={uploadRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="workbench-files-grid grid min-h-0 flex-1">
        <section className="min-h-0 overflow-auto border-b border-border lg:border-b-0 lg:border-r" aria-label="Files">
          <div className="sticky top-0 z-10 grid grid-cols-(--grid-workbench-file-row) gap-3 border-b border-border bg-background/95 px-3 py-2 text-(length:--text-micro) font-medium uppercase tracking-(--tracking-caps) text-muted-foreground backdrop-blur">
            <span>Name</span><span>Size</span><span>Modified</span><span />
          </div>
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Loading files…</div>
          ) : listQuery.error ? (
            <div className="p-6 text-sm"><p className="font-medium text-destructive">Files are unavailable</p><p className="mt-1 text-muted-foreground">{listQuery.error.message}</p></div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Folder className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">{debouncedSearch ? "No matching files" : "This folder is empty"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{debouncedSearch ? "Try a different search." : "Create a file, a folder, or upload something."}</p>
            </div>
          ) : (
            <div role="listbox" aria-label="Workspace entries">
              {entries.map((entry) => {
                const Icon = entryIcon(entry);
                const protectedEntry = isProtectedEntry(entry);
                return (
                  <div
                    key={entry.path}
                    role="option"
                    aria-selected={selected?.path === entry.path}
                    tabIndex={0}
                    onClick={() => setSelected(entry)}
                    onDoubleClick={() => openEntry(entry)}
                    onKeyDown={(event) => { if (event.key === "Enter") openEntry(entry); }}
                    className={cn(
                      "group grid cursor-default grid-cols-(--grid-workbench-file-row) items-center gap-3 border-b border-border/50 px-3 py-2 text-sm outline-none transition-colors hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                      selected?.path === entry.path && "bg-accent",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={cn("h-4 w-4 shrink-0", entry.kind === "directory" ? "text-blue-500" : "text-muted-foreground")} />
                      <span className={cn("truncate", entry.hidden && "text-muted-foreground")}>{entry.name}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{entry.kind === "directory" ? "—" : formatBytes(entry.size)}</span>
                    <span className="truncate text-xs text-muted-foreground">{new Date(entry.modifiedAt).toLocaleDateString()}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${entry.name}`} onClick={(event) => event.stopPropagation()}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEntry(entry)}>{entry.kind === "directory" ? <Folder className="mr-2" /> : <File className="mr-2" />}Open</DropdownMenuItem>
                        {entry.kind === "file" && !entry.restricted ? <DropdownMenuItem asChild><a href={workbenchApi.downloadUrl(companyId, { projectId, path: entry.path })}><Download className="mr-2" />Download</a></DropdownMenuItem> : null}
                        {!protectedEntry ? <DropdownMenuItem onSelect={() => { setRenameEntry(entry); setRenameName(entry.name); }}><Pencil className="mr-2" />Rename</DropdownMenuItem> : null}
                        {!protectedEntry ? <DropdownMenuSeparator /> : null}
                        {!protectedEntry ? <DropdownMenuItem variant="destructive" onSelect={() => setDeleteEntry(entry)}><Trash2 className="mr-2" />Delete</DropdownMenuItem> : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
          {listQuery.data?.truncated ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Results are limited. Narrow your search to see more.</p> : null}
        </section>

        <section className="flex min-h-0 flex-col bg-muted/10" aria-label="File preview">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <File className="mb-3 h-9 w-9 text-muted-foreground/40" />
              <p className="text-sm font-medium">Select a file</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Preview and edit text files here. Double-click a folder to open it.</p>
            </div>
          ) : selected.kind === "directory" ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <Folder className="mb-3 h-10 w-10 text-blue-500/70" />
              <p className="font-medium">{selected.name}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => navigateTo(selected.path)}>Open folder</Button>
            </div>
          ) : selected.restricted ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <File className="mb-3 h-9 w-9 text-muted-foreground/50" />
              <p className="font-medium">Preview protected</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Secret-like files stay hidden in the explorer. Use the terminal only when you intentionally need host-level access.</p>
            </div>
          ) : fileQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Opening {selected.name}…</div>
          ) : fileQuery.error ? (
            <div className="p-6 text-sm"><p className="font-medium text-destructive">Preview unavailable</p><p className="mt-1 text-muted-foreground">{fileQuery.error.message}</p></div>
          ) : fileQuery.data?.kind === "text" ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{selected.name}</p><p className="text-xs text-muted-foreground">{formatBytes(fileQuery.data.size)} · {dirty ? "Unsaved changes" : "Saved"}</p></div>
                <div className="flex items-center gap-1">
                  {selectedDownload ? <Button variant="ghost" size="icon-sm" asChild><a href={selectedDownload} aria-label="Download file"><Download /></a></Button> : null}
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}><Save />Save</Button>
                </div>
              </div>
              <textarea
                value={draft}
                onChange={(event) => { setDraft(event.target.value); setDirty(true); }}
                spellCheck={false}
                aria-label={`Edit ${selected.name}`}
                className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              />
            </>
          ) : fileQuery.data?.contentType?.startsWith("image/") && selectedDownload && selectedPreview ? (
            <div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-border bg-background px-3 py-2"><p className="truncate text-sm font-medium">{selected.name}</p><Button variant="outline" size="sm" asChild><a href={selectedDownload}><Download />Download</a></Button></div><div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"><img src={selectedPreview} alt={selected.name} className="max-h-full max-w-full object-contain shadow-sm" /></div></div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><File className="mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No inline preview</p><p className="mt-1 text-xs text-muted-foreground">{selected.name} · {formatBytes(selected.size)}</p>{selectedDownload ? <Button className="mt-4" variant="outline" size="sm" asChild><a href={selectedDownload}><Download />Download</a></Button> : null}</div>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{entries.length} {entries.length === 1 ? "item" : "items"}</span>
        <span className="truncate font-mono">{root?.path ?? "Resolving workspace…"}</span>
      </div>

      <Dialog open={createKind !== null} onOpenChange={(open) => { if (!open) setCreateKind(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{createKind === "directory" ? "New folder" : "New file"}</DialogTitle><DialogDescription>Created inside {path || root?.name || "the workspace"}.</DialogDescription></DialogHeader>
          <Input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={createKind === "directory" ? "Folder name" : "filename.md"} autoFocus onKeyDown={(event) => { if (event.key === "Enter" && createName.trim()) createMutation.mutate(); }} />
          <DialogFooter showCloseButton><Button onClick={() => createMutation.mutate()} disabled={!createName.trim() || createMutation.isPending}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameEntry !== null} onOpenChange={(open) => { if (!open) setRenameEntry(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename {renameEntry?.name}</DialogTitle><DialogDescription>Use a name without path separators.</DialogDescription></DialogHeader>
          <Input value={renameName} onChange={(event) => setRenameName(event.target.value)} autoFocus onKeyDown={(event) => { if (event.key === "Enter" && renameName.trim()) renameMutation.mutate(); }} />
          <DialogFooter showCloseButton><Button onClick={() => renameMutation.mutate()} disabled={!renameName.trim() || renameMutation.isPending}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteEntry !== null} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleteEntry?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the {deleteEntry?.kind === "directory" ? "folder and everything inside it" : "file"} from the host.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
