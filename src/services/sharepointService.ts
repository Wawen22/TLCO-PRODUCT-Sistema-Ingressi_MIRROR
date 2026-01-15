import { Client, ResponseType } from "@microsoft/microsoft-graph-client";

/**
 * Interfaccia per i dati del visitatore
 * NOTA: Title è stato rinominato in IDVisitatore nella lista SharePoint
 */
export interface Visitatore {
  Title: string; // Questo è l'IDVisitatore (campo rinominato)
  Nome?: string;
  Cognome?: string;
  Email?: string;
  Azienda?: string;
  Stato?: string; // "Attivo" | "Non Attivo"
  Categoria?: string;
  EnteRiferimento?: string;
  Progetto?: string;
  Commessa?: string;
  Attivita?: string;
  VideoTutorialVisto?: boolean; // Flag Yes/No per tutorial sicurezza
}

/**
 * Service per la gestione dei visitatori su SharePoint
 */
export class SharePointService {
  private graphClient: Client;
  private siteId: string;
  private listId: string;
  private columnMap: Record<string, string> | null = null;
  private columnMapLoaded = false;
  private columnDetails: Record<string, any> = {};

  constructor(accessToken: string, siteId: string, listId: string) {
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
    this.siteId = siteId;
    this.listId = listId;
  }

  /**
   * Forza il ricaricamento della cache delle colonne.
   * Utile per debug o quando la struttura della lista è cambiata.
   */
  resetColumnCache() {
    this.columnMap = null;
    this.columnMapLoaded = false;
    this.columnDetails = {};
    console.info("🔄 [resetColumnCache] Cache colonne resettata");
  }

