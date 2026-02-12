import { useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { AccessiService } from "../services/accessiService";

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const siteUrl = import.meta.env.VITE_SHAREPOINT_SITE_URL;

type TargetList = "accessi" | "visitatori";

/**
 * Setup compatto per recuperare e validare gli ID delle liste SharePoint (Accessi / Visitatori)
 */
export const AccessiSetup = () => {
  const { instance, accounts } = useMsal();
  const [loading, setLoading] = useState<TargetList | "both" | null>(null);
  const [error, setError] = useState<string>("");
  const [listIds, setListIds] = useState<{ accessi?: string; visitatori?: string }>({});

  const envHints = useMemo(
    () => ({
      accessi: import.meta.env.VITE_ACCESSI_LIST_ID,
      visitatori: import.meta.env.VITE_SHAREPOINT_LIST_ID,
    }),
    []
  );

  const fetchListId = async (target: TargetList) => {
    setLoading(target);
    setError("");

    try {
      const accessToken = await getAccessToken(instance, accounts[0]);

      const name = target === "accessi" ? "Accessi" : "Visitatori";
      const id = await AccessiService.getListIdByName(accessToken, siteId, name);

      if (!id) {
        throw new Error(`Lista "${name}" non trovata nel sito indicato.`);
      }

      setListIds((prev) => ({ ...prev, [target]: id }));
    } catch (err: any) {
      console.error("❌ Errore lookup lista:", err);
      setError(err?.message || "Errore nel recupero degli ID lista");
    } finally {
      setLoading(null);
    }
  };

  const fetchBoth = async () => {
    setLoading("both");
    setError("");
    try {
      await fetchListId("accessi");
      await fetchListId("visitatori");
    } finally {
      setLoading(null);
    }
  };

  const renderIdCard = (label: string, target: TargetList, emoji: string) => {
    const value = listIds[target] || envHints[target] || "—";
    const isLoading = loading === target || loading === "both";

    return (
      <div style={styles.idCard}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>{emoji} {label}</div>
          <button style={styles.linkButton} onClick={() => fetchListId(target)} disabled={isLoading}>
            {isLoading ? "⏳" : "🔄"} Aggiorna ID
          </button>
        </div>
        <div style={styles.codeRow}>
          <code style={styles.code}>{value}</code>
        </div>
        <div style={styles.cardHint}>
          Env attuale: <span style={styles.mono}>{target === "accessi" ? "VITE_ACCESSI_LIST_ID" : "VITE_SHAREPOINT_LIST_ID"}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <div />
        <div style={styles.actions}>
          <a href={siteUrl} target="_blank" rel="noreferrer" style={styles.secondaryButton}>
            🌐 Apri sito
          </a>
          <button style={styles.primaryButton} onClick={fetchBoth} disabled={loading !== null}>
            {loading ? "⏳" : "🚀"} Allinea entrambi
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.grid}>
        {renderIdCard("Lista Accessi", "accessi", "📋")}
        {renderIdCard("Lista Visitatori", "visitatori", "🙋")}
      </div>

      <div style={styles.tipCard}>
        <div style={styles.tipTitle}>Come usare gli ID</div>
        <ul style={styles.tipList}>
          <li>Incolla i valori in <code style={styles.inlineCode}>.env.local</code> e riavvia Vite.</li>
          <li>Se un ID manca, verifica di aver creato le liste con i nomi corretti (Accessi, Visitatori).</li>
          <li>Puoi rilanciare la query quando cambi tenant o sito.</li>
        </ul>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  eyebrow: {
    fontSize: "0.9rem",
    color: "#5b6b7a",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  title: {
    margin: "6px 0 4px",
    fontSize: "1.3rem",
    color: "#0f1f3a",
  },
  subtitle: {
    margin: 0,
    color: "#4a5a70",
    fontSize: "0.98rem",
  },
  actions: {
    display: "flex",
    gap: "8px",
  },
  primaryButton: {
    background: "linear-gradient(135deg, #0f5dbb 0%, #0a478f 100%)",
    color: "white",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(15,93,187,0.18)",
  },
  secondaryButton: {
    background: "#eef3fb",
    color: "#0f3a6a",
    border: "1px solid #d5e2f3",
    borderRadius: "10px",
    padding: "10px 12px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  },
  idCard: {
    border: "1px solid #dbe5f2",
    borderRadius: "12px",
    padding: "12px",
    background: "white",
    boxShadow: "0 10px 24px rgba(15,45,90,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
  },
  cardTitle: {
    fontWeight: 800,
    color: "#0f1f3a",
  },
  linkButton: {
    background: "#f1f5fb",
    border: "1px solid #d8e3f3",
    color: "#0f3a6a",
    borderRadius: "10px",
    padding: "8px 10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  codeRow: {
    background: "#0f1f3a",
    color: "#e6edff",
    borderRadius: "10px",
    padding: "10px",
    fontFamily: "Consolas, monospace",
    fontSize: "0.92rem",
    wordBreak: "break-all",
  },
  code: {
    letterSpacing: "0.02em",
  },
  cardHint: {
    fontSize: "0.9rem",
    color: "#4a5a70",
  },
  mono: {
    fontFamily: "Consolas, monospace",
    color: "#0f3a6a",
    fontWeight: 700,
  },
  tipCard: {
    border: "1px solid #d5e2f3",
    borderRadius: "12px",
    padding: "12px",
    background: "#f8fbff",
  },
  tipTitle: {
    fontWeight: 800,
    color: "#0f1f3a",
    marginBottom: "6px",
  },
  tipList: {
    margin: 0,
    paddingLeft: "18px",
    color: "#3f4f64",
    display: "grid",
    gap: "4px",
    fontWeight: 600,
  },
  inlineCode: {
    background: "#e7eefb",
    padding: "2px 6px",
    borderRadius: "6px",
    fontFamily: "Consolas, monospace",
  },
  error: {
    border: "1px solid #e55b63",
    background: "#fff0f2",
    color: "#a01928",
    padding: "10px",
    borderRadius: "10px",
    fontWeight: 700,
  },
};
