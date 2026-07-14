import type { Shipment } from "../types/shipment";
import { formatDateTime } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

export function ShipmentTimeline({ shipment }: { shipment: Shipment }) {
  const { t } = useLanguage();
  const events = [...shipment.tracking_events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );

  if (events.length === 0) {
    return <p className="text-sm text-slate-400 py-4">{t.noEvents}</p>;
  }

  return (
    <ol className="relative border-s border-slate-200 ms-3">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={event.id} className="mb-6 ms-6">
            <span
              className={`absolute -start-1.5 flex items-center justify-center w-3 h-3 rounded-full ring-4 ring-white ${
                isLast ? "bg-red-600" : "bg-slate-400"
              }`}
            />
            <div className="flex flex-col gap-0.5">
              <p className={`text-sm font-medium ${isLast ? "text-red-700" : "text-slate-700"}`}>
                {t.eventLabel[event.event_type]}
              </p>
              {event.location && <p className="text-xs text-slate-500">{event.location}</p>}
              <p className="text-xs text-slate-400">{formatDateTime(event.event_time)}</p>
              {event.event_type === "eta_update" && event.eta_at_time && (
                <p className="text-xs text-amber-600 font-medium">
                  {t.etaRevisedTo(formatDateTime(event.eta_at_time))}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
