import React from 'react';
import { SyncLogEntry } from '../types';
import { Terminal, CheckCircle2, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react';

interface SyncLogViewerProps {
  logs: SyncLogEntry[];
  onClear: () => void;
}

export const SyncLogViewer: React.FC<SyncLogViewerProps> = ({ logs, onClear }) => {
  return (
    <div className="bg-slate-900 text-slate-200 rounded-xl border border-slate-800 shadow-inner overflow-hidden font-mono text-xs">
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Monitor de Tráfego em Background (REST & Cache)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-sans">
            {logs.length} eventos
          </span>
        </div>
        {logs.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>
        )}
      </div>

      <div className="p-3 max-h-56 overflow-y-auto space-y-2">
        {logs.length === 0 ? (
          <div className="text-slate-500 text-center py-6 font-sans">
            Nenhuma atividade registrada ainda. Execute uma gravação ou leitura para inspecionar os pacotes.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2 rounded bg-slate-800/60 border border-slate-800 hover:bg-slate-800 transition-colors flex items-start gap-2.5"
            >
              <div className="mt-0.5 shrink-0">
                {log.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {log.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                {log.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                {log.status === 'info' && <Info className="w-3.5 h-3.5 text-sky-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-300">
                    [{log.type}]
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-slate-200 break-words mt-0.5">{log.message}</div>
                {log.details && (
                  <div className="mt-1 text-[11px] text-slate-400 bg-slate-950/50 p-1.5 rounded border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
                    {log.details}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
