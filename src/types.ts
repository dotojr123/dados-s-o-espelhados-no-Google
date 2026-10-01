export interface ChildAccount {
  id: string;
  name: string;
  birthdate: string;
  gender: string;
  bloodType: string;
  weightKg?: string;
  heightCm?: string;
  notes?: string;
  emergencyContact?: string;
  lastUpdated?: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  type:
    | 'SHEETS_READ'
    | 'SHEETS_WRITE'
    | 'DRIVE_SETUP'
    | 'CALENDAR_EVENT'
    | 'OFFLINE_CACHE'
    | 'QUEUE_FLUSH'
    | 'CONFLICT_RESOLVED';
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string;
}

export interface ChildGrowthRecord {
  id: string;
  childId: string;
  childName: string;
  recordedAt: string;
  weightKg: string;
  heightCm: string;
  notes?: string;
}

export interface SyncConflict {
  childId: string;
  localProfile: ChildAccount;
  remoteProfile: ChildAccount;
  conflictedFields: Array<{
    field: string;
    label: string;
    localValue: string;
    remoteValue: string;
  }>;
}

export interface WorkspaceFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface WorkspaceSpreadsheetInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface OfflinePendingItem {
  id: string;
  child: ChildAccount;
  spreadsheetId: string;
  queuedAt: string;
  retryCount: number;
}
