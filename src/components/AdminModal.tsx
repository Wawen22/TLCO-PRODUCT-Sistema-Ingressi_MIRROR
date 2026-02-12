import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken } from "../services/tokenService";
import { AccessiService } from "../services/accessiService";
import { VisitoriPresenti } from "./VisitoriPresenti";
import { StoricAccessi } from "./StoricAccessi";
import SharePointTest from "./SharePointTest";
import { PrivacyManager } from "./PrivacyManager";
import "./AdminModal.css";

interface AdminModalProps {
  onClose: () => void;
  authMode: "QR" | "EMAIL";
  setAuthMode: (mode: "QR" | "EMAIL") => void;
}

const siteId = import.meta.env.VITE_SHAREPOINT_SITE_ID;
const visitatoriListId = import.meta.env.VITE_SHAREPOINT_LIST_ID;
const accessiListId = import.meta.env.VITE_ACCESSI_LIST_ID;

/**
 * Modal Admin per accedere alle funzioni avanzate
 * Visibile solo per gli amministratori
 */
export const AdminModal = ({ onClose, authMode, setAuthMode }: AdminModalProps) => {
  const { instance, accounts } = useMsal();
  const [activeSection, setActiveSection] = useState<"presenti" | "storico" | "visitatori" | "impostazioni" | "privacy">("presenti");
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [stats, setStats] = useState({ presenti: 0, accessiOggi: 0, accessi7g: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const account = accounts[0];
  const adminName = account?.name || account?.username || "Amministratore";
  const adminEmail = account?.username || account?.idTokenClaims?.preferred_username || "";

  const adminInitials = useMemo(() => {
    if (!adminName) return "A";
    const parts = adminName.split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [adminName]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError("");
    try {
      if (!account) {
        throw new Error("Sessione non disponibile");
      }

      const accessToken = await getAccessToken(instance, account);

      const svc = new AccessiService(accessToken, siteId, accessiListId, visitatoriListId);
      const presenti = await svc.getVisitoriPresenti();
      const accessi = await svc.getAllAccessi(500);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const accessiOggi = accessi.filter((a: any) => {
        const ts = a.fields?.Timestamp || a.fields?.field_4;
        const azione = `${a.fields?.Azione ?? a.fields?.field_5 ?? ""}`.toLowerCase();
        if (!ts || azione !== "ingresso") return false;
        const d = new Date(ts);
        return d >= todayStart;
      }).length;

      const accessi7g = accessi.filter((a: any) => {
        const ts = a.fields?.Timestamp || a.fields?.field_4;
        const azione = `${a.fields?.Azione ?? a.fields?.field_5 ?? ""}`.toLowerCase();
        if (!ts || azione !== "ingresso") return false;
        const d = new Date(ts);
        return d >= sevenDaysAgo;
      }).length;

      setStats({ presenti: presenti.length, accessiOggi, accessi7g });
      setLastSync(new Date());
    } catch (error: any) {
      console.error("Errore caricamento snapshot admin:", error);
      setStatsError(error?.message || "Errore nel caricamento delle statistiche");
    } finally {
      setLoadingStats(false);
    }
  }, [account, instance]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefreshAll = useCallback(() => {
    loadStats();
    setRefreshKey((v) => v + 1);
  }, [loadStats]);

  return (
    <div className="admin-overlay">
      <div className="bg-grid" />
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="admin-shell">
        <aside className="admin-rail">
          <div className="rail-brand">
            <div className="rail-chip">Area riservata</div>
            <h2>Access control • Area riservata</h2>
            <div className="tag-row rail-tags">
              <span>Live monitor</span>
              <span>Audit ready</span>
              <span>SharePoint native</span>
            </div>
          </div>

          <div className="rail-profile glass-tile">
            <div className="profile-avatar">{adminInitials}</div>
            <div>
              <div className="profile-name">{adminName}</div>
              {adminEmail && <div className="profile-mail">{adminEmail}</div>}
            </div>
          </div>

          <div className="rail-meta">
            <div className="meta-block glass-tile">
              <div className="meta-label">Snapshot</div>
              <div className="meta-value">{lastSync ? lastSync.toLocaleTimeString("it-IT") : "In attesa..."}</div>
            </div>
            <div className="meta-block glass-tile">
              <div className="meta-label">Stato</div>
              <div className="meta-pill">{loadingStats ? "Aggiornamento" : "Pronto"}</div>
            </div>
          </div>

          <div className="rail-actions">
            <button className="btn btn-ghost" onClick={handleRefreshAll} disabled={loadingStats}>
              {loadingStats ? "Aggiorno..." : "Sync"}
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Chiudi area
            </button>
          </div>

          <div className="rail-nav">
            <div className="nav-title">Pannelli</div>
            <div className="nav-buttons">
              <NavButton
                active={activeSection === "presenti"}
                label="Presenze live"
                icon="👥"
                onClick={() => setActiveSection("presenti")}
              />
              <NavButton
                active={activeSection === "storico"}
                label="Storico & audit"
                icon="📊"
                onClick={() => setActiveSection("storico")}
              />
              <NavButton
                active={activeSection === "visitatori"}
                label="Visitatori iscritti"
                icon="📇"
                onClick={() => setActiveSection("visitatori")}
              />
              <NavButton
                active={activeSection === "privacy"}
                label="Documenti Privacy"
                icon="📄"
                onClick={() => setActiveSection("privacy")}
              />
              <NavButton
                active={activeSection === "impostazioni"}
                label="Impostazioni"
                icon="⚙️"
                onClick={() => setActiveSection("impostazioni")}
              />
            </div>
          </div>
        </aside>

        <main className="admin-main">
          {statsError && <div className="alert error">⚠️ {statsError}</div>}

          <div className="kpi-grid">
            <KpiCard label="Presenti ora" value={stats.presenti} hint="Live in sede" accent="cyan" />
            <KpiCard label="Accessi oggi" value={stats.accessiOggi} hint="Aggiornati al sync" accent="amber" />
            <KpiCard label="Ultimi 7 giorni" value={stats.accessi7g} hint="Ingressi registrati" accent="mint" />
            <KpiCard
              label="Snapshot"
              value={lastSync ? lastSync.toLocaleTimeString("it-IT") : "In attesa..."}
              hint={loadingStats ? "Aggiornamento" : "Allineato"}
              accent="slate"
            />
          </div>

          <div className="panel-shell glass-surface">
            <div className="tab-strip">
              <TabButton
                active={activeSection === "presenti"}
                label="Presenze live"
                icon="👥"
                onClick={() => setActiveSection("presenti")}
              />
              <TabButton
                active={activeSection === "storico"}
                label="Storico & audit"
                icon="📊"
                onClick={() => setActiveSection("storico")}
              />
              <TabButton
                active={activeSection === "visitatori"}
                label="Visitatori iscritti"
                icon="📇"
                onClick={() => setActiveSection("visitatori")}
              />
              <TabButton
                active={activeSection === "privacy"}
                label="Documenti Privacy"
                icon="📄"
                onClick={() => setActiveSection("privacy")}
              />
              <TabButton
                active={activeSection === "impostazioni"}
                label="Impostazioni"
                icon="⚙️"
                onClick={() => setActiveSection("impostazioni")}
              />
            </div>

            <div className="panel-stack">
              {activeSection === "presenti" && (
                <div className="panel glass-tile">
                  <SectionHeader
                    title="Visitatori presenti"
                    subtitle="Presenze live in sede, aggiornate in tempo reale."
                    metaLabel="Presenti ora"
                    metaValue={stats.presenti}
                  />
                  <VisitoriPresenti refreshKey={refreshKey} />
                </div>
              )}

              {activeSection === "storico" && (
                <div className="panel glass-tile">
                  <SectionHeader
                    title="Storico accessi"
                    subtitle="Ricerca, filtri e audit per i passaggi registrati."
                    metaLabel="Ultimi 7 giorni"
                    metaValue={stats.accessi7g}
                  />
                  <StoricAccessi refreshKey={refreshKey} />
                </div>
              )}

              {activeSection === "visitatori" && (
                <div className="panel glass-tile">
                  <SectionHeader
                    title="Visitatori iscritti"
                    subtitle="Elenco SharePoint con filtri per nome, email e azienda."
                  />
                  <SharePointTest refreshKey={refreshKey} />
                </div>
              )}

              {activeSection === "privacy" && (
                <div className="panel glass-tile">
                  <SectionHeader
                    title="Gestione Documenti Privacy"
                    subtitle="Gestisci i PDF delle informative mostrate durante l'onboarding."
                  />
                  <PrivacyManager />
                </div>
              )}

              {activeSection === "impostazioni" && (
                <div className="panel glass-tile">
                  <SectionHeader
                    title="Impostazioni Kiosk"
                    subtitle="Configura il comportamento del totem."
                  />
                  <div style={{ padding: "20px" }}>
                    <h3>Modalità di Autenticazione</h3>
                    <div style={{ display: "flex", gap: "20px", marginTop: "10px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="authMode" 
                          value="QR" 
                          checked={authMode === "QR"} 
                          onChange={() => setAuthMode("QR")} 
                        />
                        <span>QR Code (Standard)</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="authMode" 
                          value="EMAIL" 
                          checked={authMode === "EMAIL"} 
                          onChange={() => setAuthMode("EMAIL")} 
                        />
                        <span>Email + Codice OTP</span>
                      </label>
                    </div>
                    <p style={{ marginTop: "10px", opacity: 0.7, fontSize: "0.9em" }}>
                      Seleziona la modalità che i visitatori useranno per registrare ingresso e uscita.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const SectionHeader = ({
  title,
  subtitle,
  metaLabel,
  metaValue,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  title: string;
  subtitle: string;
  metaLabel?: string;
  metaValue?: string | number;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) => (
  <div className="section-header">
    <div>
      <div className="section-title">{title}</div>
      <div className="section-subtitle">{subtitle}</div>
    </div>
    <div className="section-actions">
      {metaLabel !== undefined && metaValue !== undefined && (
        <div className="section-meta">
          <span className="meta-label">{metaLabel}</span>
          <span className="meta-value">{metaValue}</span>
        </div>
      )}
      {actionLabel && onAction && (
        <button className="btn-minimal" onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </button>
      )}
    </div>
  </div>
);

const TabButton = ({ label, active, icon, onClick }: { label: string; active: boolean; icon?: string; onClick: () => void }) => (
  <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
    {icon && <span className="tab-icon">{icon}</span>}
    <span>{label}</span>
  </button>
);

const NavButton = ({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: string;
  onClick: () => void;
}) => (
  <button className={`nav-btn ${active ? "active" : ""}`} onClick={onClick}>
    <span className="nav-icon">{icon}</span>
    <span>{label}</span>
  </button>
);

const KpiCard = ({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent: "cyan" | "amber" | "mint" | "slate";
}) => (
  <div className={`kpi-card glass-tile accent-${accent}`}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {hint && <div className="kpi-hint">{hint}</div>}
  </div>
);
