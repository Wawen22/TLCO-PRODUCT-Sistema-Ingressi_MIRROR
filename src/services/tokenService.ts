import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../config/authConfig";

/**
 * Servizio centralizzato per la gestione dei token MSAL.
 *
 * Problema risolto:
 * Le SPA (Single Page Application) ricevono un Refresh Token con durata massima
 * fissa di 24 ore (sliding window). Se il token non viene rinnovato entro quel
 * periodo (es. kiosk inattivo di notte), il refresh token scade e
 * acquireTokenSilent fallisce con InteractionRequiredAuthError.
 *
 * Soluzione:
 * 1. Rinnovo proattivo ogni 30 minuti (mantiene vivo il refresh token)
 * 2. Fallback automatico a redirect login (trasparente grazie alla sessione
 *    persistente configurata in Conditional Access)
 * 3. Funzione centralizzata getAccessToken() usata da tutti i componenti
 */

// Intervallo di rinnovo proattivo (30 minuti)
const RENEWAL_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Acquisisce un access token in modo sicuro.
 * Se il rinnovo silenzioso fallisce, effettua redirect al login.
 * Grazie alla sessione persistente di Azure AD, il redirect è trasparente
 * (l'utente non deve reinserire le credenziali).
 */
export async function getAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
  forceRefresh = false
): Promise<string> {
  try {
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account,
      forceRefresh,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      console.warn(
        "[TokenService] Rinnovo silenzioso fallito — redirect al login...",
        error.errorCode
      );
      // Il redirect è trasparente se la sessione Azure AD è ancora attiva
      // (Conditional Access: persistent browser session = always persistent)
      await instance.acquireTokenRedirect(loginRequest);
      // La riga seguente non verrà mai raggiunta (la pagina fa redirect)
      throw error;
    }
    throw error;
  }
}

/**
 * Avvia il rinnovo proattivo dei token.
 *
 * Ogni 30 minuti chiama acquireTokenSilent con forceRefresh=true per:
 * - Ottenere un nuovo access token dal server (bypassa la cache)
 * - Ottenere un nuovo refresh token con finestra di 24h fresca
 * - Prevenire la scadenza del refresh token durante periodi di inattività
 *
 * Restituisce una funzione di cleanup per fermare l'intervallo.
 */
export function startProactiveTokenRenewal(
  instance: IPublicClientApplication
): () => void {
  console.info(
    `[TokenService] Rinnovo proattivo avviato (ogni ${RENEWAL_INTERVAL_MS / 60000} min)`
  );

  const intervalId = setInterval(async () => {
    const account = instance.getActiveAccount();
    if (!account) {
      console.warn("[TokenService] Nessun account attivo, skip rinnovo");
      return;
    }

    try {
      // forceRefresh=true forza una chiamata al server anche se l'AT in cache
      // è ancora valido, così da ottenere un nuovo RT con finestra fresca
      await getAccessToken(instance, account, true);
      console.info("[TokenService] ✅ Rinnovo proattivo completato");
    } catch (err) {
      // Se fallisce, getAccessToken avrà già gestito il redirect
      console.error("[TokenService] ❌ Rinnovo proattivo fallito:", err);
    }
  }, RENEWAL_INTERVAL_MS);

  // Rinnovo immediato all'avvio per validare lo stato corrente
  const account = instance.getActiveAccount();
  if (account) {
    getAccessToken(instance, account, false).catch(() => {
      // Errore gestito internamente da getAccessToken
    });
  }

  return () => {
    console.info("[TokenService] Rinnovo proattivo fermato");
    clearInterval(intervalId);
  };
}
