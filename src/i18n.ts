import i18n from "i18next"
import { initReactI18next } from "react-i18next"

// Ikke bruk top-level await her – init returnerer en Promise, men vi kan starte den "fire-and-forget".
i18n
  .use(initReactI18next)
  .init({
    lng: "no",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {} // vi kan senere fylle fra /public/locales via egen loader om ønskelig
  })
  .catch((err) => {
    // Logg i konsollen ved utvikling – påvirker ikke prod-flyt
    console.error("i18n init failed", err)
  })

export default i18n
