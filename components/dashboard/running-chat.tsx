"use client";

import * as React from "react";
import { MessageCircle, Loader2, SendHorizonal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PanelState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragMode =
  | {
      kind: "move";
      pointerOffsetX: number;
      pointerOffsetY: number;
    }
  | {
      kind: "resize";
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      startPointerX: number;
      startPointerY: number;
      startPanel: PanelState;
    };

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const MIN_WIDTH = 340;
const MIN_HEIGHT = 360;
const PANEL_STORAGE_KEY = "runningCoachChatPanelState.v1";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAssistantText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function RunningChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask me anything about your running training. I will use your last 3 weeks of run data to answer.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const [panel, setPanel] = React.useState<PanelState>({
    x: 16,
    y: 16,
    width: 430,
    height: 520,
  });
  const [dragMode, setDragMode] = React.useState<DragMode | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const sendMessage = React.useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/running/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages.slice(-12),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; reply?: string; error?: string }
        | null;
      if (!res.ok || !json?.ok || !json.reply) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: normalizeAssistantText(json.reply!) },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMessage();
  }

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  React.useEffect(() => {
    const width = 430;
    const height = 520;
    const fallbackPanel = {
      x: Math.max(12, window.innerWidth - width - 20),
      y: Math.max(12, window.innerHeight - height - 20),
      width,
      height,
    };

    const raw = window.localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) {
      setPanel(fallbackPanel);
      setReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PanelState>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.width === "number" &&
        typeof parsed.height === "number"
      ) {
        const clampedWidth = clamp(parsed.width, MIN_WIDTH, window.innerWidth - 16);
        const clampedHeight = clamp(
          parsed.height,
          MIN_HEIGHT,
          window.innerHeight - 16,
        );
        const clampedX = clamp(parsed.x, 8, window.innerWidth - clampedWidth - 8);
        const clampedY = clamp(parsed.y, 8, window.innerHeight - clampedHeight - 8);
        setPanel({
          x: clampedX,
          y: clampedY,
          width: clampedWidth,
          height: clampedHeight,
        });
      } else {
        setPanel(fallbackPanel);
      }
    } catch {
      setPanel(fallbackPanel);
    }
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panel));
  }, [panel, ready]);

  React.useEffect(() => {
    function onResizeViewport() {
      setPanel((prev) => {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 16);
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 16);
        const width = clamp(prev.width, MIN_WIDTH, maxWidth);
        const height = clamp(prev.height, MIN_HEIGHT, maxHeight);
        const x = clamp(prev.x, 8, Math.max(8, window.innerWidth - width - 8));
        const y = clamp(prev.y, 8, Math.max(8, window.innerHeight - height - 8));
        return { x, y, width, height };
      });
    }
    window.addEventListener("resize", onResizeViewport);
    return () => window.removeEventListener("resize", onResizeViewport);
  }, []);

  React.useEffect(() => {
    if (!dragMode) return;
    const mode = dragMode;

    function onPointerMove(e: PointerEvent) {
      setPanel((prev) => {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 16);
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 16);

        if (mode.kind === "move") {
          const nextX = clamp(
            e.clientX - mode.pointerOffsetX,
            8,
            Math.max(8, window.innerWidth - prev.width - 8),
          );
          const nextY = clamp(
            e.clientY - mode.pointerOffsetY,
            8,
            Math.max(8, window.innerHeight - prev.height - 8),
          );
          return { ...prev, x: nextX, y: nextY };
        }

        const dx = e.clientX - mode.startPointerX;
        const dy = e.clientY - mode.startPointerY;
        const start = mode.startPanel;

        let nextX = start.x;
        let nextY = start.y;
        let nextWidth = start.width;
        let nextHeight = start.height;

        if (mode.corner === "top-left" || mode.corner === "bottom-left") {
          const maxX = start.x + start.width - MIN_WIDTH;
          nextX = clamp(start.x + dx, 8, maxX);
          nextWidth = start.width + (start.x - nextX);
        }

        if (mode.corner === "top-right" || mode.corner === "bottom-right") {
          nextWidth = clamp(start.width + dx, MIN_WIDTH, window.innerWidth - start.x - 8);
        }

        if (mode.corner === "top-left" || mode.corner === "top-right") {
          const maxY = start.y + start.height - MIN_HEIGHT;
          nextY = clamp(start.y + dy, 8, maxY);
          nextHeight = start.height + (start.y - nextY);
        }

        if (mode.corner === "bottom-left" || mode.corner === "bottom-right") {
          nextHeight = clamp(
            start.height + dy,
            MIN_HEIGHT,
            window.innerHeight - start.y - 8,
          );
        }

        nextWidth = clamp(nextWidth, MIN_WIDTH, maxWidth);
        nextHeight = clamp(nextHeight, MIN_HEIGHT, maxHeight);
        nextX = clamp(nextX, 8, Math.max(8, window.innerWidth - nextWidth - 8));
        nextY = clamp(nextY, 8, Math.max(8, window.innerHeight - nextHeight - 8));
        return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
      });
    }

    function onPointerUp() {
      setDragMode(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragMode]);

  function startMove(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setDragMode({
      kind: "move",
      pointerOffsetX: e.clientX - panel.x,
      pointerOffsetY: e.clientY - panel.y,
    });
  }

  function startResize(
    e: React.PointerEvent<HTMLButtonElement>,
    corner: ResizeCorner,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setDragMode({
      kind: "resize",
      corner,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startPanel: panel,
    });
  }

  if (collapsed) {
    if (!ready) return null;
    return (
      <button
        type="button"
        onClick={() => {
          // Snap panel to bottom-right on reopen.
          setPanel((prev) => {
            const width = prev.width;
            const height = prev.height;
            const x = Math.max(12, window.innerWidth - width - 20);
            const y = Math.max(12, window.innerHeight - height - 20);
            return { ...prev, x, y };
          });
          setCollapsed(false);
        }}
        className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full border border-amber-900/20 bg-card px-4 py-2 text-sm font-medium text-stone-800 shadow-md transition-colors hover:bg-amber-50"
      >
        <MessageCircle className="h-4 w-4 text-orange-600" />
        Coach Chat
        <ChevronUp className="h-4 w-4 text-stone-500" />
      </button>
    );
  }

  return (
    <div
      style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
      className="fixed z-40 flex flex-col rounded-2xl border border-amber-900/20 bg-card shadow-lg"
    >
      <div
        onPointerDown={startMove}
        className="flex cursor-move items-center justify-between gap-3 border-b border-amber-900/10 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Running Coach Chat</h2>
            <p className="text-[11px] text-stone-500">Uses your last 3 weeks of run data</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-900/15 bg-background/60 px-2 text-xs font-medium text-stone-600 transition-colors hover:bg-amber-50/60 hover:text-stone-800"
          aria-label="Collapse coach chat"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Collapse
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col space-y-2 px-4 py-3">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-amber-900/15 bg-stone-50 p-3"
        >
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={cn(
                "max-w-[94%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "ml-auto bg-stone-900 text-white"
                  : "mr-auto border border-amber-900/12 bg-amber-50/50 text-stone-700",
              )}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-amber-900/12 bg-amber-50/50 px-3 py-2 text-sm text-stone-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your upcoming training..."
            className="h-10 flex-1 rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
            maxLength={1200}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-stone-900 px-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
          >
            <SendHorizonal className="h-4 w-4" />
            Send
          </button>
        </form>
      </div>
      <button
        type="button"
        onPointerDown={(e) => startResize(e, "top-left")}
        className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize rounded-tl-2xl"
        aria-label="Resize from top left"
        title="Drag to resize"
      />
      <button
        type="button"
        onPointerDown={(e) => startResize(e, "top-right")}
        className="absolute top-0 right-0 h-4 w-4 cursor-nesw-resize rounded-tr-2xl"
        aria-label="Resize from top right"
        title="Drag to resize"
      />
      <button
        type="button"
        onPointerDown={(e) => startResize(e, "bottom-left")}
        className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize rounded-bl-2xl"
        aria-label="Resize from bottom left"
        title="Drag to resize"
      />
      <button
        type="button"
        onPointerDown={(e) => startResize(e, "bottom-right")}
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize rounded-br-2xl"
        aria-label="Resize chat panel"
        title="Drag to resize"
      />
    </div>
  );
}
