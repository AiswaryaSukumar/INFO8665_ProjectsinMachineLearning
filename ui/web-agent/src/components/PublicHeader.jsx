// src/components/PublicHeader.jsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/insight311-logo.png";

export default function PublicHeader({
  title = "",
  showBack = false,
  backFallback = "/",
  showHome = true,
  showTrack = true,
  showSubmit = true,
  lang: langProp,
  onLangChange,
}) {
  const nav = useNavigate();
  const actionsRef = useRef(null);

  const [a11yOpen, setA11yOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState(() => {
    return langProp || localStorage.getItem("insight311_lang") || "EN";
  });

  // Keep internal lang synced if parent controls it
  useEffect(() => {
    if (langProp && langProp !== lang) setLang(langProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langProp]);

  // Persist language across public pages
  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
    onLangChange?.(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Accessibility toggles (CSS-driven)
  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", a11yHighContrast);
  }, [a11yHighContrast]);

  // Close popovers on outside click
  useEffect(() => {
    function onDown(e) {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) {
        setA11yOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const onBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav(backFallback);
  };

  // Simple EN/FR helper for public pages
  const t = (en, fr) => (lang === "FR" ? fr : en);

  return (
    <div className="lpHeader">
      <div className="lpHeaderLeft">
        <img className="lpLogo" src={logo} alt="INSIGHT-311 logo" />
        <span>INSIGHT-311</span>
      </div>

      <div className="lpHeaderCenter">{title}</div>

      <div className="lpHeaderRight" ref={actionsRef}>
        <div className="dashTopActions">
          {showBack && (
            <button className="lpActionBtn" type="button" onClick={onBack}>
              {t("Back", "Retour")}
            </button>
          )}

          {showHome && (
            <button
              className="lpActionBtn"
              type="button"
              onClick={() => nav("/")}
              aria-label="Home"
            >
              {t("Home", "Accueil")}
            </button>
          )}

          {showSubmit && (
            <button
              className="lpActionBtn"
              type="button"
              onClick={() => nav("/request")}
              aria-label="Submit request"
            >
              {t("Submit request", "Soumettre une demande")}
            </button>
          )}

          {showTrack && (
            <button
              className="lpActionBtn"
              type="button"
              onClick={() => nav("/lookup")}
              aria-label="Track request"
            >
              {t("Track request", "Suivre une demande")}
            </button>
          )}

          {/* Accessibility */}
          <div className="lpPopoverWrap">
            <button
              className="lpActionBtn"
              type="button"
              onClick={() => {
                setA11yOpen((s) => !s);
                setLangOpen(false);
              }}
            >
              {t("Accessibility", "Accessibilité")}
            </button>

            {a11yOpen && (
              <div
                className="lpPopover"
                role="dialog"
                aria-label={t("Accessibility", "Accessibilité")}
              >
                <div className="lpPopoverTitle">
                  {t("Accessibility", "Accessibilité")}
                </div>
                <div className="lpMuted">
                  {t(
                    "Demo controls for a municipal portal.",
                    "Commandes de démonstration pour un portail municipal."
                  )}
                </div>

                <div className="lpPopoverBody">
                  <div className="lpPopRow">
                    <span>{t("Large text", "Texte agrandi")}</span>
                    <input
                      type="checkbox"
                      checked={a11yLargeText}
                      onChange={(e) => setA11yLargeText(e.target.checked)}
                    />
                  </div>

                  <div className="lpPopRow">
                    <span>{t("High contrast", "Contraste élevé")}</span>
                    <input
                      type="checkbox"
                      checked={a11yHighContrast}
                      onChange={(e) => setA11yHighContrast(e.target.checked)}
                    />
                  </div>

                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => setA11yOpen(false)}
                    style={{ marginTop: 10, width: "100%" }}
                  >
                    {t("Done", "OK")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Language */}
          <div className="lpPopoverWrap">
            <button
              className="lpActionBtn"
              type="button"
              onClick={() => {
                setLangOpen((s) => !s);
                setA11yOpen(false);
              }}
            >
              {lang}
            </button>

            {langOpen && (
              <div
                className="lpPopover"
                role="dialog"
                aria-label={t("Language", "Langue")}
              >
                <div className="lpPopoverTitle">{t("Language", "Langue")}</div>
                <div className="lpPopoverBody">
                  <button
                    className="lpLangBtn"
                    type="button"
                    onClick={() => setLang("EN")}
                  >
                    EN
                  </button>
                  <button
                    className="lpLangBtn"
                    type="button"
                    onClick={() => setLang("FR")}
                  >
                    FR
                  </button>

                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => setLangOpen(false)}
                    style={{ marginTop: 10, width: "100%" }}
                  >
                    {t("Done", "OK")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}