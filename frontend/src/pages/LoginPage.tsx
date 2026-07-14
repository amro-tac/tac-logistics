import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/shipments";
import { setToken, setDemoMode } from "../lib/auth";
import { useLanguage } from "../lib/LanguageContext";

export function LoginPage() {
  const { t, toggle } = useLanguage();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [fullName, setFullName]   = useState("");
  const [company, setCompany]     = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(email, password);
      navigate("/", { replace: true });
    } catch {
      setError(t.loginError);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await api.register(email, password, fullName, company);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDemo() {
    setDemoMode();
    navigate("/", { replace: true });
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
  }

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-colors";

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full bg-red-100/70 blur-[120px]" />
        <div className="absolute bottom-0 end-0 w-[420px] h-[420px] rounded-full bg-slate-100 blur-[100px]" />
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />
      </div>

      <div className="flex justify-end p-4 relative">
        <button onClick={toggle} className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all">
          {t.langToggle}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 relative">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl mb-4 shadow-lg shadow-red-600/30">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t.appName}</h1>
            <p className="text-sm text-slate-500 mt-1">{t.loginSubtitle}</p>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 mb-4">
            <button
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-red-600 text-white shadow-sm shadow-red-600/25"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.loginButton}
            </button>
            <button
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-red-600 text-white shadow-sm shadow-red-600/25"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={mode === "login" ? handleLogin : handleRegister}
            className="bg-white rounded-2xl border border-slate-200 shadow-card-hover p-6 space-y-4"
          >
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            {mode === "register" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your name"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company name</label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Your company"
                    required
                    className={inputCls}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t.emailLabel}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={mode === "login" ? "admin@tac.com" : "you@company.com"}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t.passwordLabel}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min. 8 characters" : "••••••••"}
                required
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-500 disabled:opacity-60 transition-all text-sm shadow-md shadow-red-600/25 active:scale-[0.99]"
            >
              {loading
                ? (mode === "login" ? t.loggingIn : "Creating account…")
                : (mode === "login" ? t.loginButton : "Create Account")}
            </button>
          </form>

          {/* Demo mode */}
          <div className="mt-4 text-center">
            <button
              onClick={handleDemo}
              className="text-xs text-slate-400 hover:text-red-600 underline underline-offset-2 transition-colors"
            >
              {t.loginDemo}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
