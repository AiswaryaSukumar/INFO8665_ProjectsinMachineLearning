import { useState } from "react";
import StatusLookupPage from "./StatusLookupPage";

import PublicHeader from "../components/PublicHeader";
import PublicFooter from "../components/PublicFooter";
import Floating311Button from "../components/Floating311Button";

export default function CitizenStatusPage() {
  const [lang, setLang] = useState(() => localStorage.getItem("insight311_lang") || "EN");

  return (
    <>
      <PublicHeader
        title={lang === "FR" ? "Statut citoyen" : "Citizen status"}
        showBack
        lang={lang}
        onLangChange={setLang}
      />

      <main className="lpShell">
        <div className="lpMain">
          <div className="lpContainer">
            <div className="card" style={{ marginBottom: 12 }}>
              <h2 style={{ marginTop: 0 }}>
                {lang === "FR" ? "Suivre ma demande 311" : "Track My 311 Request"}
              </h2>
              <div style={{ color: "#64748b" }}>
                {lang === "FR"
                  ? "Recherchez par numéro de ticket ou numéro de téléphone pour voir les mises à jour."
                  : "Search by ticket number or phone number to view updates."}
              </div>
              <div style={{ color: "#64748b", marginTop: 8, fontSize: 13 }}>
                {lang === "FR"
                  ? "Accès public : statut uniquement. Les détails personnels sont masqués dans ce prototype."
                  : "Public access: status only. Personal details are hidden in this prototype."}
              </div>
            </div>

            <StatusLookupPage mode="citizen" lang={lang} />
          </div>
        </div>
      </main>

      <Floating311Button label={lang === "FR" ? "Parler au 311" : "Talk to 311"} />
      <PublicFooter lang={lang} />
    </>
  );
}
