import type { ShipmentStatus } from "../types/shipment";
import { STATUS_COLOR } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[status]}`}>
      {t.statusLabel[status]}
    </span>
  );
}
