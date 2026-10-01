import { googleWorkspaceSync } from './googleWorkspaceSync';
import type { ChildAccount, OfflinePendingItem, ChildGrowthRecord, SyncConflict } from './types';

// Chaves de cache local
const CACHE_PREFIX = 'baby_cache_';
const QUEUE_KEY = 'baby_pending_queue';
const INDEX_KEY = 'baby_profiles_index';
const HISTORY_PREFIX = 'baby_history_';
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
  // Salvar perfil com Resolução de Conflitos e Versionamento no Histórico
  async saveChildProfile(
    child: ChildAccount,
    spreadsheetId: string,
    options?: {
      forceOverwrite?: boolean;
      customMerge?: ChildAccount;
    }
  ): Promise<{
    syncedToCloud: boolean;
    conflict?: SyncConflict;
    error?: string;
  }> {
    const profileToSave = options?.customMerge || child;
    const nowIso = new Date().toISOString();
    const enrichedChild: ChildAccount = {
      ...profileToSave,
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

    // Salva versão no histórico de medições se houver peso ou altura
    if (enrichedChild.weightKg || enrichedChild.heightCm) {
      const measurementRecord: ChildGrowthRecord = {
        id: `meas_${Date.now()}`,
        childId: enrichedChild.id,
        childName: enrichedChild.name,
        recordedAt: nowIso,
        weightKg: enrichedChild.weightKg || '',
        heightCm: enrichedChild.heightCm || '',
        notes: enrichedChild.notes || 'Atualização de rotina',
      };
      this.recordGrowthMeasurementLocally(measurementRecord);
    }

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

    // 2. Se estiver online, empurra para a fonte de verdade (Google Sheets) com checagem de conflitos
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
      let existingRemoteRow: any[] | null = null;

      try {
        const fullSheetData = await googleWorkspaceSync.fetchSheetData(
          spreadsheetId,
          'baby-profile!A2:J100'
        );

        if (fullSheetData.values && fullSheetData.values.length > 0) {
          for (let i = 0; i < fullSheetData.values.length; i++) {
            if (fullSheetData.values[i][0] === enrichedChild.id) {
              foundRowIndex = i + 2; // Linha 1 é cabeçalho, i=0 é linha 2
              existingRemoteRow = fullSheetData.values[i];
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar linhas existentes, prosseguindo com gravação padrão:', err);
      }

      // 3. DETECÇÃO DE CONFLITO (se não estiver forçando sobrescrita nem aplicando merge)
      if (existingRemoteRow && !options?.forceOverwrite && !options?.customMerge) {
        const remoteLastUpdated = existingRemoteRow[9] ? new Date(existingRemoteRow[9]).getTime() : 0;
        const localCachedRaw = localStorage.getItem(`${CACHE_PREFIX}${enrichedChild.id}`);
        const localLastSynced = localCachedRaw ? new Date(JSON.parse(localCachedRaw).lastSyncedAt).getTime() : 0;

        // Se a versão na nuvem foi modificada depois da nossa última sincronização:
        if (remoteLastUpdated > 0 && remoteLastUpdated > localLastSynced) {
          const remoteProfile: ChildAccount = {
            id: existingRemoteRow[0] || enrichedChild.id,
            name: existingRemoteRow[1] || '',
            birthdate: existingRemoteRow[2] || '',
            gender: existingRemoteRow[3] || '',
            bloodType: existingRemoteRow[4] || '',
            weightKg: existingRemoteRow[5] || '',
            heightCm: existingRemoteRow[6] || '',
            notes: existingRemoteRow[7] || '',
            emergencyContact: existingRemoteRow[8] || '',
            lastUpdated: existingRemoteRow[9],
          };

          const conflictedFields: Array<{
            field: string;
            label: string;
            localValue: string;
            remoteValue: string;
          }> = [];

          if (remoteProfile.name !== enrichedChild.name) {
            conflictedFields.push({ field: 'name', label: 'Nome', localValue: enrichedChild.name, remoteValue: remoteProfile.name });
          }
          if (remoteProfile.weightKg !== enrichedChild.weightKg) {
            conflictedFields.push({ field: 'weightKg', label: 'Peso', localValue: enrichedChild.weightKg || '-', remoteValue: remoteProfile.weightKg || '-' });
          }
          if (remoteProfile.heightCm !== enrichedChild.heightCm) {
            conflictedFields.push({ field: 'heightCm', label: 'Altura', localValue: enrichedChild.heightCm || '-', remoteValue: remoteProfile.heightCm || '-' });
          }
          if (remoteProfile.notes !== enrichedChild.notes) {
            conflictedFields.push({ field: 'notes', label: 'Notas/Cuidados', localValue: enrichedChild.notes || '-', remoteValue: remoteProfile.notes || '-' });
          }

          if (conflictedFields.length > 0) {
            return {
              syncedToCloud: false,
              conflict: {
                childId: enrichedChild.id,
                localProfile: enrichedChild,
                remoteProfile,
                conflictedFields,
              },
            };
          }
        }
      }

      // Gravação na aba baby-profile
      if (foundRowIndex > 0) {
        targetRange = `baby-profile!A${foundRowIndex}:J${foundRowIndex}`;
        await googleWorkspaceSync.updateSheetData(spreadsheetId, targetRange, rowData);
      } else {
        await googleWorkspaceSync.appendSheetData(spreadsheetId, 'baby-profile!A:J', rowData);
      }

      // Versionamento no Google Sheets: Insere medição na aba baby-history
      if (enrichedChild.weightKg || enrichedChild.heightCm) {
        try {
          await googleWorkspaceSync.recordGrowthMeasurement(spreadsheetId, {
            id: `meas_${Date.now()}`,
            childId: enrichedChild.id,
            childName: enrichedChild.name,
            recordedAt: nowIso,
            weightKg: enrichedChild.weightKg || '',
            heightCm: enrichedChild.heightCm || '',
            notes: enrichedChild.notes || 'Atualização de rotina',
          });
        } catch (histErr) {
          console.warn('Falha ao gravar linha no histórico do Sheets:', histErr);
        }
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

    const cached = localStorage.getItem(`${CACHE_PREFIX}${childId}`);
    return cached ? JSON.parse(cached).data : null;
  },

  // Salvar registro de crescimento localmente
  recordGrowthMeasurementLocally(record: ChildGrowthRecord) {
    if (typeof window === 'undefined') return;
    try {
      const key = `${HISTORY_PREFIX}${record.childId}`;
      const raw = localStorage.getItem(key);
      const list: ChildGrowthRecord[] = raw ? JSON.parse(raw) : [];
      list.push(record);
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // ignore
    }
  },

  // Obter histórico de medições (nuvem ou local)
  async getGrowthHistory(childId: string, spreadsheetId?: string): Promise<ChildGrowthRecord[]> {
    if (typeof window === 'undefined') return [];

    // Tenta primeiro no Sheets se online
    if (!isAppOffline() && spreadsheetId) {
      try {
        const remoteHistory = await googleWorkspaceSync.fetchGrowthHistory(spreadsheetId, childId);
        if (remoteHistory && remoteHistory.length > 0) {
          localStorage.setItem(`${HISTORY_PREFIX}${childId}`, JSON.stringify(remoteHistory));
          return remoteHistory;
        }
      } catch (err) {
        console.warn('Falha ao buscar histórico do Sheets, usando cache:', err);
      }
    }

    // Fallback: cache local
    try {
      const raw = localStorage.getItem(`${HISTORY_PREFIX}${childId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    // Default mock histórico caso vazio para demonstrar visualização
    return [
      {
        id: 'init_1',
        childId,
        childName: 'Registro Inicial',
        recordedAt: '2024-04-15T10:00:00Z',
        weightKg: '3.4',
        heightCm: '50',
        notes: 'Nascimento (Maternidade)',
      },
      {
        id: 'init_2',
        childId,
        childName: 'Consulta 2º Mês',
        recordedAt: '2024-06-15T14:30:00Z',
        weightKg: '5.2',
        heightCm: '57',
        notes: 'Vacinas de 2 meses aplicadas',
      },
    ];
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

        // Também grava histórico no Sheets
        if (item.child.weightKg || item.child.heightCm) {
          await googleWorkspaceSync.recordGrowthMeasurement(targetSheet, {
            id: `meas_q_${Date.now()}`,
            childId: item.child.id,
            childName: item.child.name,
            recordedAt: new Date().toISOString(),
            weightKg: item.child.weightKg || '',
            heightCm: item.child.heightCm || '',
            notes: item.child.notes || 'Drenado da fila offline',
          });
        }

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
