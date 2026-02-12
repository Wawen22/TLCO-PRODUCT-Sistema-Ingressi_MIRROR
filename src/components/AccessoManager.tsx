import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { AccessiService } from "../services/accessiService";
import { SharePointService } from "../services/sharepointService";

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;
const accessiListId = import.meta.env.VITE_ACCESSI_LIST_ID;

const PUNTI_ACCESSO = [
  "Kiosk Principale",
  "Reception",
  "Magazzino",
];

/**
 * Componente per la gestione degli accessi (check-in/check-out)
 * Ottimizzato per totem e monitor touch screen orizzontali
 */
export const AccessoManager = () => {
  const { instance, accounts } = useMsal();
  const [visitatori, setVisitatori] = useState<any[]>([]);
  const [selectedVisitatore, setSelectedVisitatore] = useState<string>("");
  const [puntoAccesso, setPuntoAccesso] = useState<string>(PUNTI_ACCESSO[0]);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingVisitatori, setLoadingVisitatori] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ultimoAccesso, setUltimoAccesso] = useState<any>(null);

  // Carica i visitatori all'avvio
  useEffect(() => {
    loadVisitatori();
  }, []);

  // Quando si seleziona un visitatore, verifica l'ultimo accesso
  useEffect(() => {
    if (selectedVisitatore) {
      checkUltimoAccesso(selectedVisitatore);
    } else {
      setUltimoAccesso(null);
    }
  }, [selectedVisitatore]);

  const loadVisitatori = async () => {
    setLoadingVisitatori(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);

      const sharepointService = new SharePointService(
        accessToken,
        siteId,
        visitatoriListId
      );

      const visitatoriData = await sharepointService.getVisitatori();
      setVisitatori(visitatoriData);
    } catch (error: any) {
      console.error("❌ Errore nel caricamento dei visitatori:", error);
      showMessage("error", "Errore nel caricamento dei visitatori");
    } finally {
      setLoadingVisitatori(false);
    }
  };

  const checkUltimoAccesso = async (visitatoreId: string) => {
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);

      const accessiService = new AccessiService(
        accessToken,
        siteId,
        accessiListId,
        visitatoriListId
      );

      const ultimo = await accessiService.getUltimoAccesso(visitatoreId);
      setUltimoAccesso(ultimo);
    } catch (error: any) {
      console.error("❌ Errore nel recupero ultimo accesso:", error);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedVisitatore) {
      showMessage("error", "Seleziona un visitatore");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);

      const accessiService = new AccessiService(
        accessToken,
        siteId,
        accessiListId,
        visitatoriListId
      );

      // Trova il visitatore selezionato per ottenere l'ID numerico
      const visitatoreSelezionato = visitatori.find(
        (v) => v.fields.id === selectedVisitatore
      );

      if (!visitatoreSelezionato) {
        showMessage("error", "Visitatore non trovato");
        return;
      }

      await accessiService.createAccesso({
        VisitoreID: visitatoreSelezionato.fields.Title, // IDVisitatore
        VisitoreNome: visitatoreSelezionato.fields.Nome,
        VisitoreCognome: visitatoreSelezionato.fields.Cognome,
        Azione: "Ingresso",
        PuntoAccesso: puntoAccesso,
        Note: note,
        Timestamp: new Date().toISOString(),
      });

      showMessage("success", `✅ Check-in effettuato con successo per ${visitatoreSelezionato.fields.Nome} ${visitatoreSelezionato.fields.Cognome}`);
      
      // Reset form
      setNote("");
      checkUltimoAccesso(selectedVisitatore);
    } catch (error: any) {
      console.error("❌ Errore durante il check-in:", error);
      showMessage("error", "Errore durante il check-in");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedVisitatore) {
      showMessage("error", "Seleziona un visitatore");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);

      const accessiService = new AccessiService(
        accessToken,
        siteId,
        accessiListId,
        visitatoriListId
      );

      const visitatoreSelezionato = visitatori.find(
        (v) => v.fields.id === selectedVisitatore
      );

      if (!visitatoreSelezionato) {
        showMessage("error", "Visitatore non trovato");
        return;
      }

      await accessiService.createAccesso({
        VisitoreID: visitatoreSelezionato.fields.Title, // IDVisitatore
        VisitoreNome: visitatoreSelezionato.fields.Nome,
        VisitoreCognome: visitatoreSelezionato.fields.Cognome,
        Azione: "Uscita",
        PuntoAccesso: puntoAccesso,
        Note: note,
        Timestamp: new Date().toISOString(),
      });

      showMessage("success", `✅ Check-out effettuato con successo per ${visitatoreSelezionato.fields.Nome} ${visitatoreSelezionato.fields.Cognome}`);
      
      // Reset form
      setNote("");
      checkUltimoAccesso(selectedVisitatore);
    } catch (error: any) {
      console.error("❌ Errore durante il check-out:", error);
      showMessage("error", "Errore durante il check-out");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const visitatoreSelezionato = visitatori.find(
    (v) => v.fields.id === selectedVisitatore
  );

  const statoVisitatore = ultimoAccesso?.fields?.Azione === "Ingresso" ? "presente" : "assente";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🚪 Gestione Accessi</h1>
        <p style={styles.subtitle}>Check-in e Check-out Visitatori</p>
      </div>

      {message && (
        <div style={message.type === "success" ? styles.successMessage : styles.errorMessage}>
          {message.text}
        </div>
      )}

      <div style={styles.content}>
        {/* Selezione Visitatore */}
        <div style={styles.section}>
          <label style={styles.label}>👤 Seleziona Visitatore</label>
          <select
            value={selectedVisitatore}
            onChange={(e) => setSelectedVisitatore(e.target.value)}
            style={styles.selectLarge}
            disabled={loadingVisitatori}
          >
            <option value="">-- Seleziona un visitatore --</option>
            {visitatori.map((visitatore) => (
              <option key={visitatore.fields.id} value={visitatore.fields.id}>
                {visitatore.fields.Nome} {visitatore.fields.Cognome} - {visitatore.fields.Azienda}
              </option>
            ))}
          </select>

          {visitatoreSelezionato && (
            <div style={styles.visitatoreInfo}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Nome:</span>
                <span style={styles.infoValue}>{visitatoreSelezionato.fields.Nome} {visitatoreSelezionato.fields.Cognome}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Azienda:</span>
                <span style={styles.infoValue}>{visitatoreSelezionato.fields.Azienda || "N/A"}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Email:</span>
                <span style={styles.infoValue}>{visitatoreSelezionato.fields.Email || "N/A"}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Stato attuale:</span>
                <span style={{
                  ...styles.badge,
                  backgroundColor: statoVisitatore === "presente" ? "#d4edda" : "#f8d7da",
                  color: statoVisitatore === "presente" ? "#155724" : "#721c24",
                }}>
                  {statoVisitatore === "presente" ? "🟢 Presente" : "🔴 Assente"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Punto Accesso */}
        <div style={styles.section}>
          <label style={styles.label}>📍 Punto Accesso</label>
          <select
            value={puntoAccesso}
            onChange={(e) => setPuntoAccesso(e.target.value)}
            style={styles.selectLarge}
          >
            {PUNTI_ACCESSO.map((punto) => (
              <option key={punto} value={punto}>
                {punto}
              </option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div style={styles.section}>
          <label style={styles.label}>📝 Note (opzionale)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Aggiungi eventuali note..."
            style={styles.textarea}
            rows={3}
          />
        </div>

        {/* Bottoni Azione */}
        <div style={styles.actionButtons}>
          <button
            onClick={handleCheckIn}
            disabled={loading || !selectedVisitatore}
            style={{
              ...styles.button,
              ...styles.checkInButton,
              opacity: loading || !selectedVisitatore ? 0.5 : 1,
            }}
          >
            {loading ? "⏳ Attendere..." : "✅ CHECK-IN"}
          </button>

          <button
            onClick={handleCheckOut}
            disabled={loading || !selectedVisitatore}
            style={{
              ...styles.button,
              ...styles.checkOutButton,
              opacity: loading || !selectedVisitatore ? 0.5 : 1,
            }}
          >
            {loading ? "⏳ Attendere..." : "❌ CHECK-OUT"}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "20px",
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "30px",
    padding: "20px",
    backgroundColor: "#0078d4",
    color: "white",
    borderRadius: "12px",
  },
  title: {
    margin: "0 0 10px 0",
    fontSize: "2.5rem",
  },
  subtitle: {
    margin: 0,
    fontSize: "1.2rem",
    opacity: 0.9,
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "30px",
    gridTemplateRows: "auto auto 1fr",
  },
  section: {
    backgroundColor: "white",
    padding: "25px",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  label: {
    display: "block",
    fontSize: "1.3rem",
    fontWeight: "600",
    color: "#323130",
    marginBottom: "15px",
  },
  selectLarge: {
    width: "100%",
    padding: "18px",
    fontSize: "1.2rem",
    borderRadius: "8px",
    border: "2px solid #e1dfdd",
    backgroundColor: "white",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  textarea: {
    width: "100%",
    padding: "15px",
    fontSize: "1.1rem",
    borderRadius: "8px",
    border: "2px solid #e1dfdd",
    fontFamily: "inherit",
    resize: "vertical",
  },
  visitatoreInfo: {
    marginTop: "20px",
    padding: "20px",
    backgroundColor: "#f3f2f1",
    borderRadius: "8px",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #e1dfdd",
  },
  infoLabel: {
    fontWeight: "600",
    color: "#605e5c",
    fontSize: "1.1rem",
  },
  infoValue: {
    color: "#323130",
    fontSize: "1.1rem",
  },
  badge: {
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "1rem",
    fontWeight: "600",
  },
  actionButtons: {
    gridColumn: "1 / -1",
    display: "flex",
    gap: "30px",
    justifyContent: "center",
    padding: "30px",
  },
  button: {
    flex: 1,
    maxWidth: "400px",
    padding: "30px 50px",
    fontSize: "1.8rem",
    fontWeight: "700",
    border: "none",
    borderRadius: "16px",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
  },
  checkInButton: {
    backgroundColor: "#107c10",
    color: "white",
  },
  checkOutButton: {
    backgroundColor: "#d13438",
    color: "white",
  },
  successMessage: {
    padding: "20px",
    backgroundColor: "#d4edda",
    color: "#155724",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "1.2rem",
    textAlign: "center",
    fontWeight: "600",
  },
  errorMessage: {
    padding: "20px",
    backgroundColor: "#f8d7da",
    color: "#721c24",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "1.2rem",
    textAlign: "center",
    fontWeight: "600",
  },
};
