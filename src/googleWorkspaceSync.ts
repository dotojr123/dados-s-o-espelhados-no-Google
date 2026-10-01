import { getWorkspaceToken } from './authService';

export interface SheetValuesResponse {
  range: string;
  majorDimension?: string;
  values?: any[][];
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

export const googleWorkspaceSync = {
  // Automação de leitura no Sheets
  async fetchSheetData(spreadsheetId: string, range: string): Promise<SheetValuesResponse> {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login com o Google.');

    const cleanId = spreadsheetId.trim();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errorMsg = `Falha ao ler do Sheets (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  // Automação de escrita/atualização no Sheets
  async updateSheetData(spreadsheetId: string, range: string, values: any[][]) {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login com o Google.');

    const cleanId = spreadsheetId.trim();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
      range
    )}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errorMsg = `Falha ao gravar no Sheets (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  // Automação para adicionar nova linha (append) no Sheets
  async appendSheetData(spreadsheetId: string, range: string, values: any[][]) {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login com o Google.');

    const cleanId = spreadsheetId.trim();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errorMsg = `Falha ao adicionar linha no Sheets (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    return response.json();
  },

  // Automação no Google Drive: Criar ou localizar pasta do aplicativo
  async ensureBabySyncFolder(folderName = 'BabySync - Nuvem'): Promise<DriveFileItem> {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login.');

    // Procura se a pasta já existe
    const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=files(id,name,mimeType,webViewLink)&spaces=drive`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }

    // Se não existir, cria a pasta no Drive
    const createUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink';
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createRes.ok) {
      throw new Error('Falha ao criar pasta de sincronização no Google Drive');
    }
    return createRes.json();
  },

  // Automação no Google Drive / Sheets: Criar nova planilha oficial com abas pré-formatadas
  async createSpreadsheetWithHeaders(title = 'BabySync - Perfis e Registros', folderId?: string): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }> {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login.');

    const url = 'https://sheets.googleapis.com/v4/spreadsheets';
    const createPayload = {
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: 'baby-profile',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'baby-history',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    if (!response.ok) {
      throw new Error('Falha ao criar planilha no Google Sheets');
    }

    const created = await response.json();
    const spreadsheetId = created.spreadsheetId;
    const spreadsheetUrl = created.spreadsheetUrl;

    // Inicializa os cabeçalhos na aba baby-profile
    const headerRow = [
      [
        'ID',
        'Nome',
        'Data de Nascimento',
        'Gênero',
        'Tipo Sanguíneo',
        'Peso (kg)',
        'Altura (cm)',
        'Notas / Cuidados',
        'Contato de Emergência',
        'Última Sincronização',
      ],
    ];

    await this.updateSheetData(spreadsheetId, 'baby-profile!A1:J1', headerRow);

    // Se fornecido folderId, move o arquivo para a pasta criada no Drive
    if (folderId && spreadsheetId) {
      try {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } catch (err) {
        console.warn('Não foi possível mover a planilha para a pasta criada:', err);
      }
    }

    return { spreadsheetId, spreadsheetUrl };
  },

  // Automação no Google Drive: Listar planilhas do usuário criadas pelo app ou no Drive
  async listSpreadsheets(): Promise<DriveFileItem[]> {
    const token = getWorkspaceToken();
    if (!token) return [];

    const q = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,mimeType,webViewLink)`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.files || [];
    } catch {
      return [];
    }
  },

  // Automação no Google Calendar: Registrar compromisso/consulta pediátrica
  async createCalendarEvent(eventData: {
    summary: string;
    description: string;
    startDateTime: string; // ISO string
    endDateTime: string; // ISO string
  }) {
    const token = getWorkspaceToken();
    if (!token) throw new Error('Token do Workspace ausente. Refaça o login.');

    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const payload = {
      summary: eventData.summary,
      description: eventData.description,
      start: {
        dateTime: eventData.startDateTime,
      },
      end: {
        dateTime: eventData.endDateTime,
      },
      reminders: {
        useDefault: true,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Falha ao agendar evento no Google Calendar: ${err}`);
    }

    return response.json();
  },
};
