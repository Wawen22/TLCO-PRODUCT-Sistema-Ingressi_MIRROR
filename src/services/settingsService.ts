import { Client } from "@microsoft/microsoft-graph-client";

export interface SettingItem {
  id?: string; // SharePoint Item ID
  Title: string; // Key (es. "AuthMode")
  Valore: string; // Value (es. "QR" or "EMAIL")
  Descrizione?: string;
}

export class SettingsService {
  private client: Client;
  private siteId: string;
  private listId: string;
  private valueFieldName: string | null = null;
  private valueFieldCandidates: string[];

  constructor(accessToken: string, siteId: string, listId: string) {
    this.client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
    this.siteId = siteId;
    this.listId = listId;
    const envValueField = (import.meta as any)?.env?.VITE_SETTINGS_VALUE_FIELD as string | undefined;
    this.valueFieldCandidates = [
      envValueField,
      "Valore",
      "field_1",
      "Field_1",
      "Value",
      "value",
    ].filter(Boolean) as string[];
  }

  /**
   * Recupera tutte le impostazioni
   */
  async getAllSettings(): Promise<SettingItem[]> {
    try {
      const response = await this.client
        .api(`/sites/${this.siteId}/lists/${this.listId}/items`)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .expand("fields")
        .get();

      return response.value.map((item: any) => {
        const valueField = this.pickValueField(item?.fields || {});
        return {
        id: item.id,
        Title: item.fields.Title,
          Valore: valueField ? item.fields[valueField] : item.fields.Valore,
        Descrizione: item.fields.Descrizione,
        };
      });
    } catch (error) {
      console.error("Errore recupero impostazioni:", error);
      throw error;
    }
  }

  /**
   * Recupera una specifica impostazione per Chiave (Title)
   */
  async getSetting(key: string): Promise<string | null> {
    try {
      // Filtra per Title eq 'Key'
      // Nota: Graph API filtering on list items fields can be tricky. 
      // Spesso è più semplice prendere tutto (se sono poche impostazioni) e filtrare client side.
      // Oppure usare filter=fields/Title eq 'Key' (richiede indicizzazione spesso).
      // Dato che le impostazioni sono poche, prendiamo tutto per sicurezza.
      
      const settings = await this.getAllSettings();
      const setting = settings.find(s => s.Title === key);
      return setting ? setting.Valore : null;
    } catch (error) {
      console.error(`Errore recupero impostazione ${key}:`, error);
      return null;
    }
  }

  /**
   * Aggiorna o Crea una impostazione
   */
  async updateSetting(key: string, value: string): Promise<void> {
    try {
      const valueFieldName = await this.resolveValueFieldName();
      const settings = await this.getAllSettings();
      const existing = settings.find(s => s.Title === key);

      if (existing && existing.id) {
        // Update
        await this.client
          .api(`/sites/${this.siteId}/lists/${this.listId}/items/${existing.id}/fields`)
          .header("Cache-Control", "no-cache")
          .header("Pragma", "no-cache")
          .update({
            [valueFieldName]: value
          });
      } else {
        // Create
        await this.client
          .api(`/sites/${this.siteId}/lists/${this.listId}/items`)
          .header("Cache-Control", "no-cache")
          .header("Pragma", "no-cache")
          .post({
            fields: {
              Title: key,
              [valueFieldName]: value
            }
          });
      }
    } catch (error) {
      console.error(`Errore aggiornamento impostazione ${key}:`, error);
      throw error;
    }
  }

  private pickValueField(fields: Record<string, any>): string | null {
    for (const candidate of this.valueFieldCandidates) {
      if (candidate in fields) {
        return candidate;
      }
    }
    return null;
  }

  private async resolveValueFieldName(): Promise<string> {
    if (this.valueFieldName) {
      return this.valueFieldName;
    }

    try {
      const columns = await this.client
        .api(`/sites/${this.siteId}/lists/${this.listId}/columns`)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .get();

      const normalizedTarget = "valore";
      const match = (columns?.value || []).find((col: any) => {
        const display = (col?.displayName || "").toLowerCase();
        const name = (col?.name || "").toLowerCase();
        return display === normalizedTarget || name === normalizedTarget;
      });

      if (match?.name) {
        this.valueFieldName = match.name;
        return match.name;
      }
    } catch (error) {
      console.warn("Impossibile risolvere il nome campo 'Valore' via colonne:", error);
    }

    // Fallback: usa il primo candidato disponibile o Valore
    this.valueFieldName = this.valueFieldCandidates[0] || "Valore";
    return this.valueFieldName;
  }
}
