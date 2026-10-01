"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export type ZynthNotificationType = "success" | "error" | "warning" | "info";
export type ZynthNotificationInput = {
  type?: ZynthNotificationType;
  title?: string;
  message: string;
  duration?: number;
};

type Toast = {
  id: string;
  type: ZynthNotificationType;
  title: string;
  message: string;
  duration: number;
};

const DURATIONS: Record<ZynthNotificationType, number> = {
  success: 3600,
  error: 5000,
  warning: 5000,
  info: 4000
};

const TITLES: Record<ZynthNotificationType, string> = {
  success: "Success",
  error: "Something went wrong",
  warning: "Attention required",
  info: "ZYNTH"
};

function cleanMessage(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/stack|traceback|syntaxerror|referenceerror/i.test(text)) return "";
  return text.length > 260 ? text.slice(0, 257).trimEnd() + "…" : text;
}

export function notify(input: ZynthNotificationInput | string) {
  if (typeof window === "undefined") return;
  const detail = typeof input === "string" ? { message: input, type: "info" as const } : input;
  window.dispatchEvent(new CustomEvent("zynth:notification", { detail }));
}

declare global {
  interface Window {
    zynthNotify?: typeof notify;
  }
}

export default function ZynthNotifications() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const timers = new Map<string, number>();
    const recent = new Map<string, number>();

    const remove = (id: string) => {
      setItems(current => current.filter(item => item.id !== id));
      const timer = timers.get(id);
      if (timer) window.clearTimeout(timer);
      timers.delete(id);
    };

    const push = (raw: ZynthNotificationInput | string) => {
      const input = typeof raw === "string" ? { message: raw } : raw;
      const type = input.type || "info";
      const message = cleanMessage(input.message);
      if (!message) return;

      const key = type + ":" + message;
      const now = Date.now();
      if (now - (recent.get(key) || 0) < 2200) return;
      recent.set(key, now);

      const id = String(now) + Math.random().toString(36).slice(2, 7);
      const duration = input.duration ?? DURATIONS[type];
      const toast: Toast = {
        id,
        type,
        title: cleanMessage(input.title) || TITLES[type],
        message,
        duration
      };

      setItems(current => [...current, toast].slice(-3));
      timers.set(id, window.setTimeout(() => remove(id), duration));
    };

    const onNotification = (event: Event) => {
      push((event as CustomEvent<ZynthNotificationInput | string>).detail);
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = cleanMessage(event.message);
      if (message) push({ type: "error", title: "Unexpected error", message });
    };

    const originalFetch = window.fetch.bind(window);
    const monitored = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    window.fetch = (async (...args: Parameters<typeof fetch>) => {
      const init = args[1];
      const method = String(init?.method || (args[0] instanceof Request ? args[0].method : "GET")).toUpperCase();
      try {
        const response = await originalFetch(...args);
        if (!response.ok && monitored.has(method)) {
          const payload = await response.clone().json().catch(() => ({}));
          const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
          const message = cleanMessage(data.error) || cleanMessage(data.message) || `ZYNTH could not complete that request (HTTP ${response.status}).`;
          push({ type: response.status >= 500 ? "error" : "warning", title: response.status >= 500 ? "Request failed" : "Action not completed", message });
        }
        return response;
      } catch (error) {
        if (monitored.has(method)) push({ type: "error", title: "Connection problem", message: cleanMessage(error instanceof Error ? error.message : "") || "ZYNTH could not reach the service. Please try again." });
        throw error;
      }
    }) as typeof window.fetch;

    window.addEventListener("zynth:notification", onNotification);
    window.addEventListener("error", onWindowError);
    window.zynthNotify = notify;

    return () => {
      window.removeEventListener("zynth:notification", onNotification);
      window.removeEventListener("error", onWindowError);
      window.fetch = originalFetch;
      window.zynthNotify = undefined;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="zynth-notification-region" aria-label="ZYNTH notifications">
      {items.map(item => {
        const Icon = item.type === "success" ? CheckCircle2 : item.type === "error" ? AlertCircle : item.type === "warning" ? AlertTriangle : Info;
        return (
          <article
            key={item.id}
            className={`zynth-toast zynth-toast-${item.type}`}
            role={item.type === "error" || item.type === "warning" ? "alert" : "status"}
            aria-live={item.type === "error" || item.type === "warning" ? "assertive" : "polite"}
          >
            <span className="zynth-toast-icon" aria-hidden="true"><Icon size={17} strokeWidth={2.1} /></span>
            <span className="zynth-toast-copy">
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </span>
            <button
              type="button"
              className="zynth-toast-close"
              onClick={() => setItems(current => current.filter(x => x.id !== item.id))}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
            <span className="zynth-toast-progress" style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />
          </article>
        );
      })}
    </div>
  );
}
