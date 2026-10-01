import { googleWorkspaceSync } from './googleWorkspaceSync';
import type { ChildAccount, OfflinePendingItem } from './types';

// Chaves de cache local
const CACHE_PREFIX = 'baby_cache_';
const QUEUE_KEY = 'baby_pending_queue';
const INDEX_KEY = 'baby_profiles_index';
const SIMULATED_OFFLINE_KEY = 'baby_simulated_offline';

export const isAppOffline = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isSimulated = localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
  return isSimulated || !navigator.onLine;
};

export const setSimulatedOffline = (simulated: boolean) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SIMULATED_OFFLINE_KEY, simulated ? 'true' : 'false');
  }
};

export const getPendingSyncQueue = (): OfflinePendingItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const savePendingSyncQueue = (queue: OfflinePendingItem[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
};

const addToPendingQueue = (child: ChildAccount, spreadsheetId: string) => {
  const queue = getPendingSyncQueue();
  const existingIdx = queue.findIndex((item) => item.child.id === child.id);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      child,
      spreadsheetId: spreadsheetId || queue[existingIdx].spreadsheetId,
      queuedAt: now,
      retryCount: queue[existingIdx].retryCount + 1,
    };
  } else {
    queue.push({
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      child,
      spreadsheetId,
      queuedAt: now,
      retryCount: 0,
    });
  }
  savePendingSyncQueue(queue);
};

const updateProfilesIndex = (childId: string) => {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const index: string[] = raw ? JSON.parse(raw) : [];
    if (!index.includes(childId)) {
      index.push(childId);
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }
  } catch {
    // ignore
  }
};

