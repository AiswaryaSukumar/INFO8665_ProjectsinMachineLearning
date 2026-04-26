import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/insight311-logo.png";

// Images
import heroCity from "../assets/toronto-panorama.png";
import voiceBot from "../assets/voicebot.png";
import Floating311Button from "../components/Floating311Button";
import imgPothole from "../assets/service-pothole.png";
import imgGraffiti from "../assets/service-graffiti.png";
import imgParking from "../assets/service-parking.png";
import imgSnow from "../assets/service-snow.png";

import { inferDepartmentFromCategory } from "../utils/categoryRouting";

function buildCaptcha() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  return { a, b, answer: String(a + b) };
}

export default function LandingPage() {
  const nav = useNavigate();

  const [activeNav, setActiveNav] = useState("home");

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const [a11yOpen, setA11yOpen] = useState(false);
  const [a11yLargeText, setA11yLargeText] = useState(false);
  const [a11yHighContrast, setA11yHighContrast] = useState(false);

  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState(
    () => localStorage.getItem("insight311_lang") || "EN"
  );

  useEffect(() => {
    localStorage.setItem("insight311_lang", lang);
  }, [lang]);

  const copy = useMemo(
    () =>
      ({
        EN: {
          noticeLabel: "Notice",
          noticeText:
            "This is a prototype 311 portal. For non-emergency city services, call 311. For emergencies, call 911.",
          kicker: "Municipal 311 • Public Services",
          heroTitle: "Report City Issues Fast and Easy",
          heroSub:
            "Search a service and submit a request online, or call 311 anytime (24/7). INSIGHT-311 helps route requests to the right department and keeps service delivery transparent.",
          searchPlaceholder: "Search services (e.g., pothole, graffiti, snow)",
          search: "Search Services",
          searchAria: "Search municipal services",
          popularTitle: "Popular Services",
          popularSub: "Quick entry points for common 311 requests.",
          howTitle: "How INSIGHT-311 Works",
          how1Title: "Submit a Request",
          how1Body:
            "Citizen submits issue details and location through the portal or 311 call intake.",
          how2Title: "AI Categorization",
          how2Body:
            "AI extracts category, urgency signals, and suggested department routing.",
          how3Title: "Supervisor Review",
          how3Body:
            "Low-confidence items are reviewed before dispatch to reduce misroutes.",
          how4Title: "Dispatch & Updates",
          how4Body:
            "Operators dispatch work orders and citizens track status with their ticket number.",
          trackTitle: "Track a Request",
          trackSub:
            "For a realistic experience, complete the security check before continuing.",
          securityTitle: "Security Check",
          securityQuestion: "What is",
          answerPlaceholder: "Answer",
          refresh: "Refresh",
          continue: "Continue to Tracking",
          footerTag:
            "AI-assisted municipal operations dashboard prototype (INFO8665).",
          helpTitle: "Help",
          help1: "Call 311 for non-emergency support.",
          help2: "For emergencies, call 911.",
          legalTitle: "Legal",
          privacy: "Privacy",
          terms: "Terms",
          accessibility: "Accessibility",
          navHome: "Home",
          navServices: "Services",
          navOperator: "Operator Portal",
          status: "System Status",
          operational: "Operational",
          hours: "Hours",
          support: "Support",
          call311: "Talk to ISA",
          voiceTooltip: "ISA – AI Voice Intake",
          voiceAria: "Call ISA voice assistant",
          startRequest: "Start request →",
        },
        FR: {
          noticeLabel: "Avis",
          noticeText:
            "Ceci est un prototype du portail 311. Pour les services municipaux non urgents, composez le 311. En cas d’urgence, composez le 911.",
          kicker: "Municipal 311 • Services publics",
          heroTitle: "Signalez un problème municipal en quelques minutes",
          heroSub:
            "Recherchez un service et soumettez une demande en ligne, ou appelez le 311 en tout temps (24/7). INSIGHT-311 aide à acheminer les demandes au bon service et rend la prestation plus transparente.",
          searchPlaceholder:
            "Rechercher un service (ex. nid-de-poule, graffiti, neige)",
          search: "Rechercher un service",
          searchAria: "Rechercher des services municipaux",
          popularTitle: "Services populaires",
          popularSub: "Accès rapide aux demandes 311 courantes.",
          howTitle: "Comment INSIGHT-311 fonctionne",
          how1Title: "Soumettre une demande",
          how1Body:
            "Le citoyen fournit les détails et l’emplacement via le portail ou l’appel 311.",
          how2Title: "Catégorisation IA",
          how2Body:
            "L’IA extrait la catégorie, l’urgence et propose le service destinataire.",
          how3Title: "Révision superviseur",
          how3Body:
            "Les cas à faible confiance sont vérifiés avant l’assignation.",
          how4Title: "Dispatch et mises à jour",
          how4Body:
            "Les opérateurs traitent les demandes et le citoyen suit le statut avec son numéro.",
          trackTitle: "Suivre une demande",
          trackSub:
            "Pour une expérience réaliste, complétez la vérification de sécurité avant de continuer.",
          securityTitle: "Vérification de sécurité",
          securityQuestion: "Combien font",
          answerPlaceholder: "Réponse",
          refresh: "Rafraîchir",
          continue: "Continuer vers le suivi",
          footerTag:
            "Prototype de tableau de bord municipal assisté par IA (INFO8665).",
          helpTitle: "Aide",
          help1: "Composez le 311 pour une aide non urgente.",
          help2: "En cas d’urgence, composez le 911.",
          legalTitle: "Mentions légales",
          privacy: "Confidentialité",
          terms: "Conditions",
          accessibility: "Accessibilité",
          navHome: "Accueil",
          navServices: "Services",
          navOperator: "Portail opérateur",
          status: "État du système",
          operational: "Opérationnel",
          hours: "Heures",
          support: "Assistance",
          call311: "Parler à ISA",
          voiceTooltip: "ISA – Assistant vocal IA",
          voiceAria: "Appeler l’assistant vocal ISA",
          startRequest: "Démarrer →",
        },
      })[lang],
    [lang]
  );

  const actionsRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) {
        setA11yOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("a11y-large-text", a11yLargeText);
  }, [a11yLargeText]);

  useEffect(() => {
    document.body.classList.toggle("a11y-high-contrast", a11yHighContrast);
  }, [a11yHighContrast]);

  const [captcha, setCaptcha] = useState(() => buildCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const captchaOk = captchaInput.trim() === captcha.answer;

  useEffect(() => {
    setCaptcha(buildCaptcha());
    setCaptchaInput("");
  }, []);

  const services = useMemo(() => {
    const openRequest = (category) =>
      nav("/request", {
        state: {
          prefillCategory: category,
          prefillDepartment: inferDepartmentFromCategory(category),
        },
      });

    return [
      {
        category: "Pothole",
        title: lang === "FR" ? "Nid-de-poule" : "Pothole",
        desc:
          lang === "FR"
            ? "Dommages à la chaussée, dangers et réparations urgentes."
            : "Road surface damage, hazards, and urgent repairs.",
        img: imgPothole,
        action: () => openRequest("Pothole"),
      },
      {
        category: "Graffiti",
        title: "Graffiti",
        desc:
          lang === "FR"
            ? "Graffiti sur propriété publique/privée (demande de nettoyage)."
            : "Graffiti on public/private property (cleanup request).",
        img: imgGraffiti,
        action: () => openRequest("Graffiti"),
      },
      {
        category: "Parking complaint",
        title:
          lang === "FR" ? "Plainte de stationnement" : "Parking Complaint",
        desc:
          lang === "FR"
            ? "Obstruction, infractions et demandes d’application."
            : "Parking obstruction, violations, and enforcement requests.",
        img: imgParking,
        action: () => openRequest("Parking complaint"),
      },
      {
        category: "Sidewalk snow clearing",
        title:
          lang === "FR"
            ? "Déneigement des trottoirs"
            : "Sidewalk Snow Clearing",
        desc:
          lang === "FR"
            ? "Neige/glace sur les trottoirs ou voies publiques."
            : "Snow/ice concerns on sidewalks or public walkways.",
        img: imgSnow,
        action: () => openRequest("Sidewalk snow clearing"),
      },
    ];
  }, [nav, lang]);

  useEffect(() => {
    function onScroll() {
      const servicesEl = document.getElementById("services");
      if (!servicesEl) return;
      const y = window.scrollY || window.pageYOffset || 0;
      const servicesTop = servicesEl.getBoundingClientRect().top + y;
      setActiveNav(y >= servicesTop - 120 ? "services" : "home");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="lpPage">
      <header className="lpTopbar">
        <div className="lpTopbarInner">
          <div
            className="lpBrand"
            onClick={() => nav("/")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && nav("/")}
            aria-label="Go to home"
          >
            <img className="lpLogo" src={logo} alt="INSIGHT-311 logo" />
            <div className="lpBrandText">
              <div className="lpBrandTitle">INSIGHT-311</div>
              <div className="lpBrandTag">
                AI-assisted municipal service portal
              </div>
            </div>
          </div>

          <nav className="lpNav" aria-label="Primary">
            <button
              className={`lpNavLink ${activeNav === "home" ? "active" : ""}`}
              onClick={() => {
                setActiveNav("home");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {copy.navHome}
            </button>
            <button
              className={`lpNavLink ${
                activeNav === "services" ? "active" : ""
              }`}
              onClick={() => {
                setActiveNav("services");
                scrollTo("services");
              }}
            >
              {copy.navServices}
            </button>
            <button
              className="lpNavLink"
              onClick={() => nav("/login")}
              aria-label="Open operator portal"
            >
              {copy.navOperator}
            </button>
          </nav>

          <div className="lpTopActions lpTopActionsRight" ref={actionsRef}>
            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Accessibility options"
                onClick={() => {
                  setA11yOpen((v) => !v);
                  setLangOpen(false);
                }}
              >
                Accessibility
              </button>

              {a11yOpen && (
                <div
                  className="lpPopover"
                  role="dialog"
                  aria-label="Accessibility settings"
                >
                  <div className="lpPopoverTitle">Accessibility</div>
                  <div className="lpMuted">
                    Demo controls for a municipal portal.
                  </div>

                  <div className="lpPopoverBody">
                    <label className="lpSwitchRow">
                      <span>Large text</span>
                      <input
                        type="checkbox"
                        checked={a11yLargeText}
                        onChange={(e) => setA11yLargeText(e.target.checked)}
                      />
                    </label>

                    <label className="lpSwitchRow">
                      <span>High contrast</span>
                      <input
                        type="checkbox"
                        checked={a11yHighContrast}
                        onChange={(e) => setA11yHighContrast(e.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="lpPopoverFooter">
                    <button
                      className="btn"
                      onClick={() => {
                        setA11yLargeText(false);
                        setA11yHighContrast(false);
                      }}
                    >
                      Reset
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => setA11yOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lpPopoverWrap">
              <button
                className="lpPill"
                type="button"
                aria-label="Language options"
                onClick={() => {
                  setLangOpen((v) => !v);
                  setA11yOpen(false);
                }}
              >
                {lang}
              </button>

              {langOpen && (
                <div
                  className="lpPopover"
                  role="dialog"
                  aria-label="Language selector"
                >
                  <div className="lpPopoverTitle">Language</div>
                  <div className="lpMuted">
                    Demo dropdown (translation not fully implemented).
                  </div>
                  <div className="lpLangList">
                    <button
                      className={`lpLangItem ${
                        lang === "EN" ? "active" : ""
                      }`}
                      onClick={() => {
                        setLang("EN");
                        setLangOpen(false);
                      }}
                    >
                      English (EN)
                    </button>
                    <button
                      className={`lpLangItem ${
                        lang === "FR" ? "active" : ""
                      }`}
                      onClick={() => {
                        setLang("FR");
                        setLangOpen(false);
                      }}
                    >
                      Français (FR)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="lpAnnouncement" role="status">
        <div className="lpAnnouncementInner">
          <span className="lpBadge">{copy.noticeLabel}</span>
          <span>{copy.noticeText}</span>
        </div>
      </div>

      <section
        className="lpHero lpHeroImageOnly"
        style={{ backgroundImage: `url(${heroCity})` }}
      >
        <div className="lpHeroFade" aria-hidden="true" />

        <div className="lpHeroStatusFloat" aria-label="System status">
          <div className="lpHeroCard">
            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.status}</div>
              <div className="lpMiniStatValue">
                <span className="lpDot" /> {copy.operational}
              </div>
            </div>
            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.hours}</div>
              <div className="lpMiniStatValue">24/7</div>
            </div>
            <div className="lpMiniStat">
              <div className="lpMiniStatLabel">{copy.support}</div>
              <div className="lpMiniStatValue">{copy.call311}</div>
            </div>
          </div>
        </div>
      </section>

      <main className="lpMain">
        <div className="container">
          <section className="lpHeroBelow" aria-label="Hero headline">
            <div className="lpHeroBelowInner oneCol">
              <div className="lpHeroBelowCopy">
                <div className="lpKickerDark">{copy.kicker}</div>
                <h1 className="lpLeadTitle">{copy.heroTitle}</h1>
                <p className="lpLeadSub">{copy.heroSub}</p>

                <div
                  className="lpQuickSearch lpQuickSearchLight"
                  aria-label="Quick search"
                >
                  <input
                    placeholder={copy.searchPlaceholder}
                    aria-label={copy.searchAria}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") nav("/request");
                    }}
                  />
                  <button
                    className="btn primary"
                    onClick={() => nav("/request")}
                    aria-label="Start request"
                  >
                    {copy.search}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="lpSection" id="services">
            <div className="lpSectionHead">
              <h2 className="lpH2">{copy.popularTitle}</h2>
              <div className="lpMuted">{copy.popularSub}</div>
            </div>

            <div className="lpServiceGrid">
              {services.map((s) => (
                <button key={s.title} className="lpServiceCard" onClick={s.action}>
                  <div className="lpServiceImgWrap" aria-hidden="true">
                    <img
                      className="lpServiceImg"
                      src={s.img}
                      alt={`${s.title} service`}
                    />
                  </div>
                  <div className="lpServiceBody">
                    <div className="lpServiceTitle">{s.title}</div>
                    <div className="lpServiceDesc">{s.desc}</div>
                    <div className="lpServiceCta">{copy.startRequest}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="lpSection">
            <div className="lpSectionHead">
              <h2 className="lpH2">{copy.howTitle}</h2>
            </div>

            <div className="lpHowGrid">
              <div className="card lpHowCard">
                <div className="lpHowNum">1</div>
                <div className="lpHowTitle">{copy.how1Title}</div>
                <div className="lpMuted">{copy.how1Body}</div>
              </div>

              <div className="card lpHowCard">
                <div className="lpHowNum">2</div>
                <div className="lpHowTitle">{copy.how2Title}</div>
                <div className="lpMuted">{copy.how2Body}</div>
              </div>

              <div className="card lpHowCard">
                <div className="lpHowNum">3</div>
                <div className="lpHowTitle">{copy.how3Title}</div>
                <div className="lpMuted">{copy.how3Body}</div>
              </div>

              <div className="card lpHowCard">
                <div className="lpHowNum">4</div>
                <div className="lpHowTitle">{copy.how4Title}</div>
                <div className="lpMuted">{copy.how4Body}</div>
              </div>
            </div>
          </section>

          <section className="lpSection" id="track">
            <div className="lpTrack">
              <div className="lpTrackLeft">
                <h2 className="lpH2" style={{ margin: 0 }}>
                  {copy.trackTitle}
                </h2>
                <div className="lpMuted">{copy.trackSub}</div>
              </div>

              <div className="lpTrackRight">
                <div className="lpCaptcha">
                  <div className="lpCaptchaLeft">
                    <div className="lpCaptchaTitle">{copy.securityTitle}</div>
                    <div className="lpMuted">
                      {copy.securityQuestion} {captcha.a} + {captcha.b}?
                    </div>
                  </div>
                  <div className="lpCaptchaRight">
                    <input
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      placeholder={copy.answerPlaceholder}
                      aria-label="Captcha answer"
                    />
                    <button
                      className="btn refreshBtn"
                      type="button"
                      onClick={() => {
                        setCaptcha(buildCaptcha());
                        setCaptchaInput("");
                      }}
                    >
                      {copy.refresh}
                    </button>
                  </div>
                </div>

                <div className="lpTrackButtons">
                  <button
                    className={`btn primary ${captchaOk ? "" : "lpDisabled"}`}
                    onClick={() => captchaOk && nav("/lookup")}
                    disabled={!captchaOk}
                  >
                    {copy.continue}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Floating311Button label={copy.call311} tooltip={copy.voiceTooltip} />

      <footer className="lpFooter">
        <div className="lpFooterInner">
          <div className="lpFooterCols">
            <div>
              <div className="lpFooterTitle">INSIGHT-311</div>
              <div className="lpMuted">{copy.footerTag}</div>
            </div>
            <div>
              <div className="lpFooterTitle">{copy.helpTitle}</div>
              <div className="lpMuted">{copy.help1}</div>
              <div className="lpMuted">{copy.help2}</div>
            </div>
            <div>
              <div className="lpFooterTitle">{copy.legalTitle}</div>
              <div className="lpFooterBottomLinks">
                <span>{copy.privacy}</span>
                <span>{copy.terms}</span>
                <span>{copy.accessibility}</span>
              </div>
            </div>
          </div>

          <div className="lpFooterBottom">
            <div>© {new Date().getFullYear()} INSIGHT-311</div>
          </div>
        </div>
      </footer>
    </div>
  );
}