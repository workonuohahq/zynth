"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export type ZynthNotificationType = "success" | "error" | "warning" | "info";
export type ZynthNotificationInput = {
  type?: ZynthNotificationType;
  title?: string;
  message: string;
  duration?: number;
};

type Toast = Required<Pick<ZynthNotificationInput, "message">> & {
  id: string;
  type: ZynthNotificationType;
  title: string;
  duration: number;
};

const DEFAULT_DURATION: Record<ZynthNotificationType, number> = {
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
  if (/stack|traceback|syntaxerror|referenceerror|at [\\w$]+ \\(/i.test(text)) return "";
  return text.length > 260 ? text.slice(0, 257).trimEnd() + "…" : text;
}

function extractApiMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  return cleanMessage(data.error) || cleanMessage(data.message) || cleanMessage(data.detail);
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

      const dedupeKey = type + ":" + message;
      const now = Date.now();
      const last = recent.get(dedupeKey) || 0;
      if (now - last < 2200) return;
      recent.set(dedupeKey, now);

      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.duration ?? DEFAULT_DURATION[type];
      const toast: Toast = {
        id,
        type,
        message,
        title: cleanMessage(input.title) || TITLES[type],
        duration
      };

      setItems(current => [...current, toast].slice(-3));
      timers.set(id, window.setTimeout(() => remove(id), duration));
    };

    const onNotification = (event: Event) => {
      const custom = event as CustomEvent<ZynthNotificationInput | string>;
      push(custom.detail);
    };

    window.addEventListener("zynth:notification", onNotification);
    window.zynthNotify = notify;

    const originalFetch = window.fetch.bind(window);
    const monitoredMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      try {
        const response = await originalFetch(input, init);
        if (!response.ok && monitoredMethods.has(method)) {
          try {
            const body = await response.clone().json();
            push({
              type: response.status >= 500 ? "error" : "warning",
              title: response.status >= 500 ? "Request failed" : "Action not completed",
              message: extractApiMessage(body) || `ZYNTH could not complete that request (HTTP ${response.status}).`
            });
          } catch {
            push({
              type: response.status >= 500 ? "error" : "warning",
              title: response.status >= 500 ? "Request failed" : "Action not completed",
              message: `ZYNTH could not complete that request (HTTP ${response.status}).`
            });
          }
        }
        return response;
      } catch (error) {
        if (monitoredMethods.has(method)) {
          push({
            type: "error",
            title: "Connection problem",
            message: error instanceof Error && cleanMessage(error.message) ? cleanMessage(error.message) : "ZYNTH could not reach the service. Please try again."
          });
        }
        throw error;
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = cleanMessage(event.reason?.message || event.reason);
      if (message) push({ type: "error", title: "Unexpected error", message });
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("zynth:notification", onNotification);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      if (window.fetch === originalFetch || window.fetch) window.fetch = originalFetch;
      window.zynthNotify = undefined;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="zynth-notification-region" aria-label="ZYNTH notifications">
      {items.map(item => {
        const Icon = item.type === "success" ? CheckCircle2 : item.type === "error" ? AlertCircle : item.type === "warning" ? TriangleAlert : Info;
        return (
          <article key={item.id} className={`zynth-toast zynth-toast-${item.type}`} role={item.type === "error" || item.type === "warning" ? "alert" : "status"} aria-live={item.type === "error" || item.type === "warning" ? "assertive" : "polite"}>
            <span className="zynth-toast-icon" aria-hidden="true"><Icon size={17} strokeWidth={2.1} /></span>
            <span className="zynth-toast-copy">
              <strong>{item.title}</strong>
              <span>{item.message}</span>
            </span>
            <button type="button" className="zynth-toast-close" onClick={() => setItems(current => current.filter(x => x.id !== item.id))} aria-label="Dismiss notification">
              <X size={15} />
            </button>
            <span className="zynth-toast-progress" style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />
          </article>
        );
      })}
    </div>
  );
}
