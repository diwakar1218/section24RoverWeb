"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  Crosshair,
  LayoutDashboard,
  MapPinned,
  Users,
  Radio,
  Laptop,
  X,
  ClipboardList,
  ChartNoAxesCombined,
  LogOut,
  Search,
  Menu,
  ChevronDown,
  ShieldCheck,
  Sun,
  Moon,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "./providers";
import { Button } from "./ui/button";
const Language = createContext({ hindi: false });
export const useLanguage = () => useContext(Language);
const navigation = [
  {
    href: "/dashboard",
    label: "Overview",
    hi: "अवलोकन",
    icon: LayoutDashboard,
    permission: "dashboard.read",
  },
  { href: "/dashboard/mobile-surveys", label: "Survey list", hi: "????? ????", icon: ClipboardList, permission: "surveys.read" },
  {
    href: "/dashboard/live-tracking",
    label: "Live tracking",
    hi: "लाइव ट्रैकिंग",
    icon: MapPinned,
    permission: "rovers.read",
  },
  {
    href: "/dashboard/rovers",
    label: "GNSS rovers",
    hi: "GNSS रोवर",
    icon: Radio,
    permission: "rovers.read",
  },
  {
    href: "/dashboard/devices",
    label: "Devices & connections",
    hi: "डिवाइस और कनेक्शन",
    icon: Laptop,
    permission: "devices.manage",
  },
  {
    href: "/dashboard/users",
    label: "People & teams",
    hi: "उपयोगकर्ता और टीम",
    icon: Users,
    permission: "users.read",
  },
  {
    href: "/dashboard/surveys",
    label: "Survey jobs",
    hi: "सर्वेक्षण कार्य",
    icon: ClipboardList,
    permission: "surveys.read",
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    hi: "रिपोर्ट",
    icon: ChartNoAxesCombined,
    permission: "reports.read",
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const { ready, profile, demo, signOut, sessionError, retrySession } = useAuth(),
    router = useRouter(),
    path = usePathname();
  const [mobile, setMobile] = useState(false),
    [hindi, setHindi] = useState(false),
    [dark, setDark] = useState(false),
    [search, setSearch] = useState(""),
    [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (ready && !profile) router.replace("/login");
  }, [ready, profile, router]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = hindi ? "hi" : "en";
  }, [dark, hindi]);
  if (sessionError && !profile) return <div className="session-reconnect"><ShieldCheck size={36}/><h1>Reconnecting to your workspace</h1><p>{sessionError}</p><button className="button" onClick={retrySession}>Try again</button><small>Your browser session has been retained.</small></div>;
  if (!ready || !profile)
    return (
      <div className="loading-screen">
        <Crosshair className="spin" />
        <p>Connecting to your workspace…</p>
      </div>
    );
  return (
    <Language.Provider value={{ hindi }}>
      <div className="workspace">
        <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
          <button className="icon-button mobile-sidebar-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={18} /></button>
          <Link href="/dashboard" className="brand">
            <span className="brand-symbol">
              <Crosshair size={24} />
            </span>
            <span>
              SURVEY<span className="brand-light">COMMAND</span>
              <small>FIELD OPERATIONS</small>
            </span>
          </Link>
          <div className="org-switch">
            <span className="org-icon">SO</span>
            <div>
              <strong>Survey Operations</strong>
              <small>
                {demo ? "Development workspace" : "Organization workspace"}
              </small>
            </div>
            <ShieldCheck size={16} />
          </div>
          <span className="nav-label">{hindi ? "कार्यस्थल" : "WORKSPACE"}</span>
          <nav aria-label="Main navigation">
            {navigation
              .filter((item) =>
                profile.grants.some((g) => g.permission === item.permission && (item.permission !== "devices.manage" || g.scope === "Organization")),
              )
              .map((item) => {
                const Icon = item.icon,
                  active =
                    item.href === "/dashboard"
                      ? path === item.href
                      : path.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    className={active ? "nav-item active" : "nav-item"}
                    href={item.href}
                    onClick={() => setMobile(false)}
                  >
                    <Icon size={18} />
                    {hindi ? item.hi : item.label}
                    {item.href.includes("live") && (
                      <span className="live-nav-dot" />
                    )}
                  </Link>
                );
              })}
          </nav>
          <div className="sidebar-bottom">
            <div className="field-note">
              <span className="eyebrow">BUILT FOR THE FIELD</span>
              <strong>Precision. In perspective.</strong>
              <p>
                GNSS telemetry and operational activity, together in one place.
              </p>
              <MapPinned size={38} strokeWidth={1} />
            </div>
            <div className="sidebar-status">
              <span className="dot green" />
              {demo ? "Simulated environment" : "Authorized workspace"}
              <span>v0.2</span>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="mobile-backdrop"
            aria-label="Dismiss navigation overlay"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="workspace-main">
          <header className="topbar">
            <div className="breadcrumb">
              <Button
                variant="ghost"
                className="mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={19} />
              </Button>
              <span>Workspace</span>
              <span>/</span>
              <strong>
                {navigation.find((n) => n.href === path)?.label ?? "Details"}
              </strong>
            </div>
            <div className="topbar-actions">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(
                    `/dashboard/rovers?search=${encodeURIComponent(search)}`,
                  );
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search rovers"
                  placeholder="Search rovers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <button
                className="icon-button language-toggle"
                onClick={() => setHindi(!hindi)}
                aria-label="Switch language"
              >
                {hindi ? "EN" : "हिं"}
              </button>
              <button
                className="icon-button"
                onClick={() => setDark(!dark)}
                aria-label="Toggle color theme"
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="profile-menu">
                <span className="avatar">
                  {profile.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.grants.some((g) => g.scope === "Organization")
                      ? "Organization access"
                      : "Assigned jurisdiction"}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={() =>
                    void signOut().catch(() =>
                      setLogoutError(
                        "Local session cleared. Server sign-out could not be confirmed.",
                      ),
                    )
                  }
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </header>
          {demo && (
            <div className="demo-banner">
              <span className="dot amber" />
              <strong>DEMO MODE</strong> Simulated devices and positions · No
              live Trimble hardware connected{" "}
              <span>
                Development preview <ArrowUpRight size={13} />
              </span>
            </div>
          )}
          {logoutError && (
            <div role="alert" className="error-box">
              {logoutError}
            </div>
          )}
          <main className="page-content">{children}</main>
          <footer className="footer">
            <span>
              Survey Command <span> / </span> Centralized GNSS Monitoring
            </span>
            <span>
              <ShieldCheck size={13} /> Permission-controlled access · All times
              IST
            </span>
          </footer>
        </div>
      </div>
    </Language.Provider>
  );
}
