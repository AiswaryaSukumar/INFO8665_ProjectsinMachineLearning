import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTickets } from "../api/tickets";
import TicketTable from "../components/TicketTable";
import { useToast } from "../components/Toast";

function normalizePhone(input = "") {
  return String(input).replace(/\D/g, "");
}

function isValidTicketNumber(input = "") {
  // Format: 311-2026-001234 (year 4 digits, last segment 4–8 digits)
  return /^311-\d{4}-\d{4,8}$/i.test(String(input).trim());
}

function formatCooldown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function StatusLookupPage({ mode = "operator" }) {
  const isCitizen = mode === "citizen";
  const { toast } = useToast();
  const nav = useNavigate();

  const allowedTypes = isCitizen
    ? ["ticketNumber", "phone"]
    : ["ticketNumber", "phone", "name"];

  const [filterType, setFilterType] = useState(allowedTypes[0]);
  const [keyword, setKeyword] = useState("");

  const [results, setResults]     = useState([]);
  const [searched, setSearched]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState("");

  // Rate limit: 5 submits / 60 sec, then 30 sec cooldown
  const attemptsRef = useRef([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const isCoolingDown = now < cooldownUntil;
  const cooldownLeft  = cooldownUntil - now;

  // If mode changes, ensure filterType is still allowed
  useEffect(() => {
    if (!allowedTypes.includes(filterType)) setFilterType(allowedTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTypes.join("|")]);

  function validate() {
    const raw = keyword.trim();
    if (!raw) return "Please enter a value to search.";

    if (filterType === "ticketNumber") {
      if (!isValidTicketNumber(raw)) {
        return "Ticket number format should look like 311-2026-001234.";
      }
    }

    if (filterType === "phone") {
      const digits = normalizePhone(raw);
      if (digits.length < 10) return "Phone number must include at least 10 digits.";
      if (digits.length > 15) return "Phone number looks too long. Please re-check.";
    }

    if (filterType === "name" && isCitizen) {
      return "For public lookup, search by ticket number or phone number.";
    }

    return "";
  }

  function applyRateLimit() {
    const WINDOW_MS    = 60_000;
    const MAX_ATTEMPTS = 5;
    const COOLDOWN_MS  = 30_000;

    const t = Date.now();
    attemptsRef.current = attemptsRef.current.filter((x) => t - x <= WINDOW_MS);

    if (attemptsRef.current.length >= MAX_ATTEMPTS) {
      setCooldownUntil(t + COOLDOWN_MS);
      return false;
    }

    attemptsRef.current.push(t);
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSearched(false);
    setErrorMsg("");
    setResults([]);

    if (isCoolingDown) {
      toast.warning(`Too many attempts. Try again in ${formatCooldown(cooldownLeft)}.`);
      return;
    }

    const v = validate();
    if (v) {
      setErrorMsg(v);
      toast.error(v);
      return;
    }

    if (!applyRateLimit()) {
      toast.warning("Too many attempts. Please wait a moment and try again.");
      return;
    }

    setLoading(true);
    try {
      // Fetch all tickets from DB
      const all = await fetchTickets();

      const raw = keyword.trim();

      let filtered = [];
      if (filterType === "ticketNumber") {
        const k = raw.toLowerCase();
        filtered = all.filter((t) =>
          String(t.ticketNumber || "").toLowerCase().includes(k)
        );
      } else if (filterType === "phone") {
        const k = normalizePhone(raw);
        filtered = all.filter((t) => normalizePhone(t.phone || "").includes(k));
      } else if (filterType === "name") {
        const k = raw.toLowerCase();
        filtered = all.filter((t) =>
          String(t.name || "").toLowerCase().includes(k)
        );
      }

      setResults(filtered);
      setSearched(true);

      if (filtered.length > 0) {
        toast.success(`Found ${filtered.length} matching ticket${filtered.length > 1 ? "s" : ""}.`);
      } else {
        toast.info("No matching tickets found.");
      }
    } catch (err) {
      toast.error(`Search failed: ${err.message}`);
      setErrorMsg("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          {isCitizen ? "Track a Request" : "Use Case 3 — Status Lookup"}
        </h2>

        <div style={{ color: "#64748b", marginTop: 6 }}>
          Search by {isCitizen ? "ticket number or phone number" : "ticket number, phone number, or name"}.
        </div>

        {/* Cooldown banner */}
        {isCoolingDown && (
          <div className="banner warning" style={{ marginTop: 12 }}>
            Too many attempts. Please wait <b>{formatCooldown(cooldownLeft)}</b> before trying again.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div className="row grid2">
            <div>
              <label>Search by</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="ticketNumber">Ticket Number</option>
                <option value="phone">Phone Number</option>
                {!isCitizen && <option value="name">Name</option>}
              </select>
            </div>

            <div>
              <label>
                {filterType === "ticketNumber"
                  ? "Ticket Number"
                  : filterType === "phone"
                  ? "Phone Number"
                  : "Name"}
              </label>

              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={
                  filterType === "ticketNumber"
                    ? "e.g., 311-2026-001234"
                    : filterType === "phone"
                    ? "e.g., (647) 555-0111"
                    : "e.g., Nora"
                }
                disabled={isCoolingDown || loading}
                aria-invalid={!!errorMsg}
              />

              {errorMsg && (
                <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 13 }} role="alert">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn primary" type="submit" disabled={isCoolingDown || loading}>
              {loading ? "Searching…" : "Search"}
            </button>

            <button
              className="btn"
              type="button"
              onClick={() => {
                setKeyword("");
                setSearched(false);
                setErrorMsg("");
                setResults([]);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div style={{ marginTop: 14 }}>
          {!searched ? (
            <div style={{ color: "#6b7280" }}>
              Enter details and click Search to retrieve ticket status.
            </div>
          ) : results.length ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Results ({results.length})</div>
              <TicketTable
                tickets={results}
                mode={mode}
                onRowClick={(t) => nav(`/ticket/${t.ticketNumber}`, { state: { ticket: t, from: "/lookup" } })}
              />
            </>
          ) : (
            <div style={{ marginTop: 10 }}>No tickets found for this search.</div>
          )}
        </div>
      </div>
    </>
  );
}
