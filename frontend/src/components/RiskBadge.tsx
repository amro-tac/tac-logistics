import type { RiskFlag } from "../types/shipment";
import { RISK_COLOR, RISK_DOT } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

export function RiskBadge({ flag }: { flag: RiskFlag }) {
  const { t } = useLanguage();
  if (flag === "ok") return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${RISK_COLOR[flag]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[flag]}`} />
      {t.riskLabel[flag]}
    </span>
  );
}
