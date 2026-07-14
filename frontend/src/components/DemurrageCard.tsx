import { useState } from "react";
import { useLanguage } from "../lib/LanguageContext";

interface Props {
  ata: string | null;
  freeDays?: number;
  containerCount?: number;
}

const DEFAULT_RATE = 150;

export function DemurrageCard({ ata, freeDays = 5, containerCount = 1 }: Props) {
  const { t } = useLanguage();
  const [rate, setRate] = useState(DEFAULT_RATE);

  if (!ata) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">{t.demurrageTitle}</h2>
        <p className="text-xs text-slate-400">{t.demurrageNoAta}</p>
      </div>
    );
  }

  const ataDate    = new Date(ata);
  const elapsed    = Math.floor((Date.now() - ataDate.getTime()) / 86400000);
  const daysOver   = Math.max(0, elapsed - freeDays);
  const daysLeft   = Math.max(0, freeDays - elapsed);
  const dailyTotal = rate * containerCount;           // total across all containers
  const accrued    = daysOver * dailyTotal;
  const isOverdue  = daysOver > 0;

  const fmtUsd = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const projected7  = Math.max(0, 7  - freeDays) * dailyTotal;
  const projected14 = Math.max(0, 14 - freeDays) * dailyTotal;
  const projected30 = Math.max(0, 30 - freeDays) * dailyTotal;

  return (
    <div className={`bg-white rounded-xl border p-5 ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-700">{t.demurrageTitle}</h2>
        {isOverdue && (
          <span className="shrink-0 inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {t.demurrageOverdue(daysOver)}
          </span>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={t.demurrageFreeTime(freeDays)} value={`${freeDays}d`} color="text-slate-700" />
        <Stat
          label={t.demurrageElapsed(elapsed)}
          value={`${elapsed}d`}
          color={isOverdue ? "text-red-600" : "text-slate-700"}
        />
        {isOverdue ? (
          <Stat label={t.demurrageAccrued(fmtUsd(accrued))} value={fmtUsd(accrued)} color="text-red-600" bold />
        ) : (
          <Stat label={t.demurrageRemaining(daysLeft)} value={`${daysLeft}d`} color="text-green-600" />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isOverdue ? "bg-red-500" : elapsed / freeDays > 0.7 ? "bg-amber-400" : "bg-green-500"
          }`}
          style={{ width: `${Math.min(100, (elapsed / freeDays) * 100)}%` }}
        />
      </div>

      {/* Daily burn rate */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-4">
          <p className="text-xs font-semibold text-red-700 mb-0.5">Daily burn rate</p>
          <p className="text-sm text-red-600">
            {fmtUsd(dailyTotal)}/day
            {containerCount > 1 && (
              <span className="text-red-400 font-normal text-xs ms-1">
                ({fmtUsd(rate)} × {containerCount} containers)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Projections — only shown while free time remaining, as a warning */}
      {!isOverdue && daysLeft <= freeDays && projected7 > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          {[
            { label: "if 7 days", val: projected7 },
            { label: "if 14 days", val: projected14 },
            { label: "if 30 days", val: projected30 },
          ].map(({ label, val }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-2">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-slate-600">{fmtUsd(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Accrual projections when already overdue */}
      {isOverdue && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          {[7, 14, 30].map(d => {
            const fut = d > elapsed ? (d - elapsed) * dailyTotal : 0;
            return (
              <div key={d} className={`rounded-lg p-2 ${d <= elapsed ? "bg-red-50" : "bg-slate-50"}`}>
                <p className="text-xs text-slate-400">Day {d}</p>
                <p className={`text-sm font-semibold ${d <= elapsed ? "text-red-600" : "text-slate-600"}`}>
                  {d <= elapsed ? fmtUsd(accrued) : fmtUsd(accrued + fut)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Rate editor */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">{t.demurrageRate}:</span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">$</span>
          <input
            type="number"
            value={rate}
            onChange={e => setRate(Math.max(0, Number(e.target.value)))}
            className="w-20 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:border-red-400"
          />
          <span className="text-xs text-slate-400">
            /day/container{containerCount > 1 && ` · ${fmtUsd(dailyTotal)}/day total`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div>
      <p className={`font-bold ${color} ${bold ? "text-2xl" : "text-xl"}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{label}</p>
    </div>
  );
}
