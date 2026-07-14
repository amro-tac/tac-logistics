import { useEffect, useState } from "react";
import { api } from "../api/shipments";
import { AppHeader } from "../components/AppHeader";
import { isDemoMode } from "../lib/auth";

type ScanLog = { scanned_at: string; emails_checked: number; updates_made: number; error: string | null };

type ScannerStatus = {
  configured: boolean;
  email_address: string | null;
  imap_server: string | null;
  interval_minutes: number;
  last_scan: string | null;
  last_emails_checked: number;
  last_updates_made: number;
  last_error: string | null;
  recent_logs: ScanLog[];
};

const DEMO_STATUS: ScannerStatus = {
  configured: false,
  email_address: null,
  imap_server: null,
  interval_minutes: 30,
  last_scan: null,
  last_emails_checked: 0,
  last_updates_made: 0,
  last_error: null,
  recent_logs: [],
};

export function SettingsPage() {
  const demo = isDemoMode();
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  useEffect(() => {
    if (demo) { setStatus(DEMO_STATUS); return; }
    api.getEmailScannerStatus().then(setStatus).catch(() => setStatus(DEMO_STATUS));
  }, [demo]);

  async function handleScanNow() {
    setScanning(true);
    setScanMsg("");
    try {
      const res = await api.triggerEmailScan();
      if (res.queued) {
        setScanMsg("Scan started — check recent logs in a few seconds.");
        // Refresh status after a short delay
        setTimeout(() => {
          api.getEmailScannerStatus().then(setStatus).catch(() => {});
        }, 4000);
      } else {
        setScanMsg(res.reason ?? "Scan not started");
      }
    } catch {
      setScanMsg("Failed to trigger scan");
    } finally {
      setScanning(false);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Settings</h1>
          <p className="text-xs text-slate-500">Email scanner & system configuration</p>
        </div>

        {/* Email Scanner card */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Email Scanner</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically updates ETAs when carrier emails arrive in your inbox
              </p>
            </div>
            <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              status?.configured
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status?.configured ? "bg-green-500" : "bg-amber-400"}`} />
              {status?.configured ? "Active" : "Not configured"}
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {status?.configured ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Inbox" value={status.email_address ?? "—"} />
                  <Stat label="IMAP server" value={status.imap_server ?? "—"} />
                  <Stat label="Last scan" value={formatDate(status.last_scan)} />
                  <Stat label="Scan interval" value={`Every ${status.interval_minutes} min`} />
                  <Stat label="Emails checked (last)" value={String(status.last_emails_checked)} />
                  <Stat label="ETA updates (last)" value={String(status.last_updates_made)} accent={status.last_updates_made > 0} />
                </div>

                {status.last_error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                    Last error: {status.last_error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleScanNow}
                    disabled={scanning}
                    className="btn-primary text-xs"
                  >
                    {scanning ? "Starting…" : "Scan Now"}
                  </button>
                  {scanMsg && <span className="text-xs text-slate-500">{scanMsg}</span>}
                </div>

                {/* Recent logs */}
                {status.recent_logs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Scans</p>
                    <div className="space-y-1">
                      {status.recent_logs.map((log, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                          <span className="text-slate-500">{formatDate(log.scanned_at)}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">{log.emails_checked} checked</span>
                            {log.updates_made > 0
                              ? <span className="text-green-600 font-medium">{log.updates_made} updated</span>
                              : <span className="text-slate-400">0 updates</span>
                            }
                            {log.error && <span className="text-red-500" title={log.error}>error</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  To enable automatic ETA updates from carrier emails, add these three lines to your
                  <code className="bg-slate-100 text-slate-700 rounded px-1 py-0.5 mx-1 text-xs">.env</code>
                  file in the backend directory and restart the server:
                </p>

                <div className="bg-slate-900 rounded-xl px-4 py-4 font-mono text-xs leading-6 overflow-x-auto">
                  <div className="text-slate-500"># Email Scanner — add to backend/.env</div>
                  <div>
                    <span className="text-blue-400">EMAIL_IMAP_SERVER</span>
                    <span className="text-slate-400">=</span>
                    <span className="text-green-400">imap.gmail.com</span>
                    <span className="text-slate-600 ml-4"># or imap-mail.outlook.com</span>
                  </div>
                  <div>
                    <span className="text-blue-400">EMAIL_ADDRESS</span>
                    <span className="text-slate-400">=</span>
                    <span className="text-green-400">your@email.com</span>
                  </div>
                  <div>
                    <span className="text-blue-400">EMAIL_PASSWORD</span>
                    <span className="text-slate-400">=</span>
                    <span className="text-green-400">your-app-password</span>
                    <span className="text-slate-600 ml-4"># 16-char Gmail app password</span>
                  </div>
                  <div className="text-slate-600 mt-1"># optional — default is 30</div>
                  <div>
                    <span className="text-blue-400">EMAIL_SCAN_INTERVAL_MINUTES</span>
                    <span className="text-slate-400">=</span>
                    <span className="text-green-400">30</span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1.5">
                  <p className="font-semibold">Gmail setup (2 minutes)</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li>Go to your Google Account → Security → 2-Step Verification (enable it)</li>
                    <li>Search for "App passwords" in Google Account</li>
                    <li>Create an app password for "Mail" → copy the 16-character code</li>
                    <li>Use that 16-char code as <code className="bg-blue-100 rounded px-1">EMAIL_PASSWORD</code></li>
                  </ol>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-700">What it does</p>
                  <p>Every 30 minutes it scans your inbox for emails from Maersk, ZIM, MSC, Hapag-Lloyd, CMA-CGM, and other major carriers. When it finds a container number and a new arrival date in an email, it updates that shipment's ETA and adds a note so you can see what changed.</p>
                  <p className="text-slate-500">It only reads emails — never sends anything. No API keys required.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Supported carriers */}
        <div className="card px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Supported Carriers</h2>
          <div className="flex flex-wrap gap-2">
            {[
              "Maersk", "ZIM", "MSC", "Hapag-Lloyd", "ONE", "CMA-CGM",
              "OOCL", "Evergreen", "COSCO", "Yang Ming", "HMM", "PIL", "Arkas",
            ].map(c => (
              <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {c}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Detection is by email domain. If a carrier is missing, open a request and their domain can be added.
          </p>
        </div>

      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${accent ? "text-green-600" : "text-slate-700"}`}>{value}</div>
    </div>
  );
}
