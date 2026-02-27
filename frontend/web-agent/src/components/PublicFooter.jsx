// src/components/PublicFooter.jsx
import { useNavigate } from "react-router-dom";

// active: "" | "lookup" | "request" | "home"
export default function PublicFooter({ showNav = true, active = "" }) {
  const nav = useNavigate();

  return (
    <footer className="lpFooter">
      <div className="lpFooterInner">
        <div className="lpFooterCols">
          <div>
            <div className="lpFooterTitle">INSIGHT-311</div>
            <div className="lpFooterMuted">AI-assisted municipal service portal prototype.</div>
          </div>

          {showNav ? (
            <div>
              <div className="lpFooterTitle">Links</div>
              <div className="lpFooterLinks">
                <button className="lpFooterLink" onClick={() => nav("/")}>Home</button>
                <span className="lpFooterDot">•</span>
                <button className="lpFooterLink" onClick={() => nav("/request")}>Submit request</button>

                {/* Hide "Track request" link when user is already on Track page */}
                {active !== "lookup" && (
                  <>
                    <span className="lpFooterDot">•</span>
                    <button className="lpFooterLink" onClick={() => nav("/lookup")}>Track request</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div />
          )}

          <div>
            <div className="lpFooterTitle">Accessibility</div>
            <div className="lpFooterMuted">Keyboard friendly • High contrast focus states.</div>
          </div>
        </div>

        <div className="lpFooterBottom">
          <div className="lpFooterCopy">© 2026 INSIGHT-311</div>
          <div className="lpFooterLinks">
            <button className="lpFooterLink" type="button">Privacy</button>
            <span className="lpFooterDot">•</span>
            <button className="lpFooterLink" type="button">Terms</button>
            <span className="lpFooterDot">•</span>
            <button className="lpFooterLink" type="button">Accessibility</button>
          </div>
        </div>
      </div>
    </footer>
  );
}