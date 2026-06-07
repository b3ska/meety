"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",     label: "Dashboard",    icon: "dashboard" },
  { href: "/chat", label: "Knowledge Vault", icon: "psychology" },
  { href: "#",     label: "Insights",     icon: "analytics",     disabled: true },
  { href: "/recordings", label: "Recordings", icon: "video_library" },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: "#", label: "Settings", icon: "settings", disabled: true },
  { href: "#", label: "Support",  icon: "help",     disabled: true },
];

function DisabledNavItem({ item }: { item: NavItem }) {
  return (
    <div
      key={item.label}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-default select-none"
      style={{ color: "var(--text-3)" }}
      aria-disabled="true"
    >
      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20 }}>
        {item.icon}
      </span>
      <span className="text-sm flex-1">{item.label}</span>
      <span
        className="badge"
        style={{
          background: "rgba(141,144,160,0.15)",
          color: "var(--text-3)",
          fontSize: "10px",
          padding: "1px 6px",
        }}
      >
        Soon
      </span>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(item: NavItem) {
    if (item.disabled) return false;
    if (item.href === "/") return pathname === "/" || pathname.startsWith("/meetings");
    return pathname.startsWith(item.href);
  }

  return (
    <aside
      className="flex flex-col shrink-0 w-60"
      style={{
        minHeight: "100vh",
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* ── Brand ── */}
      <div
        className="flex items-center gap-3 px-6 py-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-center rounded-lg shrink-0 overflow-hidden"
          style={{
            width: 40,
            height: 40,
            background: "#fff",
          }}
        >
          <Image
            src="/logo.jpg"
            alt="Meety logo"
            width={40}
            height={40}
            style={{ objectFit: "contain" }}
            priority
          />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight" style={{ color: "var(--text-1)" }}>
            Meety
          </div>
          <div className="text-[11px] leading-tight" style={{ color: "var(--text-3)" }}>
            Meeting Intelligence
          </div>
        </div>
      </div>

      {/* ── New Meeting CTA ── */}
      <div className="px-4 pt-5 pb-2">
        <Link
          href="/"
          className="btn-primary w-full justify-center"
          style={{ borderRadius: "0.5rem" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          New Meeting
        </Link>
      </div>

      {/* ── Primary Nav ── */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          if (item.disabled) {
            return <DisabledNavItem key={item.label} item={item} />;
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200"
              style={
                active
                  ? {
                      borderLeft: "3px solid var(--accent)",
                      paddingLeft: "calc(0.75rem - 3px)",
                      background: "var(--bg-surface-high)",
                      color: "var(--accent)",
                    }
                  : {
                      color: "var(--text-2)",
                    }
              }
            >
              <span
                className="material-symbols-outlined shrink-0"
                style={{ fontSize: 20 }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer Nav ── */}
      <div
        className="px-2 pt-3 pb-4 flex flex-col gap-0.5"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {FOOTER_ITEMS.map((item) => (
          <DisabledNavItem key={item.label} item={item} />
        ))}
      </div>
    </aside>
  );
}
