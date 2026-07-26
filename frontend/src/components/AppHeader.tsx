import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../lib/LanguageContext";
import { clearToken } from "../lib/auth";

interface AppHeaderProps {
  /** Page-specific action buttons rendered at the end of the top row */
  actions?: ReactNode;
  /** Optional extra content (e.g. quick stats) rendered next to the brand */
  stats?: ReactNode;
}

export function AppHeader({ actions, stats }: AppHeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, toggle } = useLanguage();

  const links = [
    { to: "/",          label: t.mapNav },
    { to: "/shipments", label: t.shipmentsNav },
    { to: "/analytics", label: t.analyticsNav },
    { to: "/suppliers", label: t.suppliersNav },
    { to: "/search",    label: t.cargoNav },
    { to: "/rates",     label: t.ratesNav },
    { to: "/cashflow",  label: t.cashflowNav },
    { to: "/settings",  label: t.settingsNav },
  ];

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-[1100] flex-shrink-0">
      {/* Red brand accent line */}
      <div className="h-0.5 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />
      <div className="max-w-7xl mx-auto px-4">
        {/* Top row: brand · stats · actions */}
        <div className="flex items-center justify-between gap-3 pt-3 pb-2 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5 group shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-md shadow-red-600/25 group-hover:from-red-400 group-hover:to-red-600 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
              </div>
              <div className="text-start">
                <h1 className="text-sm font-bold leading-tight tracking-tight text-slate-900">{t.appName}</h1>
                <p className="text-[11px] text-slate-500 leading-tight">{t.appSubtitle}</p>
              </div>
            </button>
            {stats}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={toggle} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              {t.langToggle}
            </button>
            <button
              onClick={() => { clearToken(); navigate("/login"); }}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {t.logout}
            </button>
            {actions}
          </div>
        </div>

        {/* Nav row */}
        <nav className="flex items-center gap-1 pb-2 overflow-x-auto">
          {links.map(link => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive(link.to)
                  ? "bg-red-600 text-white shadow-sm shadow-red-600/25"
                  : "text-slate-500 hover:text-red-700 hover:bg-red-50"
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
