import type { ShipmentStatus } from "../types/shipment";
import { STAGE_ORDER } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

export function StageProgress({ status }: { status: ShipmentStatus }) {
  const { t } = useLanguage();
  const current = STAGE_ORDER.indexOf(status);

  return (
    <div className="w-full">
      <div className="flex items-center">
        {STAGE_ORDER.map((stage, i) => {
          const done   = i < current;
          const active = i === current;
          const isLast = i === STAGE_ORDER.length - 1;

          return (
            <div key={stage} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    done
                      ? "bg-red-600 border-red-600"
                      : active
                      ? "bg-white border-red-600 ring-2 ring-red-200"
                      : "bg-white border-slate-300"
                  }`}
                />
                <span
                  className={`mt-1 text-[10px] whitespace-nowrap ${
                    active ? "text-red-700 font-semibold" : done ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {t.statusLabel[stage]}
                </span>
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 mx-1 ${i < current ? "bg-red-600" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
