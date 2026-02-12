# 🚀 AI Project Blueprint: Serverless Microsoft 365 SPA


**Obiettivo:** Creare una Single Page Application (SPA) moderna, professionale e "Serverless" che utilizzi l'ecosistema Microsoft 365 come backend (Identity, Database, Logic).

---

## 1. 🏗️ Architettura Tecnica (Zero Backend)

L'applicazione non deve avere un backend proprietario (Node.js, .NET, Python). Deve appoggiarsi interamente ai servizi Microsoft Cloud tramite API.

### Stack Tecnologico Richiesto
*   **Frontend Framework:** React 19+ (con TypeScript).
*   **Build Tool:** Vite.
*   **Autenticazione:** Microsoft Entra ID (Azure AD) tramite `@azure/msal-react` e `@azure/msal-browser`.
*   **Database / Storage:** SharePoint Online Lists (utilizzate come database NoSQL) accessibili via **Microsoft Graph API**.
*   **API Client:** `@microsoft/microsoft-graph-client` per tutte le operazioni CRUD.
*   **Styling:** CSS Modules o Tailwind CSS (Design System pulito, aziendale, minimalista).
*   **Routing:** React Router DOM.

### Flusso dei Dati
1.  **Login:** L'utente si autentica con il proprio account Microsoft 365 (Popup o Redirect).
2.  **Token:** L'app ottiene un Access Token con permessi delegati (`Sites.ReadWrite.All`).
3.  **Operazioni:** Il client React chiama direttamente Microsoft Graph (`https://graph.microsoft.com/v1.0/...`) per leggere/scrivere sulle liste SharePoint.

---

## 2. 🎨 UI/UX Guidelines (Modern & Professional)

L'interfaccia deve essere **Elegante, Pulita e Responsive**.

*   **Layout:** Utilizzare un layout "Kiosk" o "Dashboard" a seconda del caso d'uso.
*   **Color Palette:** Colori aziendali sobri (Blu Microsoft, Grigio Ardesia, Bianco, accenti sottili). Evitare colori neon o contrasti eccessivi.
*   **Tipografia:** Font sans-serif moderni (es. Inter, Segoe UI, Roboto).
*   **Componenti:**
    *   Card con ombreggiature morbide (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)`).
    *   Input fields con bordi arrotondati e focus ring visibile.
    *   Modali per le azioni di conferma.
    *   Loader/Spinner eleganti durante le chiamate asincrone.
    *   Feedback visivo immediato (Toast notifications per success/error).

---

## 3. 🛠️ Configurazione Microsoft 365 (Prerequisiti)

Per far funzionare l'applicazione, è necessario configurare il tenant Microsoft come segue.

### A. Microsoft Entra ID (App Registration)
1.  Andare su [portal.azure.com](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations**.
2.  **Nuova registrazione**:
    *   **Nome:** `[Nome App] (SPA)`
    *   **Supported account types:** "Accounts in this organizational directory only (Single tenant)".
    *   **Redirect URI:** Selezionare **Single-page application (SPA)** e inserire `http://localhost:5173` (per dev) e l'URL di produzione.
3.  **API Permissions**:
    *   Aggiungere permessi **Microsoft Graph** > **Delegated permissions**.
    *   Selezionare:
        *   `User.Read` (per leggere il profilo utente).
        *   `Sites.ReadWrite.All` (per leggere/scrivere sulle liste SharePoint).
        *   `People.Read` (opzionale, per cercare utenti).
    *   **Importante:** Cliccare su "Grant admin consent" se necessario per l'organizzazione.
4.  Copiare il **Application (client) ID** e il **Directory (tenant) ID**.

### B. SharePoint Online (Database Setup)
1.  Creare un nuovo **Sito del Team** (o usarne uno esistente).
2.  Creare le **Liste** necessarie (es. `Visitatori`, `Prodotti`, `Ticket`).
3.  Per ogni lista, definire le colonne.
    *   *Nota:* Annotare il `Site ID` e il `List ID` (si possono ottenere via Graph Explorer chiamando `GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-path}`).

---

## 4. 💻 Struttura del Codice (Best Practices)

L'agente AI deve generare il codice seguendo questa struttura modulare:

```text
src/
├── auth/
│   └── authConfig.ts       # Configurazione MSAL (ClientId, Authority, Scopes)
├── components/
│   ├── common/             # Componenti riutilizzabili (Button, Input, Modal)
│   ├── layout/             # Layout principale (Header, Sidebar)
│   └── features/           # Componenti specifici delle feature
├── services/
│   ├── graphClient.ts      # Singleton per inizializzare il client Graph
│   └── dataService.ts      # Servizio specifico per le chiamate SharePoint (CRUD)
├── types/
│   └── models.ts           # Interfacce TypeScript per i dati SharePoint
├── hooks/
│   └── useGraph.ts         # Custom hook per gestire loading/error states
├── App.tsx                 # Routing e Auth Wrapper (MsalProvider)
└── main.tsx                # Entry point
```

### Esempio di Configurazione Auth (`authConfig.ts`)
```typescript
import { Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
    auth: {
        clientId: import.meta.env.VITE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
        redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "localStorage" }
};

export const loginRequest = {
    scopes: ["User.Read", "Sites.ReadWrite.All"]
};
```

### Esempio di Service Pattern (`dataService.ts`)
Il servizio deve accettare il token o il client inizializzato e gestire le chiamate.
```typescript
// Esempio di metodo per creare un item
async createItem(item: MyModel) {
    return await graphClient
        .api(`/sites/${SITE_ID}/lists/${LIST_ID}/items`)
        .post({ fields: item });
}
```

---

## 5. 📝 Prompt per l'Agente AI

*Copia e incolla questo prompt per generare il progetto:*

> "Agente, agisci come un Senior React Developer esperto in ecosistema Microsoft 365.
>
> Voglio che tu crei una **Single Page Application (SPA)** con **React 19, TypeScript e Vite**.
> L'applicazione deve gestire [DESCRIZIONE DELLO SCOPO DELL'APP, es: un registro visitatori].
>
> **Requisiti Architetturali:**
> 1.  **Zero Backend:** Usa **SharePoint Online** come database.
> 2.  **Auth:** Usa **MSAL React** per autenticare gli utenti su Microsoft Entra ID.
> 3.  **Data Layer:** Usa **Microsoft Graph SDK** per leggere e scrivere items nelle liste SharePoint.
> 4.  **UI/UX:** Usa uno stile moderno, pulito e professionale (CSS Modules o Tailwind). Deve sembrare un prodotto Enterprise.
>
> **Configurazione:**
> - Predisponi un file `.env` per `VITE_CLIENT_ID`, `VITE_TENANT_ID`, `VITE_SITE_ID`, `VITE_LIST_ID`.
> - Crea un servizio `sharepointService.ts` che incapsula la logica Graph.
> - Gestisci correttamente il token di accesso (AcquireTokenSilent).
>
> **Funzionalità richieste:**
> - Login/Logout Microsoft.
> - Visualizzazione dati in una griglia/lista elegante.
> - Form per aggiungere nuovi dati (con validazione).
> - Gestione errori (es. permessi mancanti).
>
> Genera la struttura del progetto e i file chiave seguendo queste specifiche."