export const childProfilesService = {
  // Salvar perfil com cache resiliente e sincronização no Sheets
  async saveChildProfile(child: ChildAccount, spreadsheetId: string): Promise<{
    syncedToCloud: boolean;
    error?: string;
  }> {
    const nowIso = new Date().toISOString();
    const enrichedChild: ChildAccount = {
      ...child,
      lastUpdated: nowIso,
    };

    // 1. Atualiza o cache local imediatamente (garante UI responsiva e suporte offline)
    localStorage.setItem(
      `${CACHE_PREFIX}${enrichedChild.id}`,
      JSON.stringify({
        data: enrichedChild,
        lastSyncedAt: nowIso,
      })
    );
    updateProfilesIndex(enrichedChild.id);

    // Se estiver em modo offline (real ou simulado) ou sem spreadsheetId configurado:
    if (isAppOffline() || !spreadsheetId) {
      if (spreadsheetId) {
        addToPendingQueue(enrichedChild, spreadsheetId);
      }
      return {
        syncedToCloud: false,
        error: isAppOffline()
          ? 'Aplicativo em modo offline. Perfil gravado no cache local e adicionado à fila de sincronização.'
          : 'Planilha não configurada. Perfil mantido localmente.',
      };
    }

    // 2. Se estiver online, empurra para a fonte de verdade (Google Sheets)
    try {
      const rowData = [
        [
          enrichedChild.id,
          enrichedChild.name,
          enrichedChild.birthdate,
          enrichedChild.gender,
          enrichedChild.bloodType,
          enrichedChild.weightKg || '',
          enrichedChild.heightCm || '',
          enrichedChild.notes || '',
          enrichedChild.emergencyContact || '',
          nowIso,
        ],
      ];

      // Busca na planilha para ver se já existe uma linha com o ID do bebê
      let targetRange = 'baby-profile!A2:J2';
      let foundRowIndex = -1;

      try {
        const idColData = await googleWorkspaceSync.fetchSheetData(
          spreadsheetId,
          'baby-profile!A2:A100'
        );
        if (idColData.values && idColData.values.length > 0) {
          for (let i = 0; i < idColData.values.length; i++) {
            if (idColData.values[i][0] === enrichedChild.id) {
              foundRowIndex = i + 2; // Linha 1 é cabeçalho, i=0 é linha 2
              break;
            }
          }
        }
      } catch (err) {
        // Se a busca falhar, tenta gravar diretamente na linha 2
        console.warn('Erro ao verificar linhas existentes, gravando linha padrão:', err);
      }

      if (foundRowIndex > 0) {
        targetRange = `baby-profile!A${foundRowIndex}:J${foundRowIndex}`;
        await googleWorkspaceSync.updateSheetData(spreadsheetId, targetRange, rowData);
      } else {
        // Nova criança: adiciona na próxima linha livre
        await googleWorkspaceSync.appendSheetData(spreadsheetId, 'baby-profile!A:J', rowData);
      }

      // Remove da fila de pendentes caso estivesse lá
      const queue = getPendingSyncQueue();
      const updatedQueue = queue.filter((item) => item.child.id !== enrichedChild.id);
      savePendingSyncQueue(updatedQueue);

      return { syncedToCloud: true };
    } catch (error: any) {
      console.error('Erro na sincronização, enfileirando para depois:', error);
      addToPendingQueue(enrichedChild, spreadsheetId);
      return {
        syncedToCloud: false,
        error: error.message || 'Erro ao sincronizar com Google Sheets. Enfileirado para envio posterior.',
      };
    }
  },

  // Obter perfil buscando da nuvem com fallback no cache local
  async getChildProfile(childId: string, spreadsheetId: string): Promise<ChildAccount | null> {
    // 1. Se tem internet e tem planilha vinculada, tenta a fonte principal (Google Sheets)
    if (!isAppOffline() && spreadsheetId) {
      try {
        const response = await googleWorkspaceSync.fetchSheetData(
          spreadsheetId,
          'baby-profile!A2:J100'
        );
        if (response.values && response.values.length > 0) {
          const matchingRow = response.values.find((r) => r[0] === childId) || response.values[0];
          if (matchingRow) {
            const freshData: ChildAccount = {
              id: matchingRow[0] || childId,
              name: matchingRow[1] || '',
              birthdate: matchingRow[2] || '',
              gender: matchingRow[3] || '',
              bloodType: matchingRow[4] || '',
              weightKg: matchingRow[5] || '',
              heightCm: matchingRow[6] || '',
              notes: matchingRow[7] || '',
              emergencyContact: matchingRow[8] || '',
              lastUpdated: matchingRow[9] || new Date().toISOString(),
            };

            // Atualiza o cache local com os dados frescos
            localStorage.setItem(
              `${CACHE_PREFIX}${childId}`,
              JSON.stringify({
                data: freshData,
                lastSyncedAt: new Date().toISOString(),
              })
            );
            updateProfilesIndex(freshData.id);

            return freshData;
          }
        }
      } catch (error) {
        console.warn('Falha ao ler do Google, caindo para o cache...', error);
      }
    }

    // 2. Fallback: lê do cache se offline ou se a chamada de rede falhar
    const cached = localStorage.getItem(`${CACHE_PREFIX}${childId}`);
    return cached ? JSON.parse(cached).data : null;
  },

  // Listar todos os perfis armazenados localmente
  getLocalProfiles(): ChildAccount[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const index: string[] = raw ? JSON.parse(raw) : [];
      const profiles: ChildAccount[] = [];

      for (const id of index) {
        const item = localStorage.getItem(`${CACHE_PREFIX}${id}`);
        if (item) {
          try {
            profiles.push(JSON.parse(item).data);
          } catch {
            // ignore
          }
        }
      }
      return profiles;
    } catch {
      return [];
    }
  },

  // Esvazia e sincroniza a fila de requisições pendentes gravadas durante offline
  async flushPendingQueue(defaultSpreadsheetId?: string): Promise<{
    processed: number;
    failed: number;
  }> {
    if (isAppOffline()) {
      return { processed: 0, failed: 0 };
    }

    const queue = getPendingSyncQueue();
    if (queue.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;
    const remainingQueue: OfflinePendingItem[] = [];

    for (const item of queue) {
      const targetSheet = item.spreadsheetId || defaultSpreadsheetId;
      if (!targetSheet) {
        remainingQueue.push(item);
        failed++;
        continue;
      }

      try {
        const rowData = [
          [
            item.child.id,
            item.child.name,
            item.child.birthdate,
            item.child.gender,
            item.child.bloodType,
            item.child.weightKg || '',
            item.child.heightCm || '',
            item.child.notes || '',
            item.child.emergencyContact || '',
            new Date().toISOString(),
          ],
        ];

        await googleWorkspaceSync.appendSheetData(targetSheet, 'baby-profile!A:J', rowData);
        processed++;
      } catch (err) {
        console.error('Falha ao descarregar item da fila:', err);
        failed++;
        remainingQueue.push({
          ...item,
          retryCount: item.retryCount + 1,
        });
      }
    }

    savePendingSyncQueue(remainingQueue);
    return { processed, failed };
  },
};
