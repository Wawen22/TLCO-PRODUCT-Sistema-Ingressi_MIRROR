import React, { useCallback, useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { SharePointService } from "../services/sharepointService";

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;

interface PrivacyDoc {
  id: string;
  name: string;
  size: number;
  createdDateTime: string;
  webUrl: string;
  "@microsoft.graph.downloadUrl": string;
}

export const PrivacyManager: React.FC = () => {
  const { instance, accounts } = useMsal();
  const [docs, setDocs] = useState<PrivacyDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!accounts[0]) throw new Error("Sessione scaduta");
      const accessToken = await getAccessToken(instance, accounts[0]);
      
      const svc = new SharePointService(accessToken, siteId, visitatoriListId);
      const data = await svc.getPrivacyDocuments();
      setDocs(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Errore caricamento documenti");
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo documento?")) return;
    
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);
      const svc = new SharePointService(accessToken, siteId, visitatoriListId);
      await svc.deletePrivacyDocument(id);
      loadDocs();
    } catch (err: any) {
      alert("Errore eliminazione: " + err.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Carica solo file PDF");
      return;
    }

    setUploading(true);
    try {
      const accessToken = await getAccessToken(instance, accounts[0]);
      const svc = new SharePointService(accessToken, siteId, visitatoriListId);
      await svc.uploadPrivacyDocument(file);
      loadDocs();
    } catch (err: any) {
      alert("Errore upload: " + err.message);
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
        <button 
          className="btn-minimal" 
          onClick={loadDocs}
          disabled={loading}
        >
          🔄 Aggiorna
        </button>
        
        <div style={{ position: "relative" }}>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUpload}
            style={{ 
              position: "absolute", 
              opacity: 0, 
              width: "100%", 
              height: "100%", 
              cursor: "pointer",
              zIndex: 2
            }}
            disabled={uploading}
          />
          <button className="btn-minimal strong" disabled={uploading}>
            {uploading ? "Caricamento..." : "⬆️ Carica PDF"}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading && !docs.length ? (
        <div style={{ color: "#666", fontStyle: "italic" }}>Caricamento...</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {docs.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#666", background: "rgba(255,255,255,0.5)", borderRadius: "12px" }}>
              Nessun documento presente. Caricane uno per iniziare.
            </div>
          ) : (
            docs.map((doc) => (
              <div 
                key={doc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(15,23,42,0.06)",
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ 
                    width: "36px", height: "36px", 
                    background: "#ffecec", color: "#d83b3b",
                    borderRadius: "8px", display: "grid", placeItems: "center",
                    fontWeight: "bold", fontSize: "0.8rem"
                  }}>
                    PDF
                  </div>
                  <div>
                    <div style={{ fontWeight: "700", color: "#0f172a" }}>{doc.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                      {formatSize(doc.size)} • {new Date(doc.createdDateTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <a 
                    href={doc.webUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-minimal"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    👁️
                  </a>
                  <button 
                    className="btn-minimal"
                    style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
                    onClick={() => handleDelete(doc.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
