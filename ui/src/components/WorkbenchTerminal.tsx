import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Check, Copy, Loader2, Maximize2, RotateCcw, SquareTerminal, Trash2 } from "lucide-react";
import { workbenchApi } from "../api/workbench";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkbenchTerminalProps {
  companyId: string;
  projectId?: string | null;
  className?: string;
}

type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "error";

function websocketUrl(path: string) {
  const url = new URL(path, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseFrame(value: string) {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

function cssToken(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function WorkbenchTerminal({ companyId, projectId, className }: WorkbenchTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const inputDisposableRef = useRef<{ dispose(): void } | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dimensions = useCallback(() => ({
    cols: Math.max(20, terminalRef.current?.cols ?? 100),
    rows: Math.max(5, terminalRef.current?.rows ?? 30),
  }), []);

  const sendResize = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "resize", ...dimensions() }));
  }, [dimensions]);

  const fit = useCallback(() => {
    try {
      fitRef.current?.fit();
      sendResize();
    } catch { /* the terminal may be between layouts */ }
  }, [sendResize]);

  const requestFit = useCallback(() => {
    if (fitFrameRef.current !== null) window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
      fit();
    });
  }, [fit]);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "Operator closed terminal");
  }, []);

  const connect = useCallback(async () => {
    closeSocket();
    setState("connecting");
    setError(null);
    terminalRef.current?.reset();
    terminalRef.current?.writeln("\x1b[90mOpening secure workspace shell…\x1b[0m\r");
    fit();
    try {
      const session = await workbenchApi.createTerminalSession(companyId, projectId);
      setCwd(session.cwd);
      const socket = new WebSocket(websocketUrl(session.websocketPath));
      socketRef.current = socket;
      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        socket.send(JSON.stringify({ type: "auth", sessionId: session.sessionId, token: session.token, ...dimensions() }));
      };
      socket.onmessage = (event) => {
        if (socketRef.current !== socket || typeof event.data !== "string") return;
        const frame = parseFrame(event.data);
        if (!frame) return;
        if (frame.type === "ready") {
          setState("connected");
          terminalRef.current?.focus();
          requestFit();
        } else if (frame.type === "output" && typeof frame.data === "string") {
          terminalRef.current?.write(frame.data);
        } else if (frame.type === "error") {
          setState("error");
          setError(typeof frame.message === "string" ? frame.message : "The terminal could not be opened.");
        } else if (frame.type === "exit") {
          setState("closed");
          terminalRef.current?.writeln(`\r\n\x1b[90mShell exited (${String(frame.exitCode ?? 0)}).\x1b[0m`);
        }
      };
      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setState((current) => current === "error" ? current : "closed");
        if (event.code !== 1000 && event.reason) setError(event.reason);
      };
      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        setState("error");
        setError("The terminal connection was interrupted.");
      };
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "The terminal could not be opened.");
    }
  }, [closeSocket, companyId, dimensions, fit, projectId, requestFit]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || terminalRef.current) return;
    const terminal = new XTerm({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      customGlyphs: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 10_000,
      theme: {
        background: cssToken("--workbench-terminal-background", "black"),
        foreground: cssToken("--workbench-terminal-foreground", "whitesmoke"),
        cursor: cssToken("--workbench-terminal-cursor", "cyan"),
        selectionBackground: cssToken("--workbench-terminal-selection", "Highlight"),
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(element);
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    inputDisposableRef.current = terminal.onData((data) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
    });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(requestFit);
      resizeObserverRef.current.observe(element);
    }
    const timer = window.setTimeout(requestFit, 0);
    return () => {
      window.clearTimeout(timer);
      closeSocket();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
      terminal.dispose();
    };
  }, [closeSocket, requestFit]);

  useEffect(() => {
    const timer = window.setTimeout(() => void connect(), 0);
    return () => window.clearTimeout(timer);
  }, [connect]);

  const copyPath = async () => {
    if (!cwd) return;
    await navigator.clipboard.writeText(cwd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  const statusCopy = state === "connected" ? "Connected" : state === "connecting" ? "Connecting…" : state === "error" ? "Connection error" : state === "closed" ? "Session ended" : "Ready";

  return (
    <div className={cn("workbench-surface flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-neutral-950 shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-3 py-2 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <SquareTerminal className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-medium">Terminal</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", state === "connected" ? "bg-emerald-400" : state === "connecting" ? "animate-pulse bg-amber-300" : "bg-neutral-500")} />
          <span className="text-xs text-neutral-400">{statusCopy}</span>
        </div>
        <div className="flex items-center gap-1">
          {cwd ? <Button variant="ghost" size="sm" className="max-w-(--sz-24rem) text-neutral-300 hover:bg-white/10 hover:text-white" onClick={() => void copyPath()} title={cwd}>{copied ? <Check /> : <Copy />}<span className="hidden truncate sm:inline">{cwd}</span></Button> : null}
          <Button variant="ghost" size="icon-sm" className="text-neutral-300 hover:bg-white/10 hover:text-white" onClick={() => terminalRef.current?.clear()} aria-label="Clear terminal"><Trash2 /></Button>
          <Button variant="ghost" size="icon-sm" className="text-neutral-300 hover:bg-white/10 hover:text-white" onClick={requestFit} aria-label="Fit terminal"><Maximize2 /></Button>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => void connect()} disabled={state === "connecting"}>{state === "connecting" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restart</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-neutral-950 p-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-cyan-400/50">
        <div
          ref={containerRef}
          role="application"
          tabIndex={0}
          aria-label="Interactive workspace terminal"
          onClick={() => terminalRef.current?.focus()}
          onFocus={() => terminalRef.current?.focus()}
          className="h-full w-full overflow-hidden outline-none [&_.xterm]:h-full [&_.xterm-helper-textarea]:!opacity-0 [&_.xterm-screen]:focus:outline-none [&_.xterm-viewport]:!overflow-y-auto"
        />
      </div>
      {error ? <div className="border-t border-red-400/20 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error} <button type="button" className="ml-2 underline underline-offset-2" onClick={() => void connect()}>Try again</button></div> : null}
      <div className="flex items-center justify-between border-t border-white/10 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-500">
        <span>Host shell · {projectId ? "project workspace" : "company workspace"}</span>
        <span>Ctrl/Cmd+C copies selected text</span>
      </div>
    </div>
  );
}
