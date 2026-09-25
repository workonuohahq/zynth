"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const loadUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);

      setUnread(count ?? 0);
    };

    loadUnread();
    const timer = window.setInterval(loadUnread, 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Link
      href="/dashboard/notifications"
      className={"notification-bell" + (unread > 0 ? " has-unread" : "")}
      aria-label={unread > 0 ? `Notifications: ${unread} unread` : "Notifications"}
      title={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
    >
      <span className="notification-bell-glow" aria-hidden="true" />
      <Bell size={20} strokeWidth={2.2} />
      {unread > 0 && <span className="notification-badge">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}