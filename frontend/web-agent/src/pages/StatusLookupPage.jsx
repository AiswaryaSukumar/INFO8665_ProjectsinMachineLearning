import { useMemo, useState } from "react";
import { mockTickets } from "../mock/mockTickets";
import TicketTable from "../components/TicketTable";
import TicketDetailsDrawer from "../components/TicketDetailsDrawer";

export default function StatusLookupPage({ mode = "operator" }) {
  const [filterType, setFilterType] = useState("ticketNumber");
  const [keyword, setKeyword] = useState("");

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const results = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return [];

    return mockTickets.filter((t) => {
      if (filterType === "ticketNumber")
        return t.ticketNumber.toLowerCase().includes(k);
      if (filterType === "phone") return (t.phone || "").toLowerCase().includes(k);
      if (filterType === "name") return (t.name || "").toLowerCase().includes(k);
      return false;
    });
  }, [filterType, keyword]);

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Use Case 3 — Status Lookup</h2>

        <div className="row grid2" style={{ marginTop: 10 }}>
          <div>
            <label>Search by</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="ticketNumber">Ticket Number</option>
              <option value="phone">Phone Number</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div>
            <label>Keyword</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Enter ticket #, phone, or name..."
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {keyword.trim() ? (
            results.length ? (
              <>
                <h3 style={{ marginTop: 0 }}>Results</h3>
                <TicketTable
                  tickets={results}
                  mode={mode}
                  onRowClick={(t) => {
                    setSelectedTicket(t);
                    setDrawerOpen(true);
                  }}
                />
              </>
            ) : (
              <div style={{ marginTop: 10 }}>No tickets found for this search.</div>
            )
          ) : (
            <div style={{ marginTop: 10, color: "#6b7280" }}>
              Enter a search keyword to retrieve ticket status.
            </div>
          )}
        </div>
      </div>

      <TicketDetailsDrawer
        open={drawerOpen}
        ticket={selectedTicket}
        mode={mode}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
