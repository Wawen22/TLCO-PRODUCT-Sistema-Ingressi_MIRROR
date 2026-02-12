import type { Configuration, PopupRequest } from "@azure/msal-browser";

/**
 * Configurazione MSAL per l'autenticazione Microsoft
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI,
  },
  cache: {
    cacheLocation: "localStorage", // persiste tra riavvii del browser
    storeAuthStateInCookie: true, // abilita cookie per supporto iframe SSO cross-browser
  },
  system: {
    // Rinnova il token 5 minuti prima della scadenza effettiva
    // per evitare chiamate API con token prossimi alla scadenza
    tokenRenewalOffsetSeconds: 300,
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // Error
            console.error(message);
            return;
          case 1: // Warning
            console.warn(message);
            return;
          case 2: // Info
            console.info(message);
            return;
          case 3: // Verbose
            console.debug(message);
            return;
        }
      },
    },
  },
};

/**
 * Scopes richiesti per il login
 */
export const loginRequest: PopupRequest = {
  scopes: ["User.Read", "Sites.ReadWrite.All"],
};

/**
 * Configurazione endpoint Microsoft Graph
 */
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
  graphApiEndpoint: "https://graph.microsoft.com/v1.0",
};
