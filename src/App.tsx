import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  signInAndGetWorkspaceToken,
  logout,
  getWorkspaceToken,
} from './authService';
import {
  googleWorkspaceSync,
  DriveFileItem,
} from './googleWorkspaceSync';
import {
  childProfilesService,
  isAppOffline,
  setSimulatedOffline,
  getPendingSyncQueue,
} from './childProfilesService';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmationModal } from './components/ConfirmationModal';
import { CalendarModal } from './components/CalendarModal';
import { SyncLogViewer } from './components/SyncLogViewer';
import { ApiDocsViewer } from './components/ApiDocsViewer';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { GrowthHistoryTimeline } from './components/GrowthHistoryTimeline';
import {
  Baby,
  Database,
  Cloud,
  FolderSync,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  PlusCircle,
  Calendar as CalendarIcon,
  LogOut,
  FolderOpen,
  Send,
  Download,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  BookOpen,
  TrendingUp,
  GitMerge,
} from 'lucide-react';
import { ChildAccount, SyncLogEntry, OfflinePendingItem, SyncConflict } from './types';

const DEFAULT_CHILD: ChildAccount = {
  id: 'baby_001',
  name: 'Maya Rodrigues',
  birthdate: '2024-04-15',
  gender: 'Feminino',
  bloodType: 'O+',
  weightKg: '7.8',
  heightCm: '68',
  notes: 'Alérgica a amendoim. Em introdução alimentar.',
  emergencyContact: '(11) 98765-4321 - Dra. Camila',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'app' | 'history' | 'api-docs'>('app');
  const [activeConflict, setActiveConflict] = useState<SyncConflict | null>(null);

  // Offline and network status
  const [offlineMode, setOfflineMode] = useState<boolean>(() => isAppOffline());
  const [pendingQueue, setPendingQueue] = useState<OfflinePendingItem[]>(() =>
    getPendingSyncQueue()
  );

  // Spreadsheet and Drive state
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem('baby_active_spreadsheet_id') || '';
  });
  const [folderId, setFolderId] = useState<string | null>(() => {
    return localStorage.getItem('baby_active_folder_id') || null;
  });
  const [driveSpreadsheets, setDriveSpreadsheets] = useState<DriveFileItem[]>([]);
  const [isSettingUpDrive, setIsSettingUpDrive] = useState(false);

  // Child Profile state
  const [activeProfile, setActiveProfile] = useState<ChildAccount>(DEFAULT_CHILD);
  const [savedProfiles, setSavedProfiles] = useState<ChildAccount[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);

  // Confirmation modal state (mandated for destructive/overwriting operations)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmDetails, setConfirmDetails] = useState<{
    title: string;
    message: string;
    action: () => void;
  }>({
    title: '',
    message: '',
    action: () => {},
  });

  // Calendar modal state
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  // Logging state
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);

  const addLog = useCallback(
    (
      type: SyncLogEntry['type'],
      status: SyncLogEntry['status'],
      message: string,
      details?: string
    ) => {
      const entry: SyncLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        type,
        status,
        message,
        details,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 49)]);
    },
    []
  );

  // Listen for browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(isAppOffline());
      addLog('OFFLINE_CACHE', 'info', 'Conexão de rede detectada (Online)');
      // Auto-flush queue
      autoFlush();
    };
    const handleOffline = () => {
      setOfflineMode(true);
      addLog('OFFLINE_CACHE', 'warning', 'Perda de conexão detectada (Offline)');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addLog]);

  // Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        if (currentToken) {
          addLog(
            'DRIVE_SETUP',
            'success',
            `Sessão autenticada: ${currentUser.email}`,
            `Scopes ativos: drive.file, spreadsheets, calendar.events`
          );
        }
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );

    // Load initial cached profiles
    const localList = childProfilesService.getLocalProfiles();
    if (localList.length > 0) {
      setSavedProfiles(localList);
      setActiveProfile(localList[0]);
    }

    return () => unsubscribe();
  }, [addLog]);

  // Sync token from memory / session
  useEffect(() => {
    const t = getWorkspaceToken();
    if (t && !token) {
      setToken(t);
    }
  }, [token]);

  // Refresh pending queue
  const refreshQueue = useCallback(() => {
    setPendingQueue(getPendingSyncQueue());
  }, []);

  // Update spreadsheetId and save to localStorage
  const handleSpreadsheetChange = (newId: string) => {
    const trimmed = newId.trim();
    setSpreadsheetId(trimmed);
    localStorage.setItem('baby_active_spreadsheet_id', trimmed);
  };

  // Google Sign-In
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await signInAndGetWorkspaceToken();
      if (res.cancelled) {
        addLog('OFFLINE_CACHE', 'info', 'Janela de login fechada pelo usuário.');
        return;
      }
      if (res.error) {
        setLoginError(res.error);
        addLog('DRIVE_SETUP', 'warning', 'Aviso no login', res.error);
        return;
      }
      if (res.user && res.accessToken) {
        setUser(res.user);
        setToken(res.accessToken);
        addLog(
          'DRIVE_SETUP',
          'success',
          `Login realizado com sucesso!`,
          `Usuário: ${res.user.email} (Token do Workspace capturado e em memória)`
        );

        // Auto-search or list Drive spreadsheets
        loadUserSpreadsheets();
      }
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || 'Falha ao autenticar com o Google Workspace.');
      addLog('DRIVE_SETUP', 'error', 'Erro na autenticação', err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      addLog('OFFLINE_CACHE', 'info', 'Usuário desconectado. Token removido da memória.');
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load existing spreadsheets from Drive
  const loadUserSpreadsheets = async () => {
    if (!token && !getWorkspaceToken()) return;
    try {
      const files = await googleWorkspaceSync.listSpreadsheets();
      setDriveSpreadsheets(files);
      if (files.length > 0 && !spreadsheetId) {
        handleSpreadsheetChange(files[0].id);
      }
    } catch (err) {
      console.warn('Erro ao carregar arquivos do Drive:', err);
    }
  };

  // Auto setup folder and spreadsheet in Google Drive
  const handleCreateOfficialSpreadsheet = async () => {
    if (!token && !getWorkspaceToken()) {
      setLoginError('Faça login com o Google para criar a planilha no seu Google Drive.');
      return;
    }

    setIsSettingUpDrive(true);
    try {
      addLog('DRIVE_SETUP', 'info', 'Criando pasta no Google Drive...');
      const folder = await googleWorkspaceSync.ensureBabySyncFolder('BabySync - Registros');
      setFolderId(folder.id);
      localStorage.setItem('baby_active_folder_id', folder.id);

      addLog(
        'DRIVE_SETUP',
        'success',
        `Pasta pronta no Google Drive: ${folder.name}`,
        `ID: ${folder.id}`
      );

      addLog('SHEETS_WRITE', 'info', 'Criando planilha oficial com abas pré-formatadas...');
      const { spreadsheetId: newId, spreadsheetUrl } =
        await googleWorkspaceSync.createSpreadsheetWithHeaders(
          'BabySync - Registro Oficial',
          folder.id
        );

      handleSpreadsheetChange(newId);
      addLog(
        'SHEETS_WRITE',
        'success',
        `Planilha oficial criada com cabeçalhos prontos!`,
        `ID: ${newId}\nURL: ${spreadsheetUrl}`
      );

      await loadUserSpreadsheets();
    } catch (err: any) {
      addLog('DRIVE_SETUP', 'error', 'Falha ao configurar no Google Drive/Sheets', err.message);
    } finally {
      setIsSettingUpDrive(false);
    }
  };

  // Save profile with confirmation dialog (Workspace requirement)
  const initiateSaveProfile = () => {
    if (!spreadsheetId && !offlineMode) {
      // Just save to local cache
      executeSaveProfile();
      return;
    }

    setConfirmDetails({
      title: 'Atualizar Planilha do Google Sheets?',
      message: `Você está prestes a gravar o perfil de "${activeProfile.name || 'Bebê'}" (ID: ${
        activeProfile.id
      }) na planilha do Google Sheets vinculada. Isso atualizará os dados remotos e o cache local. Deseja prosseguir?`,
      action: () => executeSaveProfile(),
    });
    setConfirmModalOpen(true);
  };

  const executeSaveProfile = async (options?: {
    forceOverwrite?: boolean;
    customMerge?: ChildAccount;
  }) => {
    setConfirmModalOpen(false);
    setIsSaving(true);

    try {
      addLog(
        'SHEETS_WRITE',
        'info',
        `Salvando perfil de ${activeProfile.name} (Modo: ${offlineMode ? 'OFFLINE' : 'ONLINE'})...`
      );

      const result = await childProfilesService.saveChildProfile(
        activeProfile,
        spreadsheetId,
        options
      );

      // Refresh local list
      const updatedList = childProfilesService.getLocalProfiles();
      setSavedProfiles(updatedList);
      refreshQueue();

      if (result.conflict) {
        setActiveConflict(result.conflict);
        addLog(
          'CONFLICT_RESOLVED',
          'warning',
          `Conflito detectado: Planilha remota possui edições mais recentes!`,
          `Divergências encontradas em: ${result.conflict.conflictedFields
            .map((f) => f.label)
            .join(', ')}`
        );
        return;
      }

      if (result.syncedToCloud) {
        addLog(
          'SHEETS_WRITE',
          'success',
          `Sincronizado com Google Sheets com sucesso! (ID: ${activeProfile.id})`,
          `Gravado em: baby-profile e histórico arquivado em baby-history`
        );
      } else {
        addLog(
          'OFFLINE_CACHE',
          'warning',
          `Salvo no cache local (Offline/Pendente)`,
          result.error || 'Adicionado à fila de sincronização pendente.'
        );
      }
    } catch (err: any) {
      addLog('SHEETS_WRITE', 'error', 'Erro ao salvar perfil', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler para resolução de conflito escolhida pelo usuário
  const handleResolveConflict = async (
    strategy: 'local' | 'remote' | 'merge',
    mergedProfile?: ChildAccount
  ) => {
    if (!activeConflict) return;
    const conflictData = activeConflict;
    setActiveConflict(null);

    if (strategy === 'remote') {
      setActiveProfile(conflictData.remoteProfile);
      addLog(
        'CONFLICT_RESOLVED',
        'info',
        'Conflito resolvido: Cópia remota da nuvem adotada como atual.'
      );
    } else if (strategy === 'local') {
      await executeSaveProfile({ forceOverwrite: true });
      addLog(
        'CONFLICT_RESOLVED',
        'success',
        'Conflito resolvido: Cópia local sobrescreveu a remota (Last-Write-Wins).'
      );
    } else if (strategy === 'merge' && mergedProfile) {
      setActiveProfile(mergedProfile);
      await executeSaveProfile({ customMerge: mergedProfile });
      addLog(
        'CONFLICT_RESOLVED',
        'success',
        'Conflito resolvido via Mesclagem Inteligente (Merge de campos)!'
      );
    }
  };

  // Fetch profile from Sheets / Cache
  const handleFetchProfile = async () => {
    setIsLoadingProfile(true);
    try {
      addLog(
        'SHEETS_READ',
        'info',
        `Buscando perfil para ID: ${activeProfile.id} na planilha...`
      );

      const profile = await childProfilesService.getChildProfile(activeProfile.id, spreadsheetId);

      if (profile) {
        setActiveProfile(profile);
        addLog(
          'SHEETS_READ',
          'success',
          `Perfil recuperado com sucesso: ${profile.name}`,
          JSON.stringify(profile, null, 2)
        );
      } else {
        addLog(
          'SHEETS_READ',
          'warning',
          `Nenhum dado encontrado para o ID: ${activeProfile.id} (nem no Sheets nem no cache)`
        );
      }
    } catch (err: any) {
      addLog('SHEETS_READ', 'error', 'Erro ao buscar perfil', err.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Auto flush or manual flush of pending sync queue
  const autoFlush = async () => {
    if (isAppOffline()) return;
    const q = getPendingSyncQueue();
    if (q.length === 0) return;

    setIsFlushingQueue(true);
    addLog('QUEUE_FLUSH', 'info', `Descarregando fila de sincronização (${q.length} itens)...`);
    const { processed, failed } = await childProfilesService.flushPendingQueue(spreadsheetId);
    refreshQueue();
    setIsFlushingQueue(false);

    if (processed > 0) {
      addLog(
        'QUEUE_FLUSH',
        'success',
        `Fila de sincronização processada com sucesso: ${processed} item(ns) gravados no Sheets!`
      );
    }
    if (failed > 0) {
      addLog('QUEUE_FLUSH', 'warning', `${failed} item(ns) na fila falharam ao sincronizar.`);
    }
  };

  // Toggle simulated offline
  const handleToggleOfflineMode = () => {
    const nextState = !offlineMode;
    setOfflineMode(nextState);
    setSimulatedOffline(nextState);

    if (nextState) {
      addLog('OFFLINE_CACHE', 'warning', 'Modo Offline Ativado (Simulação manual)');
    } else {
      addLog('OFFLINE_CACHE', 'info', 'Modo Online Restaurado');
      autoFlush();
    }
  };

  // Seed sample test data
  const handleLoadSample = (sampleIndex: number) => {
    if (sampleIndex === 1) {
      setActiveProfile({
        id: 'baby_001',
        name: 'Maya Rodrigues',
        birthdate: '2024-04-15',
        gender: 'Feminino',
        bloodType: 'O+',
        weightKg: '7.8',
        heightCm: '68',
        notes: 'Alérgica a amendoim. Em introdução alimentar.',
        emergencyContact: '(11) 98765-4321 - Dra. Camila',
      });
    } else {
      setActiveProfile({
        id: 'baby_002',
        name: 'Noah Albuquerque',
        birthdate: '2023-11-20',
        gender: 'Masculino',
        bloodType: 'A+',
        weightKg: '11.4',
        heightCm: '82',
        notes: 'Vacinas do 1º ano em dia. Faz uso de vitamina D.',
        emergencyContact: '(11) 91234-5678 - Hospital Infantil',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Modals */}
      <ConflictResolutionModal
        isOpen={!!activeConflict}
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolve={handleResolveConflict}
      />

      <ConfirmationModal
        isOpen={confirmModalOpen}
        title={confirmDetails.title}
        message={confirmDetails.message}
        confirmLabel="Salvar no Sheets"
        onConfirm={confirmDetails.action}
        onCancel={() => setConfirmModalOpen(false)}
      />

      <CalendarModal
        isOpen={calendarModalOpen}
        childName={activeProfile.name}
        onClose={() => setCalendarModalOpen(false)}
        onEventCreated={(summary) => {
          addLog(
            'CALENDAR_EVENT',
            'success',
            `Evento criado no Google Calendar: "${summary}"`,
            `Sincronizado via calendar.events API`
          );
        }}
      />

      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Baby className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">BabySync</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Google Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Firebase Auth &bull; Google Sheets &bull; Google Drive &bull; PWA Offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Offline Simulation Switch */}
            <button
              onClick={handleToggleOfflineMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                offlineMode
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
              title="Clique para alternar simulação de modo offline"
            >
              {offlineMode ? <WifiOff className="w-4 h-4 text-amber-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
              <span>{offlineMode ? 'Modo Offline' : 'Online'}</span>
            </button>

            {/* User Session */}
            {user ? (
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1.5 pr-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuário'}
                    className="w-7 h-7 rounded-lg object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-semibold">
                    {user.email?.[0].toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden md:block">
                  <div className="text-xs font-medium text-slate-200 line-clamp-1 max-w-[130px]">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">Workspace Conectado</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <GoogleSignInButton
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                text={isLoggingIn ? 'Conectando...' : 'Conectar Google'}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setCurrentTab('app')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'app'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Baby className="w-4 h-4" />
            <span>Painel do Bebê & Sincronização Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Histórico & Evolução (Versionamento)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
              baby-history
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('api-docs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'api-docs'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
            <span>Documentação da API & Sandbox REST</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 font-mono">
              OpenAPI 3.0
            </span>
          </button>
        </div>

        {loginError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold">Erro de conexão: </span>
              {loginError}
            </div>
          </div>
        )}

        {currentTab === 'api-docs' ? (
          <ApiDocsViewer />
        ) : currentTab === 'history' ? (
          <GrowthHistoryTimeline
            child={activeProfile}
            spreadsheetId={spreadsheetId}
            onRecordAdded={() => {
              refreshQueue();
              addLog(
                'SHEETS_WRITE',
                'success',
                'Nova medição de crescimento gravada no histórico!',
                `Gravada na aba baby-history (${spreadsheetId || 'cache local'})`
              );
            }}
          />
        ) : (
          <>
            {/* Sync Status Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Sheets Connection */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">Google Sheets</h3>
                  <p className="text-xs text-slate-400">
                    {spreadsheetId ? 'Planilha vinculada' : 'Nenhuma planilha vinculada'}
                  </p>
                </div>
              </div>
              {spreadsheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline"
                >
                  <span>Abrir</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Aba: <code className="text-slate-300 font-mono">baby-profile</code></span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    token && spreadsheetId ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                {token && spreadsheetId ? 'Pronto para Gravação' : 'Aguardando Configuração'}
              </span>
            </div>
          </div>

          {/* Card 2: Google Drive & Folder */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">Google Drive</h3>
                  <p className="text-xs text-slate-400">
                    Pasta: <span className="text-slate-300">BabySync - Registros</span>
                  </p>
                </div>
              </div>
              {folderId && (
                <a
                  href={`https://drive.google.com/drive/folders/${folderId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
                >
                  <span>Pasta</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Escopo: <code className="text-slate-300 font-mono">drive.file</code></span>
              <span className="text-slate-300">Arquivos do app</span>
            </div>
          </div>

          {/* Card 3: Offline Queue & Resilience */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    pendingQueue.length > 0
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                  }`}
                >
                  <FolderSync className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">Fila Offline</h3>
                  <p className="text-xs text-slate-400">
                    {pendingQueue.length === 0
                      ? 'Todos os registros sincronizados'
                      : `${pendingQueue.length} registro(s) pendente(s)`}
                  </p>
                </div>
              </div>

              {pendingQueue.length > 0 && (
                <button
                  onClick={autoFlush}
                  disabled={isFlushingQueue || offlineMode}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isFlushingQueue ? 'animate-spin' : ''}`} />
                  <span>Sincronizar</span>
                </button>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>Resiliência: <span className="text-emerald-400 font-medium">LocalStorage Ativo</span></span>
              <span>{offlineMode ? 'Modo Offline' : 'Conectado'}</span>
            </div>
          </div>
        </div>

        {/* Configuration Bar: Spreadsheet ID & 1-Click Drive Setup */}
        <section className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  ID da Planilha do Google Sheets (Fonte de Verdade)
                </label>
                <div className="group relative cursor-help">
                  <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-72 p-2 bg-slate-800 text-slate-200 text-xs rounded-lg shadow-xl border border-slate-700 z-20">
                    O ID fica na URL do documento: docs.google.com/spreadsheets/d/<b>[ID-AQUI]</b>/edit
                  </div>
                </div>
              </div>

              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => handleSpreadsheetChange(e.target.value)}
                  placeholder="Cole o ID da planilha do Google Sheets aqui ou crie uma nova abaixo"
                  className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />

                <button
                  type="button"
                  onClick={handleCreateOfficialSpreadsheet}
                  disabled={isSettingUpDrive || !user}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSettingUpDrive ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Configurando no Drive...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Criar Planilha no Drive Automaticamente</span>
                    </>
                  )}
                </button>
              </div>

              {driveSpreadsheets.length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                  <span className="text-slate-500">Planilhas encontradas no seu Drive:</span>
                  {driveSpreadsheets.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleSpreadsheetChange(file.id)}
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors cursor-pointer ${
                        spreadsheetId === file.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {file.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Child Profile Editor & Background Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Profile Management (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div>
              {/* Header & Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Baby className="w-5 h-5 text-indigo-400" />
                    <span>Perfil da Criança</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Os dados são espelhados no Google Sheets (<code className="font-mono text-slate-300">baby-profile</code>) e guardados no cache local.
                  </p>
                </div>

                {/* Preset Fast Switch */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadSample(1)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    Maya (001)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample(2)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    Noah (002)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveProfile({
                        id: `baby_${Date.now().toString().slice(-4)}`,
                        name: '',
                        birthdate: '',
                        gender: 'Feminino',
                        bloodType: 'A+',
                        weightKg: '',
                        heightCm: '',
                        notes: '',
                        emergencyContact: '',
                      })
                    }
                    className="p-1 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-colors cursor-pointer"
                    title="Novo Bebê"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Form Grid */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Identificador (ID Único)
                  </label>
                  <input
                    type="text"
                    value={activeProfile.id}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, id: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={activeProfile.name}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, name: e.target.value })
                    }
                    placeholder="Ex: Maya Rodrigues"
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={activeProfile.birthdate}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, birthdate: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Gênero
                  </label>
                  <select
                    value={activeProfile.gender}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, gender: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Feminino">Feminino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tipo Sanguíneo
                  </label>
                  <select
                    value={activeProfile.bloodType}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, bloodType: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Peso (kg)
                    </label>
                    <input
                      type="text"
                      value={activeProfile.weightKg || ''}
                      onChange={(e) =>
                        setActiveProfile({ ...activeProfile, weightKg: e.target.value })
                      }
                      placeholder="7.8"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Altura (cm)
                    </label>
                    <input
                      type="text"
                      value={activeProfile.heightCm || ''}
                      onChange={(e) =>
                        setActiveProfile({ ...activeProfile, heightCm: e.target.value })
                      }
                      placeholder="68"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Contato de Emergência / Pediatra
                  </label>
                  <input
                    type="text"
                    value={activeProfile.emergencyContact || ''}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, emergencyContact: e.target.value })
                    }
                    placeholder="(11) 98765-4321 - Dra. Camila"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Notas, Alergias e Cuidados Médicos
                  </label>
                  <textarea
                    rows={2}
                    value={activeProfile.notes || ''}
                    onChange={(e) =>
                      setActiveProfile({ ...activeProfile, notes: e.target.value })
                    }
                    placeholder="Instruções alimentares, alergias, rotina..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarModalOpen(true)}
                  disabled={!user}
                  className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Agendar consulta no Google Calendar com escopo calendar.events"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Agendar Consulta</span>
                </button>

                <button
                  type="button"
                  onClick={handleFetchProfile}
                  disabled={isLoadingProfile}
                  className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Lê do Google Sheets com fallback para cache local"
                >
                  <Download className={`w-3.5 h-3.5 text-sky-400 ${isLoadingProfile ? 'animate-bounce' : ''}`} />
                  <span>Ler da Nuvem</span>
                </button>
              </div>

              <button
                type="button"
                onClick={initiateSaveProfile}
                disabled={isSaving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Salvar Perfil (Sincronizar)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Background Traffic & Offline Queue (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Offline Queue Inspector */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-sm text-slate-200">
                    Fila de Pendências Offline
                  </span>
                </div>
                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 font-mono">
                  {pendingQueue.length}
                </span>
              </div>

              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {pendingQueue.length === 0 ? (
                  <div className="text-center py-5 text-xs text-slate-500">
                    Nenhuma operação represada na fila. Todos os dados estão atualizados na nuvem ou no cache.
                  </div>
                ) : (
                  pendingQueue.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/20 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{item.child.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          ID: {item.child.id} &bull; {new Date(item.queuedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                        Pendente
                      </span>
                    </div>
                  ))
                )}
              </div>

              {pendingQueue.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={autoFlush}
                    disabled={isFlushingQueue || offlineMode}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFlushingQueue ? 'animate-spin' : ''}`} />
                    <span>Descarregar e Enviar para o Sheets</span>
                  </button>
                </div>
              )}
            </div>

            {/* Architecture Overview */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 text-xs space-y-3">
              <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span>Fluxo da Arquitetura</span>
              </h3>
              <ul className="space-y-2 text-slate-400 list-disc list-inside">
                <li>
                  <strong className="text-slate-300">1. Autenticação:</strong> Firebase Auth fornece o token OAuth com escopos de Drive, Sheets e Calendar.
                </li>
                <li>
                  <strong className="text-slate-300">2. Motor REST:</strong> <code className="text-slate-300 font-mono">googleWorkspaceSync.ts</code> faz as chamadas diretas via Fetch nativo.
                </li>
                <li>
                  <strong className="text-slate-300">3. Resiliência:</strong> <code className="text-slate-300 font-mono">childProfilesService.ts</code> prioriza a nuvem e guarda em <code className="text-slate-300 font-mono">localStorage</code> no modo offline.
                </li>
              </ul>
            </div>

            {/* Background Activity Console */}
            <SyncLogViewer logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/40 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
          BabySync &bull; Google Workspace REST Sync Engine &bull; Firebase Auth &bull; Offline First
        </div>
      </footer>
    </div>
  );
}
