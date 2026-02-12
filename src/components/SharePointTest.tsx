import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { SharePointService } from "../services/sharepointService";
import { getAccessToken } from "../services/tokenService";

function SharePointTest({ refreshKey = 0 }: { refreshKey?: number }) {
  const { instance, accounts } = useMsal();
  const [visitatori, setVisitatori] = useState<any[]>([]);
  const [filters, setFilters] = useState({ nome: "", email: "", azienda: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const getSharePointService = async () => {
    const account = accounts[0];
    const accessToken = await getAccessToken(instance, account);

    const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
    const listId = import.meta.env.VITE_SHAREPOINT_LIST_ID;

    return new SharePointService(accessToken, siteId, listId);
  };

  const handleGetVisitatori = async () => {
    setLoading(true);
    setError(null);

    try {
      const service = await getSharePointService();
      const items = await service.getVisitatori();
      setVisitatori(items);
    } catch (err: any) {
      console.error("❌ Error getting visitatori:", err);
      setError(err?.message || "Errore sconosciuto durante la lettura");
    } finally {
      setLoading(false);
    }
  };

  // auto-caricamento dati alla apertura
  useEffect(() => {
    handleGetVisitatori();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleGetVisitatori();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const nomeQ = filters.nome.toLowerCase().trim();
    const emailQ = filters.email.toLowerCase().trim();
    const aziendaQ = filters.azienda.toLowerCase().trim();

    return visitatori.filter((v) => {
      const nome = (v.fields.Nome || "").toLowerCase();
      const cognome = (v.fields.Cognome || "").toLowerCase();
      const email = (v.fields.Email || "").toLowerCase();
      const azienda = (v.fields.Azienda || "").toLowerCase();

      const matchNome = nomeQ
        ? nome.includes(nomeQ) || cognome.includes(nomeQ) || `${nome} ${cognome}`.includes(nomeQ)
        : true;
      const matchEmail = emailQ ? email.includes(emailQ) : true;
      const matchAzienda = aziendaQ ? azienda.includes(aziendaQ) : true;

      return matchNome && matchEmail && matchAzienda;
    });
  }, [filters, visitatori]);

  useEffect(() => {
    setPage(1);
  }, [filters, visitatori, pageSize]);

  const resetFiltri = () => setFilters({ nome: "", email: "", azienda: "" });

  const callPowerAutomate = useCallback(async (payload: Record<string, any>) => {
    const flowUrl = import.meta.env.VITE_PA_SEND_QR_URL;
    if (!flowUrl) {
      throw new Error("Configura VITE_PA_SEND_QR_URL per il reinvio del QR");
    }

    const response = await fetch(flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Errore dal flusso PowerAutomate (reinvio QR)");
    }
  }, []);

  const handleResendQr = useCallback(
    async (row: any) => {
      setActionMessage(null);
      setActionError(null);
      setSendingId(row.id);

      try {
        await callPowerAutomate({
          action: "resend",
          idVisitatore: row?.fields?.Title,
          nome: row?.fields?.Nome,
          cognome: row?.fields?.Cognome,
          email: row?.fields?.Email,
          azienda: row?.fields?.Azienda,
          qrCode: row?.fields?.Title,
          puntoAccesso: "Area Riservata",
          categoria: row?.fields?.Categoria || "VISITATORE",
          language: "it",
          source: "area-riservata",
        });

        setActionMessage(`QR reinviato a ${row?.fields?.Email || "indirizzo non disponibile"}`);
      } catch (err: any) {
        const msg = err?.message || "Errore durante il reinvio del QR";
        setActionError(msg);
      } finally {
        setSendingId(null);
      }
    },
    [callPowerAutomate]
  );

  const renderTable = () => {
    if (visitatori.length === 0) {
      return (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📭</div>
          <div style={styles.emptyTitle}>Nessun visitatore caricato</div>
          <div style={styles.emptySubtitle}>Recupera i dati da SharePoint per vedere la tabella.</div>
        </div>
      );
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginated = filtered.slice(startIndex, endIndex);

    return (
      <div style={styles.tableShell}>
        <div style={styles.tableHeader}>
            <div>Totale: {filtered.length}</div>
            <div style={styles.pageSizeControl}>
              <span style={styles.pageSizeLabel}>Per pagina</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={styles.pageSizeSelect}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
        </div>
        <div style={styles.tableWrap}>
            <table style={styles.table}>
            <thead>
              <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Cognome</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Categoria</th>
                  <th style={styles.th}>Azienda</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
                {paginated.map((v, idx) => {
                  const rowNumber = startIndex + idx;
                  const isHover = hoverRowId === v.id;
                  return (
                  <tr
                    key={v.id}
                    style={{
                      ...styles.tr,
                      ...(rowNumber % 2 ? styles.trAlt : {}),
                      ...(isHover ? styles.trHover : {}),
                    }}
                    onMouseEnter={() => setHoverRowId(v.id)}
                    onMouseLeave={() => setHoverRowId(null)}
                  >
                    <td style={styles.td}><code style={styles.code}>{v.fields.Title}</code></td>
                    <td style={styles.td}>{v.fields.Nome || "-"}</td>
                    <td style={styles.td}>{v.fields.Cognome || "-"}</td>
                    <td style={styles.td}>{v.fields.Email || "-"}</td>
                    <td style={styles.td}>{v.fields.Categoria || "-"}</td>
                    <td style={styles.td}>{v.fields.Azienda || "-"}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <button
                        style={{
                          ...styles.iconButton,
                          ...(sendingId === v.id ? styles.iconButtonDisabled : {}),
                        }}
                        onClick={() => handleResendQr(v)}
                        disabled={sendingId === v.id}
                        aria-label={`Reinvia QR a ${v.fields.Email || v.fields.Nome || "visitatore"}`}
                        title="Reinvio QR Code"
                      >
                        {sendingId === v.id ? "⏳" : "📧"}
                      </button>
                    </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <div style={styles.paginationBar}>
          <div style={styles.paginationInfo}>
            Mostrati {filtered.length === 0 ? 0 : startIndex + 1}–
            {Math.min(endIndex, filtered.length)} su {filtered.length}
          </div>
          <div style={styles.paginationControls}>
            <button
              style={{ ...styles.pageButton, ...(page === 1 ? styles.pageButtonDisabled : {}) }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Precedente
            </button>
            <div style={styles.pageIndicator}>
              Pagina {page} / {totalPages}
            </div>
            <button
              style={{
                ...styles.pageButton,
                ...(page === totalPages ? styles.pageButtonDisabled : {}),
              }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Successiva →
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.shell}>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.filtersCard}>
        <div style={styles.filtersGrid}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>🙋 Nome o cognome</label>
            <input
              style={styles.input}
              placeholder="Es. Mario Rossi"
              value={filters.nome}
              onChange={(e) => setFilters({ ...filters, nome: e.target.value })}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>✉️ Email</label>
            <input
              style={styles.input}
              placeholder="esempio@azienda.it"
              value={filters.email}
              onChange={(e) => setFilters({ ...filters, email: e.target.value })}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>🏢 Azienda</label>
            <input
              style={styles.input}
              placeholder="Acme"
              value={filters.azienda}
              onChange={(e) => setFilters({ ...filters, azienda: e.target.value })}
            />
          </div>
          <div style={styles.filterActions}>
            <button style={styles.ghostButton} onClick={resetFiltri} disabled={loading}>
              ♻️ Reset filtri
            </button>
          </div>
        </div>
      </div>

      {actionMessage && <div style={styles.actionMessage}>{actionMessage}</div>}
      {actionError && <div style={styles.actionError}>{actionError}</div>}

      {renderTable()}
    </div>
  );
}

export default SharePointTest;

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
  },
  error: {
    border: "1px solid #f87171",
    background: "#fef2f2",
    color: "#b91c1c",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: 700,
  },
  info: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: 700,
  },
  filtersCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "12px",
    background: "#f8fafc",
    boxShadow: "0 10px 20px rgba(0,0,0,0.04)",
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  filterLabel: {
    fontWeight: 750,
    color: "#334155",
    fontSize: "0.95rem",
  },
  input: {
    border: "1px solid #d9e2ec",
    borderRadius: "10px",
    padding: "10px",
    fontSize: "0.95rem",
    background: "white",
    color: "#0f172a",
  },
  filterActions: {
    display: "flex",
    alignItems: "flex-end",
  },
  ghostButton: {
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: "10px",
    padding: "10px 12px",
    fontWeight: 750,
    cursor: "pointer",
    width: "100%",
  },
  tableShell: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    overflow: "hidden",
    background: "white",
    boxShadow: "0 16px 30px rgba(0,0,0,0.06)",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
    color: "#0f172a",
    fontWeight: 800,
  },
  pageSizeControl: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  pageSizeLabel: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "#334155",
  },
  pageSizeSelect: {
    padding: "8px 10px",
    fontSize: "0.9rem",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    cursor: "pointer",
  },
  tableLegend: {
    color: "#475569",
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.95rem",
    minWidth: "680px",
  },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    color: "#1f2933",
    fontWeight: 700,
    borderBottom: "1px solid #e2e8f0",
    background: "#f2f5f9",
  },
  tr: {
    borderBottom: "1px solid #e2e8f0",
    transition: "background-color 0.15s ease, box-shadow 0.15s ease",
  },
  trAlt: {
    background: "#f7f9fb",
  },
  trHover: {
    background: "#eef2ff",
    boxShadow: "inset 0 1px 0 #e0e7ff, inset 0 -1px 0 #e0e7ff",
  },
  td: {
    padding: "12px 14px",
    color: "#2d3439",
    fontWeight: 500,
    verticalAlign: "middle",
  },
  code: {
    background: "#f1f5f9",
    padding: "2px 6px",
    borderRadius: "6px",
  },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    background: "#0f172a",
    color: "#f8fafc",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease",
    boxShadow: "0 6px 14px rgba(0,0,0,0.08)",
  },
  iconButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    transform: "none",
    boxShadow: "none",
  },
  emptyState: {
    border: "1px dashed #cbd5e1",
    borderRadius: "12px",
    padding: "18px",
    textAlign: "center",
    background: "#f8fafc",
  },
  emptyIcon: {
    fontSize: "2rem",
  },
  emptyTitle: {
    fontWeight: 800,
    color: "#0f172a",
    marginTop: "6px",
  },
  emptySubtitle: {
    color: "#475569",
    marginTop: "4px",
  },
  actionMessage: {
    border: "1px solid #bbf7d0",
    background: "#ecfdf3",
    color: "#166534",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: 700,
  },
  actionError: {
    border: "1px solid #fecdd3",
    background: "#fef2f2",
    color: "#9f1239",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: 700,
  },
  paginationBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
    gap: "10px",
  },
  paginationInfo: {
    color: "#4b5563",
    fontSize: "0.92rem",
    fontWeight: 700,
  },
  paginationControls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  pageIndicator: {
    color: "#111827",
    fontWeight: 800,
    fontSize: "0.95rem",
    padding: "6px 10px",
    backgroundColor: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
  },
  pageButton: {
    padding: "9px 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  pageButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
