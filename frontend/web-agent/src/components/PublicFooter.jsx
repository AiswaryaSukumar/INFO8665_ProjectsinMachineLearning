// src/components/PublicFooter.jsx
import { useNavigate } from "react-router-dom";

// active: "" | "lookup" | "request" | "home"
export default function PublicFooter({ showNav = true, active = "" }) {
  const nav = useNavigate();

  return (
    <footer className="lpFooter" role="contentinfo">
      <div className="lpFooterInner">
        <div className="lpFooterCols">

          {/* Brand */}
          <div>
            <div className="lpFooterTitle">INSIGHT-311</div>
            <div className="lpFooterMuted">
              Municipal service request portal prototype.
            </div>
          </div>

          {/* Navigation */}
          {showNav ? (
            <div>
              <div className="lpFooterTitle">Links</div>
              <div className="lpFooterLinks" role="navigation" aria-label="Footer navigation">

                <button
                  className="lpFooterLink"
                  onClick={() => nav("/")}
                  aria-label="Go to home page"
                >
                  Home
                </button>

                <span className="lpFooterDot">•</span>

                <button
                  className="lpFooterLink"
                  onClick={() => nav("/request")}
                  aria-label="Submit a service request"
                >
                  Submit request
                </button>

                {active !== "lookup" && (
                  <>
                    <span className="lpFooterDot">•</span>
                    <button
                      className="lpFooterLink"
                      onClick={() => nav("/lookup")}
                      aria-label="Track an existing request"
                    >
                      Track request
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Accessibility note */}
          <div>
            <div className="lpFooterTitle">Accessibility</div>
            <div className="lpFooterMuted">
              Keyboard navigation supported • High-contrast focus states.
            </div>
          </div>

        </div>

        {/* Bottom strip */}
        <div className="lpFooterBottom">
          <div className="lpFooterCopy">© 2026 INSIGHT-311</div>

          <div className="lpFooterLinks">
            <button className="lpFooterLink" type="button">
              Privacy
            </button>

            <span className="lpFooterDot">•</span>

            <button className="lpFooterLink" type="button">
              Terms
            </button>

            <span className="lpFooterDot">•</span>

            <button className="lpFooterLink" type="button">
              Accessibility statement
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}