import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { translations } from "./i18n";
import type { Lang, Translations } from "./i18n";

interface LanguageCtx {
  lang: Lang;
  t: Translations;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageCtx>({
  lang: "en",
  t: translations["en"],
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  function toggle() {
    setLang(l => (l === "en" ? "ar" : "en"));
  }

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang] as Translations, toggle }}>
      <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
