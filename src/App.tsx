import { useState, useEffect } from "react";
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "./config/authConfig";
import Login from "./components/Login";
import { KioskMain } from "./components/KioskMain";
import { AdminModal } from "./components/AdminModal";
import { SettingsService } from "./services/settingsService";
import "./App.css";

// Inizializza MSAL
const msalInstance = new PublicClientApplication(msalConfig);

// Gestisci il redirect dopo il login
msalInstance.initialize().then(() => {
  // Account selection logic is app dependent. Adjust as needed for different use cases.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as any;
      const account = payload.account;
      msalInstance.setActiveAccount(account);
    }
  });

  msalInstance.handleRedirectPromise().catch((error) => {
    console.error("❌ Errore durante la gestione del redirect:", error);
  });
});

function AppContent() {
  const { accounts, instance } = useMsal();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [, setLoadingSettings] = useState(false);
  
  // Gestione modalità di autenticazione (QR o Email)
  const [authMode, setAuthMode] = useState<"QR" | "EMAIL">("QR");

  useEffect(() => {
    const loadSettings = async () => {
      if (accounts.length > 0) {
        setLoadingSettings(true);
        try {
          const response = await instance.acquireTokenSilent({
            ...loginRequest,
            account: accounts[0],
          });
          
          const settingsListId = import.meta.env.VITE_SETTINGS_LIST_ID;
          if (!settingsListId) {
            console.warn("VITE_SETTINGS_LIST_ID non configurato");
            return;
          }

          const settingsService = new SettingsService(
            response.accessToken,
            import.meta.env.VITE_SHAREPOINT_SITE_ID,
            settingsListId
          );
          
          const mode = await settingsService.getSetting("AuthMode");
          if (mode === "QR" || mode === "EMAIL") {
            setAuthMode(mode);
            localStorage.setItem("kiosk_auth_mode", mode); // Sync local storage
          } else {
            const fallback = localStorage.getItem("kiosk_auth_mode");
            if (fallback === "QR" || fallback === "EMAIL") {
              setAuthMode(fallback);
            }
          }
        } catch (error) {
          console.error("Errore caricamento impostazioni:", error);
          const fallback = localStorage.getItem("kiosk_auth_mode");
          if (fallback === "QR" || fallback === "EMAIL") {
            setAuthMode(fallback);
          }
        } finally {
          setLoadingSettings(false);
        }
      }
    };
    loadSettings();
  }, [accounts, instance]);

  const handleSetAuthMode = async (mode: "QR" | "EMAIL") => {
    const previousMode = authMode;
    // Optimistic update
    setAuthMode(mode);

    if (accounts.length > 0) {
      try {
        const response = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        
        const settingsListId = import.meta.env.VITE_SETTINGS_LIST_ID;
        if (settingsListId) {
          const settingsService = new SettingsService(
            response.accessToken,
            import.meta.env.VITE_SHAREPOINT_SITE_ID,
            settingsListId
          );
          await settingsService.updateSetting("AuthMode", mode);
          const confirmed = await settingsService.getSetting("AuthMode");
          if (confirmed === "QR" || confirmed === "EMAIL") {
            setAuthMode(confirmed);
            localStorage.setItem("kiosk_auth_mode", confirmed);
          }
        }
      } catch (error) {
        console.error("Errore salvataggio impostazione AuthMode:", error);
        // Revert in caso di errore, per evitare cache locale divergente
        setAuthMode(previousMode);
        localStorage.setItem("kiosk_auth_mode", previousMode);
      }
    } else {
      localStorage.setItem("kiosk_auth_mode", mode);
    }
  };

  const account = accounts[0];
  const claims = (account?.idTokenClaims || {}) as any;
  const roles: string[] = Array.isArray(claims?.roles) ? claims.roles : [];
  const groups: string[] = Array.isArray(claims?.groups) ? claims.groups : [];
  const username = (claims?.preferred_username || account?.username || "").toLowerCase();

  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  const adminGroupIds = (import.meta.env.VITE_ADMIN_GROUP_IDS || "")
    .split(",")
    .map((g: string) => g.trim())
    .filter(Boolean);
  const adminRoleKeys = [
    "accessadmin",
    "accessi.admin",
    "accessi-admin",
    "admin",
    "totem admin",
    "totem-admin",
    "totem.admin",
  ];
  const normalizedRoles = roles.map((r: string) => r.toLowerCase().trim());
  const normalizedGroups = groups.map((g: string) => g.toLowerCase().trim());
  const normalizedAdminGroups = adminGroupIds.map((g: string) => g.toLowerCase().trim());

  const isAdmin = Boolean(
    normalizedRoles.some((r) => adminRoleKeys.includes(r)) ||
      normalizedGroups.some((g) => normalizedAdminGroups.includes(g)) ||
      (username && adminEmails.includes(username))
  );

  // Debug essenziale per verificare l'autorizzazione
  console.info("[Auth debug] username", username);
  console.info("[Auth debug] roles", roles);
  console.info("[Auth debug] isAdmin", isAdmin);

  const handleAdminAccess = () => {
    if (!isAdmin) return;
    setShowAdminModal(true);
  };

  return (
    <div style={{ margin: 0, padding: 0, height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <AuthenticatedTemplate>
        <KioskMain 
          onAdminAccess={handleAdminAccess} 
          canAccessAdmin={isAdmin} 
          authMode={authMode}
        />
        {showAdminModal && isAdmin && (
          <AdminModal 
            onClose={() => setShowAdminModal(false)} 
            authMode={authMode}
            setAuthMode={handleSetAuthMode}
          />
        )}
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <Login />
      </UnauthenticatedTemplate>
    </div>
  );
}

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}

export default App;
