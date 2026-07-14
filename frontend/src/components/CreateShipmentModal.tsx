import { useState } from "react";
import { useLanguage } from "../lib/LanguageContext";

interface Props {
  onClose: () => void;
  onCreate: (clearancePath: "direct_pa" | "israeli_only") => void;
  creating: boolean;
}

export function CreateShipmentModal({ onClose, onCreate, creating }: Props) {
  const { t } = useLanguage();
  const [path, setPath] = useState<"direct_pa" | "israeli_only">("direct_pa");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{t.createShipment}</h2>
          <p className="text-xs text-slate-500 mt-1">{t.createShipmentSub}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">{t.clearancePath}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["direct_pa", "israeli_only"] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setPath(option)}
                  className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-start ${
                    path === option
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {option === "direct_pa" ? t.directPA : t.israeliOnly}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">{t.clearancePathHint}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onCreate(path)}
            disabled={creating}
            className="btn-primary px-5"
          >
            {creating ? t.creating : t.createDraft}
          </button>
        </div>
      </div>
    </div>
  );
}
