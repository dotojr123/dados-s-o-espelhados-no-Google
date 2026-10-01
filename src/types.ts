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
  type: 'SHEETS_READ' | 'SHEETS_WRITE' | 'DRIVE_SETUP' | 'CALENDAR_EVENT' | 'OFFLINE_CACHE' | 'QUEUE_FLUSH';
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string;
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
