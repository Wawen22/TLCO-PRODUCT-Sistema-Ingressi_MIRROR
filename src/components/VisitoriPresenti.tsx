import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { AccessiService } from "../services/accessiService";
import type { VisitorePresente } from "../types/accessi.types";

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;
const accessiListId = import.meta.env.VITE_ACCESSI_LIST_ID;

/**
 * Dashboard dei visitatori attualmente presenti
 * Ottimizzata per visualizzazione su monitor orizzontali
 */
export const VisitoriPresenti = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const { instance, accounts } = useMsal();
  const [visitatoriPresenti, setVisitatoriPresenti] = useState<VisitorePresente[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  useEffect(() => {
    loadVisitatoriPresenti();
    // Auto-refresh ogni 30 secondi
    const interval = setInterval(() => {
      loadVisitatoriPresenti();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadVisitatoriPresenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loadVisitatoriPresenti = async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);
      const accessiService = new AccessiService(
        accessToken,
        siteId,
        accessiListId,
        visitatoriListId
      );

      const presenti = await accessiService.getVisitoriPresenti();
      setVisitatoriPresenti(presenti);
    } catch (error: any) {
      console.error("❌ Errore nel caricamento dei visitatori presenti:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("it-IT", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("it-IT", { 
      day: "2-digit", 
      month: "2-digit",
      year: "numeric"
    });
  };

  const getTempoPresenza = (timestampIngresso: string) => {
    const ingresso = new Date(timestampIngresso);
    const ora = new Date();
    const diffMs = ora.getTime() - ingresso.getTime();
    const diffMinuti = Math.floor(diffMs / 60000);
    
    if (diffMinuti < 60) {
      return `${diffMinuti} min`;
    } else {
      const ore = Math.floor(diffMinuti / 60);
      const minuti = diffMinuti % 60;
      return `${ore}h ${minuti}m`;
    }
  };

  const filteredPresenti = visitatoriPresenti.filter((v) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.nome.toLowerCase().includes(term) ||
      v.cognome.toLowerCase().includes(term) ||
      (v.azienda || "").toLowerCase().includes(term) ||
      (v.PercorsoDestinazione || "").toLowerCase().includes(term)
    );
  });

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.toggleGroup}>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            style={{
              ...styles.toggleButton,
              ...(viewMode === "cards" ? styles.toggleButtonActive : {}),
            }}
            aria-pressed={viewMode === "cards"}
            aria-label="Vista card"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={styles.toggleIcon}
            >
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M4 9.5h16" />
              <path d="M9.5 4v16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            style={{
              ...styles.toggleButton,
              ...(viewMode === "table" ? styles.toggleButtonActive : {}),
            }}
            aria-pressed={viewMode === "table"}
            aria-label="Vista tabella"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={styles.toggleIcon}
            >
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M8.5 16.5V13" />
              <path d="M12 16.5V10" />
              <path d="M15.5 16.5V11.5" />
            </svg>
          </button>
        </div>
        <div style={styles.searchWrapper}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            type="search"
            placeholder="Cerca per nome, cognome o azienda"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>
      {loading && visitatoriPresenti.length === 0 ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Caricamento visitatori presenti...</p>
        </div>
      ) : filteredPresenti.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🏢</div>
          <h2 style={styles.emptyTitle}>
            {searchTerm.trim() ? "Nessun risultato" : "Nessun visitatore presente"}
          </h2>
          <p style={styles.emptyText}>
            {searchTerm.trim()
              ? "Prova a cercare con un altro nome o azienda."
              : "Al momento non ci sono visitatori registrati in sede."}
          </p>
        </div>
      ) : viewMode === "cards" ? (
        <div style={styles.grid}>
          {filteredPresenti.map((visitatore, index) => {
            const isHover = hoverIndex === index;
            return (
              <div
                key={`${visitatore.visitatoreId}-${index}`}
                style={{ ...styles.card, ...(isHover ? styles.cardHover : {}) }}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <div style={styles.cardTop}>
                  <div style={styles.cardHeader}>
                    <div style={styles.avatar}>
                      {visitatore.nome.charAt(0)}{visitatore.cognome.charAt(0)}
                    </div>
                    <div style={styles.cardHeaderInfo}>
                      <h3 style={styles.cardName}>
                        {visitatore.nome} {visitatore.cognome}
                      </h3>
                      <p style={styles.cardCompany}>{visitatore.azienda || "Azienda non indicata"}</p>
                    </div>
                  </div>
                  <span style={styles.statusPill}>In sede</span>
                </div>

                <div style={styles.cardBody}>
                  <div style={styles.cardRow}>
                    <div style={styles.rowLabel}>Punto accesso</div>
                    <div style={styles.rowValue}>{visitatore.puntoAccesso}</div>
                  </div>
                  <div style={styles.cardRow}>
                    <div style={styles.rowLabel}>Destinazione</div>
                    <div style={{ ...styles.rowValue, ...styles.destValue }}>
                      {visitatore.PercorsoDestinazione || "—"}
                    </div>
                  </div>
                  <div style={styles.cardRow}>
                    <div style={styles.rowLabel}>Ingresso</div>
                    <div style={styles.rowValue}>{formatDate(visitatore.timestampIngresso)} · {formatTime(visitatore.timestampIngresso)}</div>
                  </div>
                  <div style={styles.cardRow}>
                    <div style={styles.rowLabel}>Tempo in sede</div>
                    <div style={{ ...styles.rowValue, ...styles.timeValue }}>{getTempoPresenza(visitatore.timestampIngresso)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <div style={styles.table}>
            <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
              <div style={{ ...styles.tableCell, ...styles.colName }}>Nome</div>
              <div style={{ ...styles.tableCell, ...styles.colCompany }}>Azienda</div>
              <div style={{ ...styles.tableCell, ...styles.colDestination }}>Destinazione</div>
              <div style={{ ...styles.tableCell, ...styles.colAccessPoint }}>Punto accesso</div>
              <div style={{ ...styles.tableCell, ...styles.colIngress }}>Ingresso</div>
              <div style={{ ...styles.tableCell, ...styles.colDuration }}>Tempo in sede</div>
            </div>
            {filteredPresenti.map((visitatore, index) => (
              <div
                key={`${visitatore.visitatoreId}-${index}`}
                style={{
                  ...styles.tableRow,
                  ...(index % 2 === 1 ? styles.tableRowAlt : {}),
                  ...(hoverIndex === index ? styles.tableRowHover : {}),
                }}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <div style={{ ...styles.tableCell, ...styles.colName }}>
                  <div style={styles.tableName}>{visitatore.nome} {visitatore.cognome}</div>
                  <div style={styles.tableSubText}>ID: {visitatore.visitatoreId}</div>
                </div>
                <div style={{ ...styles.tableCell, ...styles.colCompany }}>
                  {visitatore.azienda || "Azienda non indicata"}
                </div>
                <div style={{ ...styles.tableCell, ...styles.colDestination }}>
                  <span style={styles.destBadge}>
                    {visitatore.PercorsoDestinazione || "—"}
                  </span>
                </div>
                <div style={{ ...styles.tableCell, ...styles.colAccessPoint }}>
                  {visitatore.puntoAccesso}
                </div>
                <div style={{ ...styles.tableCell, ...styles.colIngress }}>
                  {formatDate(visitatore.timestampIngresso)} · {formatTime(visitatore.timestampIngresso)}
                </div>
                <div style={{ ...styles.tableCell, ...styles.colDuration }}>
                  <span style={styles.badge}>{getTempoPresenza(visitatore.timestampIngresso)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "10px 6px 2px",
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    maxWidth: "1600px",
    margin: "0 auto",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
  },
  toggleGroup: {
    display: "inline-flex",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    boxShadow: "0 6px 14px rgba(15, 23, 42, 0.06)",
  },
  toggleButton: {
    background: "#f8fafc",
    border: "none",
    padding: "10px 14px",
    fontSize: "0.92rem",
    color: "#475569",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  },
  toggleButtonActive: {
    background: "#2563eb",
    color: "#f8fafc",
  },
  toggleIcon: {
    fontSize: "1.05rem",
    lineHeight: 1,
    display: "inline-block",
  },
  searchWrapper: {
    position: "relative",
    width: "100%",
    maxWidth: "360px",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    opacity: 0.75,
  },
  searchInput: {
    width: "100%",
    padding: "10px 12px 10px 38px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    fontSize: "0.95rem",
    outline: "none",
    transition: "box-shadow 0.15s ease, border-color 0.15s ease",
    boxShadow: "0 6px 14px rgba(15, 23, 42, 0.04)",
  },
  loadingContainer: {
    textAlign: "center",
    padding: "60px 20px",
  },
  spinner: {
    fontSize: "4rem",
    marginBottom: "20px",
  },
  loadingText: {
    fontSize: "1.3rem",
    color: "#605e5c",
  },
  emptyState: {
    textAlign: "center",
    padding: "80px 20px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  emptyIcon: {
    fontSize: "5rem",
    marginBottom: "20px",
  },
  emptyTitle: {
    color: "#323130",
    fontSize: "1.8rem",
    marginBottom: "10px",
  },
  emptyText: {
    color: "#605e5c",
    fontSize: "1.2rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "14px",
  },
  tableWrapper: {
    background: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
    minWidth: "700px",
  },
  table: {
    display: "grid",
    gridTemplateColumns: "1fr",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 0.9fr 1fr 1.1fr 0.8fr",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid #e2e8f0",
  },
  tableRowAlt: {
    background: "#f8fafc",
  },
  tableRowHover: {
    background: "#eef2ff",
    boxShadow: "inset 0 1px 0 rgba(99,102,241,0.15)",
  },
  tableHeader: {
    background: "linear-gradient(90deg, #eef2ff, #f8fafc)",
    fontWeight: 700,
    color: "#0f172a",
    textTransform: "none",
    letterSpacing: "0.01em",
    fontSize: "0.74rem",
    borderBottom: "1px solid #e2e8f0",
    boxShadow: "inset 0 -1px 0 rgba(99,102,241,0.1)",
  },
  tableCell: {
    fontSize: "0.93rem",
    color: "#111827",
    minWidth: 0,
    fontWeight: 600,
  },
  tableName: {
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: "2px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tableSubText: {
    color: "#6b7280",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  colName: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  colCompany: {
    color: "#1f2937",
    fontWeight: 600,
  },
  colAccessPoint: {
    color: "#1f2937",
    fontWeight: 600,
  },
  colDestination: {
    color: "#1f2937",
    fontWeight: 700,
  },
  colIngress: {
    color: "#0f172a",
    fontWeight: 600,
  },
  colDuration: {
    display: "flex",
    justifyContent: "flex-start",
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "10px",
    background: "#e0f2fe",
    color: "#0369a1",
    fontWeight: 700,
    fontSize: "0.9rem",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    border: "0px solid transparent",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
    willChange: "transform",
    outline: "none",
  },
  cardHover: {
    transform: "translateY(-3px)",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.16)",
    borderColor: "#cbd5e1",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    flex: 1,
  },
  avatar: {
    width: "46px",
    height: "46px",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #2563eb, #38bdf8)",
    color: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.05rem",
    fontWeight: 800,
    flexShrink: 0,
  },
  cardHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    margin: 0,
    fontSize: "1.05rem",
    color: "#0f172a",
    letterSpacing: "-0.01em",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardCompany: {
    margin: "2px 0 0",
    fontSize: "0.9rem",
    color: "#475569",
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  destBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "10px",
    background: "#ecfeff",
    color: "#0e7490",
    fontWeight: 800,
    fontSize: "0.92rem",
    minWidth: "92px",
    textAlign: "center",
  },
  destValue: {
    fontWeight: 800,
    color: "#0f172a",
  },
  statusPill: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(16, 185, 129, 0.12)",
    color: "#0f766e",
    fontWeight: 700,
    fontSize: "0.82rem",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  cardBody: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
    padding: "6px 2px 2px",
  },
  cardRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "8px 10px",
    borderRadius: "10px",
    background: "#f8fafc",
    border: "1px dashed #e2e8f0",
  },
  rowLabel: {
    color: "#475569",
    fontWeight: 600,
    fontSize: "0.86rem",
    letterSpacing: "0.01em",
  },
  rowValue: {
    color: "#0f172a",
    fontWeight: 600,
    fontSize: "0.95rem",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  timeValue: {
    color: "#1d4ed8",
  },
};
