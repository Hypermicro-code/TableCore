import i18n from "i18next"
import { initReactI18next } from "react-i18next"

await i18n
  .use(initReactI18next)
  .init({
    lng: "no",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {} // lastes fra public/locales via fetch (enkel demo bruker statiske nøkler i koden)
  })

export default i18n