  /**
   * Test di creazione item minimale - solo Title.
   * Utile per verificare se il problema è nella struttura della lista o nei campi.
   */
  async testCreateMinimalItem(): Promise<any> {
    const testId = `TEST-${Date.now()}`;
    console.info("🧪 [testCreateMinimalItem] Tentativo creazione item minimale con solo Title:", testId);
    
    try {
      const result = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items`)
        .post({
          fields: {
            Title: testId,
          },
        });
      
      console.log("✅ [testCreateMinimalItem] Item minimale creato con successo:", result);
      return result;
    } catch (error: any) {
      console.error("❌ [testCreateMinimalItem] Errore creazione item minimale:", error);
      if (error.body) {
        try {
          console.error("Error body:", JSON.parse(error.body));
        } catch {
          console.error("Error body (raw):", error.body);
        }
      }
      throw error;
    }
  }

  /**
   * Crea un nuovo visitatore nella lista SharePoint
   * 
   * WORKAROUND: I campi Choice con nomi interni field_* non funzionano nel POST.
   * Creiamo prima l'item con i campi testo, poi facciamo PATCH per i Choice.
   */
  async createVisitatore(visitatore: Visitatore) {
    try {
      // Reset cache per forzare ricaricamento colonne fresche
      this.resetColumnCache();
      
      // Step 1: Carica la mappa delle colonne
      const columnMap = await this.ensureColumnMap();
      
      // Genera un ID univoco se non fornito
      const idVisitatore = visitatore.Title || `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Step 2: Costruisci i campi mappati
      const allMappedFields = SharePointService.mapVisitatoreToInternal(visitatore, columnMap, this.columnDetails);
      
      // Step 3: Separa i campi testo/boolean dai campi Choice
      const textFields: Record<string, any> = {};
      const choiceFields: Record<string, any> = {};
      
      for (const [fieldName, fieldValue] of Object.entries(allMappedFields)) {
        const colInfo = this.columnDetails[fieldName];
        if (colInfo?.choice) {
          choiceFields[fieldName] = fieldValue;
        } else {
          textFields[fieldName] = fieldValue;
        }
      }

      console.info("ℹ️ [createVisitatore] Visitatore input:", visitatore);
      console.info("ℹ️ [createVisitatore] Campi testo (POST):", textFields);
      console.info("ℹ️ [createVisitatore] Campi Choice (PATCH separato):", choiceFields);

      // Step 4: Crea l'item con solo Title + campi testo/boolean
      const createPayload = {
        fields: {
          Title: idVisitatore,
          ...textFields,
        },
      };

      console.info("ℹ️ [createVisitatore] Payload creazione:", JSON.stringify(createPayload, null, 2));

      const createResult = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items`)
        .post(createPayload);

      console.log("✅ Item creato con campi testo. ID:", createResult.id);

      // Step 5: Se ci sono campi Choice, aggiornali con PATCH
      if (Object.keys(choiceFields).length > 0) {
        console.info("🔄 [createVisitatore] Aggiornamento campi Choice...");
        
        // Costruisci payload usando i displayName invece dei nomi interni field_*
        // Questo è un workaround per un bug noto di SharePoint Graph API
        const choiceFieldsWithDisplayName: Record<string, any> = {};
        for (const [internalName, value] of Object.entries(choiceFields)) {
          const colInfo = this.columnDetails[internalName];
          // Usa il displayName se disponibile, altrimenti il nome interno
          const fieldKey = colInfo?.displayName || internalName;
          choiceFieldsWithDisplayName[fieldKey] = value;
        }
        
        console.info("   Usando displayName per Choice:", choiceFieldsWithDisplayName);
        
        try {
          // Prima prova con displayName
          await this.graphClient
            .api(`/sites/${this.siteId}/lists/${this.listId}/items/${createResult.id}/fields`)
            .patch(choiceFieldsWithDisplayName);
          
          console.log("✅ Campi Choice aggiornati con successo (usando displayName)");
        } catch (displayNameError: any) {
          console.warn("⚠️ PATCH con displayName fallito, provo con nome interno...");
          
          try {
            // Prova con nome interno
            await this.graphClient
              .api(`/sites/${this.siteId}/lists/${this.listId}/items/${createResult.id}/fields`)
              .patch(choiceFields);
            
            console.log("✅ Campi Choice aggiornati con successo (usando nome interno)");
          } catch (internalError: any) {
            console.warn("⚠️ Anche PATCH con nome interno fallito. Provo campo per campo...");
            
            // Prova campo per campo con entrambi i nomi
            for (const [internalName, fieldValue] of Object.entries(choiceFields)) {
              const colInfo = this.columnDetails[internalName];
              const displayName = colInfo?.displayName || internalName;
              
              // Prova prima con displayName
              try {
                await this.graphClient
                  .api(`/sites/${this.siteId}/lists/${this.listId}/items/${createResult.id}/fields`)
                  .patch({ [displayName]: fieldValue });
                console.log(`   ✅ ${displayName} = "${fieldValue}" OK (displayName)`);
                continue;
              } catch {
                // Se fallisce displayName, prova con interno
                try {
                  await this.graphClient
                    .api(`/sites/${this.siteId}/lists/${this.listId}/items/${createResult.id}/fields`)
                    .patch({ [internalName]: fieldValue });
                  console.log(`   ✅ ${internalName} = "${fieldValue}" OK (internalName)`);
                } catch (singleError: any) {
                  console.error(`   ❌ ${displayName}/${internalName} = "${fieldValue}" FALLITO`);
                  if (singleError.body) {
                    try {
                      const bodyObj = typeof singleError.body === 'string' ? JSON.parse(singleError.body) : singleError.body;
                      console.error(`      Errore:`, bodyObj?.error?.message || bodyObj);
                    } catch {
                      console.error(`      Body:`, singleError.body);
                    }
                  }
                }
              }
            }
          }
        }
      }

      console.log("✅ Visitatore creato con successo:", createResult);
      return createResult;
    } catch (error: any) {
      console.error("❌ Error creating visitatore:", error);
      console.error("Error details:", error.message);
      
      // Log dettagliato per debug errori SharePoint
      if (error.body) {
        try {
          const bodyObj = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
          console.error("Error body (parsed):", JSON.stringify(bodyObj, null, 2));
          
          // Suggerimenti specifici per errori comuni
          if (bodyObj?.error?.message?.includes("General exception")) {
            console.error("💡 SUGGERIMENTO: L'errore 'General exception' indica spesso:");
            console.error("   1. Nome colonna non valido (verifica column map sopra)");
            console.error("   2. Valore Choice non presente nella lista SharePoint");
            console.error("   3. Campo obbligatorio mancante");
            console.error("   Verifica le colonne della lista con getListColumns()");
          }
        } catch {
          console.error("Error body (raw):", error.body);
        }
      }
      
      // Ri-lancia l'errore con messaggio più descrittivo
      const enhancedError = new Error(
        `Errore creazione visitatore: ${error.message}. Verifica console per dettagli column mapping.`
      );
      (enhancedError as any).originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Legge tutti i visitatori dalla lista
   */
  async getVisitatori() {
    try {
      const items = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items`)
        .expand("fields")
        .top(100) // Limita a 100 elementi per test
        .get();

      console.log(`✅ Recuperati ${items.value.length} visitatori`);
      return items.value.map(SharePointService.normalizeVisitatoreItem);
    } catch (error: any) {
      const status = error?.statusCode || error?.status;
      const code = (error?.code || "").toString().toLowerCase();
      const isAccessDenied = status === 403 || code.includes("accessdenied");

      if (isAccessDenied) {
        console.info("ℹ️ Accesso alla lista visitatori negato per l'utente corrente (permessi limitati).");
        const err = new Error("AccessDenied");
        (err as any).code = "AccessDenied";
        (err as any).status = status;
        throw err;
      }

      console.error("❌ Error getting visitatori:", error);
      console.error("Error details:", error?.message);
      throw error;
    }
  }

  /**
   * Legge un visitatore specifico tramite ID item
   */
  async getVisitatore(itemId: string) {
    try {
      const item = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items/${itemId}`)
        .expand("fields")
        .get();

      const normalized = SharePointService.normalizeVisitatoreItem(item);
      console.log("✅ Visitatore recuperato:", normalized);
      return normalized;
    } catch (error: any) {
      console.error("❌ Error getting visitatore:", error);
      console.error("Error details:", error.message);
      throw error;
    }
  }

  /**
   * Aggiorna un visitatore esistente
   */
  async updateVisitatore(itemId: string, visitatore: Partial<Visitatore>) {
    try {
      const columnMap = await this.ensureColumnMap();
      const result = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items/${itemId}/fields`)
        .patch(SharePointService.mapVisitatoreToInternal(visitatore, columnMap, this.columnDetails));

      console.log("✅ Visitatore aggiornato:", result);
      return result;
    } catch (error: any) {
      console.error("❌ Error updating visitatore:", error);
      console.error("Error details:", error.message);
      throw error;
    }
  }

  /**
   * Elimina un visitatore
   */
  async deleteVisitatore(itemId: string) {
    try {
      await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/items/${itemId}`)
        .delete();

      console.log("✅ Visitatore eliminato con successo");
      return { success: true };
    } catch (error: any) {
      console.error("❌ Error deleting visitatore:", error);
      console.error("Error details:", error.message);
      throw error;
    }
  }

  /**
   * Ottiene la struttura della lista (colonne)
   */
  async getListColumns() {
    try {
      const columns = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/columns`)
        .get();

      console.log("✅ Colonne della lista:", columns.value);
      return columns.value;
    } catch (error: any) {
      console.error("❌ Error getting list columns:", error);
      throw error;
    }
  }

  /**
   * Diagnostica dettagliata della lista SharePoint.
   * Utile per debuggare errori 500 "General exception".
   * Restituisce informazioni complete sulle colonne e i loro tipi.
   */
  async diagnoseList(): Promise<{
    listInfo: any;
    columns: any[];
    columnMap: Record<string, string>;
    choiceColumns: { name: string; displayName: string; choices: string[] }[];
    requiredColumns: string[];
  }> {
    try {
      // Info lista
      const listInfo = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}`)
        .get();

      // Colonne
      const columns = await this.graphClient
        .api(`/sites/${this.siteId}/lists/${this.listId}/columns`)
        .get();

      // Forza il caricamento della mappa
      this.columnMapLoaded = false;
      this.columnMap = null;
      const columnMap = await this.ensureColumnMap();

      // Estrai colonne Choice
      const choiceColumns = (columns.value || [])
        .filter((c: any) => c.choice?.choices?.length)
        .map((c: any) => ({
          name: c.name,
          displayName: c.displayName,
          choices: c.choice.choices,
        }));

      // Estrai colonne obbligatorie
      const requiredColumns = (columns.value || [])
        .filter((c: any) => c.required)
        .map((c: any) => c.displayName || c.name);

      const result = {
        listInfo: {
          name: listInfo.name,
          displayName: listInfo.displayName,
          id: listInfo.id,
        },
        columns: columns.value,
        columnMap,
        choiceColumns,
        requiredColumns,
      };

      console.log("🔍 [diagnoseList] Diagnostica lista:", result);
      return result;
    } catch (error: any) {
      console.error("❌ Error diagnosing list:", error);
      throw error;
    }
  }

  // --- GESTIONE DOCUMENTI PRIVACY (DRIVE) ---

  private privacyDriveId: string | null = null;

  /**
   * Trova l'ID del Drive "PrivacyDocuments"
   */
  async getPrivacyDriveId(): Promise<string> {
    if (this.privacyDriveId) return this.privacyDriveId;

    try {
      const drives = await this.graphClient.api(`/sites/${this.siteId}/drives`).get();
      const targetDrive = drives.value.find(
        (d: any) => d.name === "PrivacyDocuments" || decodeURIComponent(d.name) === "PrivacyDocuments"
      );

      if (!targetDrive) {
        throw new Error("Drive 'PrivacyDocuments' non trovato nel sito.");
      }

      this.privacyDriveId = targetDrive.id;
      return targetDrive.id;
    } catch (error: any) {
      console.error("❌ Error finding privacy drive:", error);
      throw error;
    }
  }

  /**
   * Ottiene la lista dei file PDF nella cartella privacy
   */
  async getPrivacyDocuments() {
    try {
      const driveId = await this.getPrivacyDriveId();
      const response = await this.graphClient
        .api(`/sites/${this.siteId}/drives/${driveId}/root/children`)
        .select("id,name,webUrl,size,createdDateTime,@microsoft.graph.downloadUrl,parentReference")
        .get();

      return response.value || [];
    } catch (error: any) {
      console.error("❌ Error getting privacy documents:", error);
      throw error;
    }
  }

  /**
   * Scarica il contenuto di un file come Blob
   */
  async getDocumentContent(driveId: string, itemId: string): Promise<Blob> {
    try {
      const response = await this.graphClient
        .api(`/sites/${this.siteId}/drives/${driveId}/items/${itemId}/content`)
        .responseType(ResponseType.ARRAYBUFFER)
        .get();

      return new Blob([response]);
    } catch (error: any) {
      console.error("❌ Error getting document content:", error);
      throw error;
    }
  }

  /**
   * Carica un nuovo documento privacy
   */
  async uploadPrivacyDocument(file: File) {
    try {
      const driveId = await this.getPrivacyDriveId();
      const fileName = encodeURIComponent(file.name);
      
      // Upload semplice (per file < 4MB). Per file grandi servirebbe upload session,
      // ma i PDF privacy sono solitamente piccoli.
      const result = await this.graphClient
        .api(`/sites/${this.siteId}/drives/${driveId}/root:/${fileName}:/content`)
        .put(file);

      console.log("✅ Documento caricato:", result);
      return result;
    } catch (error: any) {
      console.error("❌ Error uploading privacy document:", error);
      throw error;
    }
  }

  /**
   * Elimina un documento privacy
   */
  async deletePrivacyDocument(itemId: string) {
    try {
      const driveId = await this.getPrivacyDriveId();
      await this.graphClient
        .api(`/sites/${this.siteId}/drives/${driveId}/items/${itemId}`)
        .delete();

      console.log("✅ Documento eliminato");
      return { success: true };
    } catch (error: any) {
      console.error("❌ Error deleting privacy document:", error);
      throw error;
    }
  }

  // --- UTILITIES DI MAPPATURA NOMI INTERNI ---

  /**
   * Mappa i campi del visitatore dai nomi logici ai nomi interni SharePoint (field_1, ...)
   * Se la lista usa nomi custom, la mappa verrà popolata dinamicamente.
   */
  private static defaultColumnMap: Record<string, string> = {
    Nome: "Nome",
    Cognome: "Cognome",
    Email: "Email",
    Azienda: "Azienda",
    Stato: "Stato",
    Categoria: "Categoria",
    VideoTutorialVisto: "VideoTutorialVisto",
    VideoTutorial: "VideoTutorialVisto",
    EnteRiferimento: "EnteRiferimento",
    Progetto: "Progetto",
    Commessa: "Commessa",
    Attivita: "Attivita",
  };

  /**
   * Mappa i campi del visitatore ai nomi interni SharePoint.
   * Gestisce automaticamente:
   * - Colonne Choice (valida il valore e fallback al primo valore valido)
   * - Colonne Boolean (converte in booleano)
   * - Stringhe vuote (le ignora per evitare errori)
   */
  private static mapVisitatoreToInternal(
    visitatore: Partial<Visitatore>,
    columnMap: Record<string, string>,
    columnDetails: Record<string, any>
  ) {
    const mapped: Record<string, any> = {};

    const setValue = (logicalKey: string, value: any) => {
      const targetKey = columnMap[logicalKey];
      if (!targetKey) {
        // Colonna non trovata nella mappa - skip silenzioso
        return;
      }
      
      const colInfo = columnDetails?.[targetKey] || null;

      // Gestione colonne Choice
      if (colInfo?.choice?.choices?.length) {
        const norm = (s: string) => (s || "").toLowerCase().trim();
        const match =
          typeof value === "string"
            ? colInfo.choice.choices.find((c: string) => norm(c) === norm(value))
            : undefined;
        
        // Se il valore non è valido e non c'è un valore, non inviare nulla
        if (!match && (value === undefined || value === null || value === "")) {
          return;
        }
        
        const chosen = match || colInfo.choice.choices[0];
        if (colInfo.choice.allowMultipleValues) {
          mapped[targetKey] = [chosen];
        } else {
          mapped[targetKey] = chosen;
        }
        if (!match && value) {
          console.warn(`⚠️ [mapVisitatoreToInternal] Valore '${value}' non trovato tra le choice di ${logicalKey} (${colInfo.choice.choices.join(", ")}). Uso '${chosen}'.`);
        }
        return;
      }

      // Gestione colonne Boolean
      if (colInfo?.boolean !== undefined) {
        mapped[targetKey] = Boolean(value);
        return;
      }

      // Ignora valori undefined, null o stringhe vuote
      if (value === undefined || value === null) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return;
        mapped[targetKey] = trimmed;
        return;
      }
      mapped[targetKey] = value;
    };

    // Mappa tutti i campi del visitatore
    setValue("Nome", visitatore.Nome);
    setValue("Cognome", visitatore.Cognome);
    setValue("Email", visitatore.Email);
    setValue("Azienda", visitatore.Azienda);
    setValue("Stato", visitatore.Stato);
    setValue("Categoria", visitatore.Categoria);
    
    // Tutorial - gestisci solo se esplicitamente true
    if (visitatore.VideoTutorialVisto === true) {
      setValue("VideoTutorialVisto", true);
    }
    
    // Campi ispettore (solo se valorizzati)
    setValue("EnteRiferimento", visitatore.EnteRiferimento);
    setValue("Progetto", visitatore.Progetto);
    setValue("Commessa", visitatore.Commessa);
    setValue("Attivita", visitatore.Attivita);

    return mapped;
  }

  /**
   * Normalizza un item della lista visitatori mappando i nomi interni ai nomi logici attesi dal codice.
   * Supporta sia nomi standard che nomi interni SharePoint (field_*).
   */
  private static normalizeVisitatoreItem(item: any) {
    const f = item?.fields || {};

    // Funzione helper per cercare un valore in più chiavi possibili
    const getValue = (...keys: string[]) => {
      for (const key of keys) {
        if (f[key] !== undefined && f[key] !== null) {
          return f[key];
        }
      }
      return undefined;
    };

    const normalizedFields = {
      ...f,
      // Mappa i campi cercando prima il nome standard, poi field_*
      Nome: getValue("Nome", "field_1", "FirstName", "Name"),
      Cognome: getValue("Cognome", "field_2", "LastName"),
      Email: getValue("Email", "field_3", "Mail"),
      Azienda: getValue("Azienda", "field_4", "Company"),
      Stato: getValue("Stato", "field_5", "Status"),
      Categoria: getValue("Categoria", "field_6", "Category"),
      VideoTutorialVisto: getValue("VideoTutorialVisto", "VideoTutorial", "field_8", "Tutorial"),
      EnteRiferimento: getValue("EnteRiferimento", "field_9", "Ente"),
      Progetto: getValue("Progetto", "field_10", "Project"),
      Commessa: getValue("Commessa", "field_11", "Order"),
      Attivita: getValue("Attivita", "Attività", "field_12", "Activity"),
    };

    return {
      ...item,
      fields: normalizedFields,
    };
  }

  /**
   * Carica e memorizza la mappa colonne (displayName -> internal name) per evitare errori di campo non riconosciuto.
   * Questa funzione è cruciale per evitare errori 500 "General exception" causati da nomi di colonne errati.
   */
  private async ensureColumnMap(): Promise<Record<string, string>> {
    if (this.columnMapLoaded && this.columnMap) return this.columnMap;

    try {
      console.info("🔄 [ensureColumnMap] Caricamento colonne da SharePoint...");
      const columns = await this.graphClient.api(`/sites/${this.siteId}/lists/${this.listId}/columns`).get();
      
      // Costruisci lookup - usa ESATTAMENTE il nome così come restituito dall'API
      const columnLookup = new Map<string, string>();
      const columnLookupLower = new Map<string, string>();

      this.columnDetails = {};
      
      console.info("📋 [ensureColumnMap] Colonne disponibili nella lista SharePoint:");
      (columns.value || []).forEach((c: any, idx: number) => {
        if (c.name) {
          this.columnDetails[c.name] = c;
          // Lookup esatto per nome
          columnLookup.set(c.name, c.name);
          columnLookupLower.set(c.name.toLowerCase(), c.name);
          // Lookup anche per displayName
          if (c.displayName) {
            columnLookup.set(c.displayName, c.name);
            columnLookupLower.set(c.displayName.toLowerCase(), c.name);
          }
        }
        
        const info: any = {
          "#": idx + 1,
          displayName: c.displayName,
          internalName: c.name,
          type: c.text ? "text" : c.choice ? "choice" : c.boolean !== undefined ? "boolean" : c.dateTime ? "dateTime" : c.number ? "number" : "other",
        };
        if (c.choice?.choices) {
          info.choices = c.choice.choices;
        }
        if (c.required) info.required = true;
        console.info(`   [${idx + 1}] "${c.displayName}" → internalName: "${c.name}"`, info);
      });

      // Mappatura - prima cerca nome esatto, poi case-insensitive
      const findColumn = (name: string): string | undefined => {
        // Prima cerca esatto
        if (columnLookup.has(name)) return columnLookup.get(name);
        // Poi cerca case-insensitive
        if (columnLookupLower.has(name.toLowerCase())) return columnLookupLower.get(name.toLowerCase());
        return undefined;
      };

      // Lista dei campi che vogliamo mappare
      const desiredFields = [
        "Nome", "Cognome", "Email", "Azienda", "Stato", "Categoria",
        "VideoTutorialVisto", "EnteRiferimento", "Progetto", "Commessa", "Attivita"
      ];

      const map: Record<string, string> = {};
      const missingColumns: string[] = [];
      
      for (const field of desiredFields) {
        const internal = findColumn(field);
        if (internal) {
          map[field] = internal;
        } else {
          missingColumns.push(field);
        }
      }

      // Log della mappa finale
      console.info("🗺️ [ensureColumnMap] Mappa colonne risolta:");
      Object.entries(map).forEach(([logical, internal]) => {
        const col = this.columnDetails[internal];
        const typeInfo = col?.choice 
          ? `(choice: ${col.choice.choices?.join(", ")})` 
          : col?.boolean !== undefined 
            ? "(boolean)" 
            : "(text)";
        console.info(`   ${logical} → "${internal}" ${typeInfo}`);
      });
      
      if (missingColumns.length > 0) {
        console.warn("⚠️ [ensureColumnMap] Colonne NON trovate nella lista:", missingColumns);
      }

      this.columnMap = map;
      this.columnMapLoaded = true;
      return map;
    } catch (err) {
      console.error("❌ [ensureColumnMap] Impossibile recuperare le colonne:", err);
      console.warn("⚠️ Uso mappa di default - QUESTO POTREBBE CAUSARE ERRORI 500!");
      this.columnMap = { ...SharePointService.defaultColumnMap };
      this.columnMapLoaded = true;
      return this.columnMap;
    }
  }
}
