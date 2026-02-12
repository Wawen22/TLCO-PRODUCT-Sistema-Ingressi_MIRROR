import { useState, useEffect, Fragment } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { AccessiService } from "../services/accessiService";
import * as XLSX from "xlsx";
import type React from "react";
import { createPortal } from "react-dom";

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;
const accessiListId = import.meta.env.VITE_ACCESSI_LIST_ID;

/**
 * Componente per visualizzare lo storico completo degli accessi
 * Con filtri per data, visitatore e tipo di azione
 */
export const StoricAccessi = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const { instance, accounts } = useMsal();
  const [accessi, setAccessi] = useState<any[]>([]);
  const [accessiFiltrati, setAccessiFiltrati] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState<number>(1);
  const [filtroAzione, setFiltroAzione] = useState<string>("Tutti");
  const [filtroPuntoAccesso, setFiltroPuntoAccesso] = useState<string>("Tutti");
  const [filtroVisitatore, setFiltroVisitatore] = useState<string>("");
  const [dataInizio, setDataInizio] = useState<string>("");
  const [dataFine, setDataFine] = useState<string>("");
  const [notaApertaId, setNotaApertaId] = useState<string | number | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | number | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDataInizio, setExportDataInizio] = useState<string>("");
  const [exportDataFine, setExportDataFine] = useState<string>("");
  const [exportAzione, setExportAzione] = useState<string>("Tutti");
  const [exportPuntoAccesso, setExportPuntoAccesso] = useState<string>("Tutti");
  const [exportVisitatore, setExportVisitatore] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  type AccessiFilters = {
    azione: string;
    puntoAccesso: string;
    visitatore: string;
    startDate: string;
    endDate: string;
  };

  useEffect(() => {
    loadAccessi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAccessi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    applicaFiltri();
  }, [
    accessi,
    filtroAzione,
    filtroPuntoAccesso,
    filtroVisitatore,
    dataInizio,
    dataFine,
  ]);

  const loadAccessi = async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);
      const accessiService = new AccessiService(
        accessToken,
        siteId,
        accessiListId,
        visitatoriListId
      );

      const accessiData = await accessiService.getAllAccessi(500);
      // normalizza azione/timestamp per uso comodo nel rendering
      const normalized = accessiData.map((a: any) => {
        const f = a.fields || {};
        return {
          ...a,
          fields: {
            ...f,
            Azione: f.Azione ?? f.field_5,
            Timestamp: f.Timestamp ?? f.field_4,
          },
        };
      });
      setAccessi(normalized);
    } catch (error: any) {
      console.error("❌ Errore nel caricamento degli accessi:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtraAccessi = (lista: any[], filtri: AccessiFilters) => {
    let risultati = [...lista];

    if (filtri.azione !== "Tutti") {
      risultati = risultati.filter((a) => {
        const az = `${a.fields?.Azione ?? a.fields?.field_5 ?? ""}`.toLowerCase();
        return az === filtri.azione.toLowerCase();
      });
    }

    if (filtri.puntoAccesso !== "Tutti") {
      risultati = risultati.filter((a) => a.fields?.PuntoAccesso === filtri.puntoAccesso);
    }

    if (filtri.visitatore) {
      const visitorLower = filtri.visitatore.toLowerCase();
      risultati = risultati.filter((a) => {
        const nome = a.fields?.VisitoreNome?.toLowerCase() || "";
        const cognome = a.fields?.VisitoreCognome?.toLowerCase() || "";
        const idVisitatore = a.fields?.VisitoreID?.toLowerCase() || "";
        return (
          nome.includes(visitorLower) ||
          cognome.includes(visitorLower) ||
          `${nome} ${cognome}`.trim().includes(visitorLower) ||
          idVisitatore.includes(visitorLower)
        );
      });
    }

    if (filtri.startDate) {
      const dataInizioObj = new Date(filtri.startDate);
      risultati = risultati.filter((a) => {
        const dataAccesso = new Date(a.fields?.Timestamp || a.fields?.field_4);
        return dataAccesso >= dataInizioObj;
      });
    }

    if (filtri.endDate) {
      const dataFineObj = new Date(filtri.endDate);
      dataFineObj.setHours(23, 59, 59, 999);
      risultati = risultati.filter((a) => {
        const dataAccesso = new Date(a.fields?.Timestamp || a.fields?.field_4);
        return dataAccesso <= dataFineObj;
      });
    }

    return risultati;
  };

  const applicaFiltri = () => {
    const filtriCorrenti: AccessiFilters = {
      azione: filtroAzione,
      puntoAccesso: filtroPuntoAccesso,
      visitatore: filtroVisitatore,
      startDate: dataInizio,
      endDate: dataFine,
    };

    setAccessiFiltrati(filtraAccessi(accessi, filtriCorrenti));
    setPage(1);
  };

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(accessiFiltrati.length / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [accessiFiltrati.length, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const resetFiltri = () => {
    setFiltroAzione("Tutti");
    setFiltroPuntoAccesso("Tutti");
    setFiltroVisitatore("");
    setDataInizio("");
    setDataFine("");
    setNotaApertaId(null);
  };

  const handleOpenExport = () => {
    setExportDataInizio(dataInizio);
    setExportDataFine(dataFine);
    setExportAzione(filtroAzione);
    setExportPuntoAccesso(filtroPuntoAccesso);
    setExportVisitatore(filtroVisitatore);
    setExportError("");
    setShowExportModal(true);
  };

  const handleExportDownload = () => {
    if (!exportDataInizio || !exportDataFine) {
      setExportError("Seleziona una data di inizio e fine per l'export.");
      return;
    }

    const filtriExport: AccessiFilters = {
      azione: exportAzione,
      puntoAccesso: exportPuntoAccesso,
      visitatore: exportVisitatore,
      startDate: exportDataInizio,
      endDate: exportDataFine,
    };

    const risultati = filtraAccessi(accessi, filtriExport);

    if (risultati.length === 0) {
      setExportError("Nessun record corrisponde ai filtri selezionati.");
      return;
    }

    setExportError("");
    setExporting(true);

    try {
      const rows = risultati.map((accesso) => ({
        "ID Accesso": accesso.fields?.Title || "",
        Visitatore:
          accesso.fields?.VisitoreNome && accesso.fields?.VisitoreCognome
            ? `${accesso.fields.VisitoreNome} ${accesso.fields.VisitoreCognome}`
            : accesso.fields?.VisitoreID || "",
        "Data e ora": accesso.fields?.Timestamp
          ? formatDateTime(accesso.fields.Timestamp)
          : "",
        Azione: accesso.fields?.Azione || "",
        "Punto Accesso": accesso.fields?.PuntoAccesso || "",
        Destinazione: accesso.fields?.PercorsoDestinazione || "",
        Categoria: accesso.fields?.Categoria || "",
        Note: accesso.fields?.Note || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Storico Accessi");

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `storico-accessi_${exportDataInizio || "all"}_${exportDataFine || "all"}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      setShowExportModal(false);
    } catch (error) {
      console.error("❌ Errore durante l'export Excel:", error);
      setExportError("Errore durante la generazione del file. Riprova.");
    } finally {
      setExporting(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const puntiAccesso = ["Tutti", "Kiosk Principale", "Reception", "Magazzino"];

  const totalPages = Math.max(1, Math.ceil(accessiFiltrati.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedAccessi = accessiFiltrati.slice(startIndex, endIndex);

  return (
    <>
      <div style={styles.container}>
      {/* Filtri */}
      <div style={styles.filtersCard}>
        <div style={styles.filtersGrid}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>🙋 Visitatore</label>
            <input
              type="text"
              value={filtroVisitatore}
              onChange={(e) => setFiltroVisitatore(e.target.value)}
              placeholder="Nome, cognome o ID"
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>📌 Azione</label>
            <select
              value={filtroAzione}
              onChange={(e) => setFiltroAzione(e.target.value)}
              style={styles.select}
            >
              <option>Tutti</option>
              <option>Ingresso</option>
              <option>Uscita</option>
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>🚪 Punto Accesso</label>
            <select
              value={filtroPuntoAccesso}
              onChange={(e) => setFiltroPuntoAccesso(e.target.value)}
              style={styles.select}
            >
              {puntiAccesso.map((punto) => (
                <option key={punto}>{punto}</option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>📅 Data Inizio</label>
            <input
              type="date"
              value={dataInizio}
              onChange={(e) => setDataInizio(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>📅 Data Fine</label>
            <input
              type="date"
              value={dataFine}
              onChange={(e) => setDataFine(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>&nbsp;</label>
            <button onClick={resetFiltri} style={styles.resetButton}>
              🔄 Reset Filtri
            </button>
          </div>
        </div>
      </div>

      {/* Tabella Accessi */}
      {loading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Caricamento storico accessi...</p>
        </div>
      ) : accessiFiltrati.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📭</div>
          <h2 style={styles.emptyTitle}>Nessun accesso trovato</h2>
          <p style={styles.emptyText}>
            {accessi.length === 0
              ? "Non ci sono ancora accessi registrati."
              : "Nessun accesso corrisponde ai filtri selezionati."}
          </p>
        </div>
      ) : (
        <div style={styles.tableContainer}>
      <div style={styles.tableHeaderStrip}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span>Storico Accessi</span>
          <button onClick={handleOpenExport} style={styles.exportButton}>
            ⬇️ Esporta Excel
          </button>
        </div>
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
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>ID Accesso</th>
                <th style={styles.th}>Visitatore</th>
                <th style={styles.th}>Data e Ora</th>
                <th style={styles.th}>Azione</th>
                <th style={styles.th}>Destinazione</th>
                <th style={styles.th}>Punto Accesso</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAccessi.map((accesso, index) => {
                const rowKey = accesso.id || index;
                const hasNote = Boolean(accesso.fields?.Note?.trim());
                return (
                  <Fragment key={rowKey}>
                    <tr
                      style={{
                        ...styles.tableRow,
                        backgroundColor: index % 2 === 0 ? "#f7f9fb" : "white",
                        ...(hoverRowId === rowKey ? styles.tableRowHover : {}),
                      }}
                      onMouseEnter={() => setHoverRowId(rowKey)}
                      onMouseLeave={() => setHoverRowId(null)}
                    >
                    <td style={styles.td}>{accesso.fields?.Title || "N/A"}</td>
                    <td style={styles.td}>
                      {accesso.fields?.VisitoreNome && accesso.fields?.VisitoreCognome
                        ? `${accesso.fields.VisitoreNome} ${accesso.fields.VisitoreCognome}`
                        : accesso.fields?.VisitoreID || "N/A"}
                    </td>
                    <td style={styles.td}>
                      {accesso.fields?.Timestamp
                        ? formatDateTime(accesso.fields.Timestamp)
                        : "N/A"}
                    </td>
                    <td style={styles.td}>
                      {(() => {
                        const az = `${accesso.fields?.Azione ?? ""}`.toLowerCase();
                        const isIngresso = az === "ingresso";
                        return (
                          <span
                            style={{
                              ...styles.badge,
                              backgroundColor: isIngresso ? "#d4edda" : "#f8d7da",
                              color: isIngresso ? "#155724" : "#721c24",
                            }}
                          >
                            {isIngresso ? "✅ Ingresso" : "❌ Uscita"}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.destBadge}>
                        {accesso.fields?.PercorsoDestinazione || "—"}
                      </span>
                    </td>
                    <td style={{ ...styles.td, ...styles.puntoAccessoCell }}>
                      <span>{accesso.fields?.PuntoAccesso || "N/A"}</span>
                      {hasNote ? (
                        <button
                          style={{
                            ...styles.noteIconButton,
                            ...(notaApertaId === rowKey ? styles.noteIconButtonActive : {}),
                          }}
                          onClick={() =>
                            setNotaApertaId((prev) => (prev === rowKey ? null : rowKey))
                          }
                          aria-label="Mostra nota"
                        >
                          📝
                        </button>
                      ) : null}
                    </td>
                    </tr>
                    {notaApertaId === rowKey && hasNote && (
                    <tr style={styles.noteRow}>
                      <td style={styles.noteCell} colSpan={6}>
                        {accesso.fields.Note}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={styles.paginationBar}>
            <div style={styles.paginationInfo}>
              Mostrati {accessiFiltrati.length === 0 ? 0 : startIndex + 1}–
              {Math.min(endIndex, accessiFiltrati.length)} su {accessiFiltrati.length}
            </div>
            <div style={styles.paginationControls}>
              <button
                style={{
                  ...styles.pageButton,
                  ...(page === 1 ? styles.pageButtonDisabled : {}),
                }}
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
      )}
      </div>

      {showExportModal &&
        createPortal(
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.modalTitle}>Esporta Storico Accessi</div>
                  <div style={styles.modalSubtitle}>Seleziona un range di date e filtri opzionali prima del download.</div>
                </div>
                <button style={styles.modalClose} onClick={() => setShowExportModal(false)}>✖</button>
              </div>

              <div style={styles.modalGrid}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>📅 Data Inizio</label>
                  <input
                    type="date"
                    value={exportDataInizio}
                    onChange={(e) => setExportDataInizio(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>📅 Data Fine</label>
                  <input
                    type="date"
                    value={exportDataFine}
                    onChange={(e) => setExportDataFine(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>📌 Azione</label>
                  <select
                    value={exportAzione}
                    onChange={(e) => setExportAzione(e.target.value)}
                    style={styles.select}
                  >
                    <option>Tutti</option>
                    <option>Ingresso</option>
                    <option>Uscita</option>
                  </select>
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>🚪 Punto Accesso</label>
                  <select
                    value={exportPuntoAccesso}
                    onChange={(e) => setExportPuntoAccesso(e.target.value)}
                    style={styles.select}
                  >
                    {puntiAccesso.map((punto) => (
                      <option key={punto}>{punto}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>🙋 Visitatore</label>
                  <input
                    type="text"
                    value={exportVisitatore}
                    onChange={(e) => setExportVisitatore(e.target.value)}
                    placeholder="Nome, cognome o ID"
                    style={styles.input}
                  />
                </div>
              </div>

              {exportError && <div style={styles.exportError}>{exportError}</div>}

              <div style={styles.modalActions}>
                <button style={styles.cancelButton} onClick={() => setShowExportModal(false)} disabled={exporting}>
                  Annulla
                </button>
                <button style={styles.exportCta} onClick={handleExportDownload} disabled={exporting}>
                  {exporting ? "Generazione..." : "Scarica Excel"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "20px",
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: "1800px",
    margin: "0 auto",
  },
  filtersCard: {
    backgroundColor: "white",
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
    marginBottom: "26px",
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginBottom: "6px",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
  },
  filterLabel: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "#2f3336",
    marginBottom: "6px",
  },
  input: {
    padding: "11px",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "1px solid #d8dde3",
    transition: "border-color 0.2s, box-shadow 0.2s",
    backgroundColor: "#f9fafb",
  },
  select: {
    padding: "11px",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "1px solid #d8dde3",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  },
  resetButton: {
    padding: "12px",
    fontSize: "0.95rem",
    backgroundColor: "#222222",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
    boxShadow: "0 10px 18px rgba(0,0,0,0.08)",
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
  tableContainer: {
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  tableHeaderStrip: {
    padding: "14px 18px",
    borderBottom: "1px solid #e6e9ed",
    background: "linear-gradient(90deg, #f8fafc, #eef2f7)",
    color: "#1f2933",
    fontWeight: 700,
    letterSpacing: "0.3px",
    fontSize: "0.95rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  pageSizeControl: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  pageSizeLabel: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#374151",
  },
  pageSizeSelect: {
    padding: "8px 10px",
    fontSize: "0.9rem",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  tableHeaderRow: {
    backgroundColor: "#f2f5f9",
    color: "#1f2933",
  },
  th: {
    padding: "14px 18px",
    textAlign: "left",
    fontSize: "0.95rem",
    fontWeight: 700,
    borderBottom: "1px solid #e6e9ed",
  },
  tableRow: {
    borderBottom: "1px solid #edf0f3",
    transition: "background-color 0.15s ease",
  },
  tableRowHover: {
    backgroundColor: "#eef2ff",
    boxShadow: "inset 0 1px 0 #e0e7ff, inset 0 -1px 0 #e0e7ff",
  },
  td: {
    padding: "13px 18px",
    fontSize: "0.95rem",
    color: "#2d3439",
  },
  badge: {
    padding: "6px 12px",
    borderRadius: "12px",
    fontSize: "0.88rem",
    fontWeight: 700,
    display: "inline-block",
  },
  puntoAccessoCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  destBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "10px",
    backgroundColor: "#e0f2fe",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: "0.9rem",
    minWidth: "110px",
    textAlign: "center",
  },
  paginationBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 18px",
    borderTop: "1px solid #e6e9ed",
    backgroundColor: "#f9fafb",
    flexWrap: "wrap",
    gap: "10px",
  },
  paginationInfo: {
    color: "#4b5563",
    fontSize: "0.92rem",
    fontWeight: 600,
  },
  paginationControls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  pageIndicator: {
    color: "#111827",
    fontWeight: 700,
    fontSize: "0.95rem",
    padding: "6px 10px",
    backgroundColor: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
  },
  pageButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    color: "#111827",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  pageButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  noteIconButton: {
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    borderRadius: "50%",
    width: "36px",
    height: "36px",
    cursor: "pointer",
    fontSize: "1rem",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    transition: "all 0.15s ease",
  },
  exportButton: {
    padding: "9px 12px",
    borderRadius: "10px",
    border: "1px solid #cfd6e4",
    backgroundColor: "#0f172a",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.15)",
  },
  noteIconButtonActive: {
    backgroundColor: "#e5edff",
    borderColor: "#94b3ff",
    boxShadow: "0 6px 14px rgba(74, 108, 247, 0.25)",
  },
  noteRow: {
    backgroundColor: "#f8fafc",
  },
  noteCell: {
    padding: "14px 18px",
    fontSize: "0.95rem",
    color: "#1f2933",
    borderTop: "1px solid #e6e9ed",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 12000,
    padding: "16px",
  },
  modalCard: {
    backgroundColor: "white",
    borderRadius: "14px",
    boxShadow: "0 28px 60px rgba(0,0,0,0.18)",
    width: "min(720px, 100%)",
    padding: "22px",
    border: "1px solid #e2e8f0",
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
  },
  modalTitle: {
    fontSize: "1.3rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  modalSubtitle: {
    color: "#475569",
    marginTop: "4px",
  },
  modalClose: {
    border: "1px solid #e2e8f0",
    backgroundColor: "white",
    borderRadius: "8px",
    width: "38px",
    height: "38px",
    cursor: "pointer",
    fontSize: "1rem",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginBottom: "12px",
  },
  exportError: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "10px",
    padding: "10px 12px",
    marginBottom: "10px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "6px",
  },
  cancelButton: {
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1px solid #cfd6e4",
    backgroundColor: "white",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
  },
  exportCta: {
    padding: "11px 16px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(14, 165, 233, 0.35)",
  },
};
