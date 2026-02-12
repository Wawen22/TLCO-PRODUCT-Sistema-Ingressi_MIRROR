
# 🏢 ALFA ENGINEERING - Kiosk Visitatori (POC)

  

![React](https://img.shields.io/badge/React-18-blue?logo=react)

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)

![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)

![Microsoft Graph](https://img.shields.io/badge/Microsoft_Graph-v3-blue?logo=microsoft)

![SharePoint](https://img.shields.io/badge/SharePoint-Online-teal?logo=microsoftsharepoint)

  

**Totem web moderno per la gestione visitatori**: registrazione self-service, invio QR code via email, e controllo accessi tramite scansione QR. Progettato per l'integrazione nativa con l'ecosistema Microsoft 365.

  

---

  

## ✨ Funzionalità Principali

  

| Funzionalità | Descrizione |

|--------------|-------------|

| **📝 Onboarding Self-Service** | Registrazione visitatori autonoma con generazione immediata di ID univoco (`VIS-...`). |

| **📧 Invio QR Code** | Integrazione con Power Automate per invio (e reinvio) del QR code via email. |

| **🔑 Auth Email + OTP** | Modalità alternativa al QR: il visitatore inserisce l'email, riceve un codice OTP e accede. |

| **📷 Scanner Integrato** | Check-in e Check-out rapidi tramite fotocamera del dispositivo. |

| **🧭 Destinazione ingresso** | Dopo il check-in viene chiesto il percorso di destinazione; il valore è salvato nella colonna `PercorsoDestinazione` della lista Accessi. |

| **📄 Informativa Privacy** | Visualizzazione PDF in modale "Informativa sulla privacy" per presa visione e consenso (documenti caricati da SharePoint). |

| **🌐 Localizzazione** | Libreria i18n integrata (it/en di default) con testi centralizzati in `src/i18n.ts`. |

| **⚙️ Configurazione Centralizzata** | Gestione remota delle impostazioni (es. modalità Auth) tramite lista SharePoint. |

| **🔐 Area Amministrazione** | Dashboard protetta per monitorare presenze live, storico accessi e anagrafica. |

| **🛡️ Sicurezza Enterprise** | Autenticazione tramite Microsoft Entra ID (Azure AD) e permessi granulari. |

  

---

  

## 🛠️ Tech Stack

  

-  **Frontend**: React 18, TypeScript, Vite

-  **Auth**: MSAL (Microsoft Authentication Library)

-  **Data**: SharePoint Online (Liste)

-  **API**: Microsoft Graph

-  **Automation**: Power Automate (Logic Apps)

-  **Hardware**: Supporto per fotocamere/webcam standard (via `qr-scanner`)

  

---

  

## 🚀 Quick Start

  

### Prerequisiti

- Node.js 18+

- Tenant Microsoft 365 con permessi di amministrazione (per il setup iniziale)

  

### Installazione

  

```bash

# Clona il repository

git  clone  <repo-url>

  

# Installa le dipendenze

npm  install

  

# Avvia in modalità sviluppo

npm  run  dev

```

  

L'applicazione sarà disponibile su `http://localhost:5173`.

  

---

  

## ⚙️ Configurazione

  

Crea un file `.env.local` nella root del progetto basandoti su questo template:

  

```env

# --- Microsoft Entra ID (Auth) ---

VITE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

VITE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

VITE_REDIRECT_URI=http://localhost:5173

  

# --- SharePoint (Data) ---

# Formato: hostname,siteId,webId

VITE_SHAREPOINT_SITE_ID=tenant.sharepoint.com,xxxx-xxxx,yyyy-yyyy

VITE_SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/NomeSito

VITE_SHAREPOINT_LIST_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx # GUID Lista Visitatori

VITE_ACCESSI_LIST_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx # GUID Lista Accessi

VITE_SETTINGS_LIST_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx # GUID Lista Impostazioni

  

# --- Power Automate (Email) ---

VITE_PA_SEND_QR_URL=https://prod-xx.region.logic.azure.com:443/workflows/...

  

# --- Admin (Opzionale) ---

# Whitelist manuale per accesso admin (oltre al ruolo 'Totem.Admin')

VITE_ADMIN_EMAILS=admin@azienda.com,it@azienda.com

VITE_ADMIN_GROUP_IDS=group-guid-1,group-guid-2

```

  

> 💡 **Nota**: Per una guida dettagliata al deploy su un nuovo tenant, consulta [docs/DEPLOY_MULTI_TENANT.md](docs/DEPLOY_MULTI_TENANT.md).

  

---

  

## 🗄️ Schema Dati (SharePoint)

  

### 👤 Lista: Visitatori

| Colonna | Tipo | Note |

|---------|------|------|

| `Title` | Text | **ID Visitatore** (es. VIS-123456) |

| `Nome` | Text | |

| `Cognome` | Text | |

| `Email` | Text | |

| `Azienda` | Text | |

| `Stato` | Choice | `Attivo`, `Non Attivo` |

| `Categoria` | Choice | `VISITATORE`, `ISPETTORE`, `CONSULENTE`, `FORNITORE` |

  

### ⚙️ Lista: Impostazioni

| Colonna | Tipo | Note |

|---------|------|------|

| `Title` | Text | **Chiave** (es. `AuthMode`) |

| `Valore` | Text | Valore impostazione (es. `QR` o `EMAIL`) |

| `Descrizione` | Text | (Opzionale) Descrizione del parametro |

  

### 🚪 Lista: Accessi

| Colonna | Tipo | Note |

|---------|------|------|

| `Title` | Text | **ID Accesso** |

| `VisitoreID` | Lookup | Punta a `Visitatori.Title` |

| `Timestamp` | DateTime | Data e ora scansione |

| `Azione` | Choice | `Ingresso`, `Uscita` |

| `PuntoAccesso` | Choice | Es. `Reception`, `Ingresso Principale` |

| `PercorsoDestinazione` | Text | Percorso scelto dopo il check-in (nuova colonna) |

| `Note` | Note | Opzionale |

  

---

  

## ⚡ Automazione (Power Automate)

  

Il sistema utilizza un flow Power Automate con trigger HTTP per gestire le comunicazioni.

  

**Payload JSON atteso:**

```json

{

"action": "send | resend | otp | otpsms",

"idVisitatore": "VIS-...",

"qrCode": "VIS-...",

"email": "user@example.com",

"telefono": "+39 333 123 4567",

"nome": "Mario",

"cognome": "Rossi",

"..." : "..."

}

```


  

---

  

## 📂 Struttura Progetto

  

```

src/

├── 🧩 components/

│ ├── KioskMain.tsx # Core UI: Scanner e Onboarding

│ ├── AdminModal.tsx # Dashboard Amministratore

│ ├── Login.tsx # Pagina di Login MSAL

│ └── ...

├── 🔌 services/

│ ├── accessiService.ts # API SharePoint (Accessi)

│ └── sharepointService.ts # API SharePoint (Visitatori)

├── ⚙️ config/

│ └── authConfig.ts # Configurazione MSAL

└── 📝 types/

└── accessi.types.ts # Definizioni TypeScript

```

  

---

  

## 🧪 Test e Validazione

  

1.  **Onboarding**: Registra un utente → Verifica creazione riga in SharePoint e ricezione email.

2.  **Reinvio**: Richiedi QR per email esistente → Verifica ricezione email senza duplicati in DB.

3.  **Accesso**: Scansiona QR → Verifica creazione riga in `Accessi`.

4.  **Destinazione**: Dopo l'ingresso, scegli una destinazione → Verifica salvataggio in `PercorsoDestinazione`.

5.  **Privacy**: Apri la modale privacy, visualizza un PDF e conferma la presa visione.

6.  **Admin**: Accedi con utente `Totem.Admin` → Verifica visualizzazione dashboard.

  

---

  

## 📦 Comandi Utili

  

| Comando | Descrizione |

|---------|-------------|

| `npm run dev` | Avvia server di sviluppo |

| `npm run build` | Compila per produzione (`dist/`) |

| `npm run preview` | Anteprima locale della build |

| `npm run lint` | Controllo qualità codice |

  

---

  

> **Documentazione Deploy**: [Vai alla guida completa](docs/DEPLOY_MULTI_TENANT.md)
