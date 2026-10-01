import React, { useState } from 'react';
import { SyncConflict, ChildAccount } from '../types';
import { AlertTriangle, GitMerge, ArrowRight, Check, X, ShieldAlert } from 'lucide-react';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflict: SyncConflict | null;
  onClose: () => void;
  onResolve: (strategy: 'local' | 'remote' | 'merge', mergedProfile?: ChildAccount) => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  conflict,
  onClose,
  onResolve,
}) => {
  if (!isOpen || !conflict) return null;

  const { localProfile, remoteProfile, conflictedFields } = conflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-950/60 to-slate-900 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Conflito de Sincronização Detectado</span>
                <span className="px-2 py-0.5 text-[10px] uppercase font-mono rounded-md bg-amber-500/20 text-amber-300">
                  {conflictedFields.length} campos divergentes
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                A planilha no Google Sheets foi modificada após sua última cópia local. Como deseja resolver?
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800">
            <div className="col-span-3">Campo</div>
            <div className="col-span-4 text-emerald-400">Sua Versão Local (Offline)</div>
            <div className="col-span-1 text-center">vs</div>
            <div className="col-span-4 text-sky-400">Versão no Sheets (Nuvem)</div>
          </div>

          {conflictedFields.map((field) => (
            <div
              key={field.field}
              className="grid grid-cols-12 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 items-center text-xs"
            >
              <div className="col-span-3 font-semibold text-slate-300">{field.label}</div>
              <div className="col-span-4 p-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                {field.localValue}
              </div>
              <div className="col-span-1 text-center text-slate-500">
                <ArrowRight className="w-3.5 h-3.5 mx-auto" />
              </div>
              <div className="col-span-4 p-2 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono">
                {field.remoteValue}
              </div>
            </div>
          ))}

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong>Opção Inteligente (Merge):</strong> Preserva anotações mais completas e mantém o valor mais recente para peso e altura, garantindo que nada seja perdido.
            </p>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onResolve('remote')}
            className="px-3.5 py-2 text-xs font-medium text-sky-300 bg-sky-950/40 hover:bg-sky-900/50 border border-sky-700/50 rounded-xl transition-colors cursor-pointer"
          >
            Aceitar Versão da Nuvem
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onResolve('local')}
              className="px-3.5 py-2 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-700/50 rounded-xl transition-colors cursor-pointer"
            >
              Sobrescrever com Local
            </button>
            <button
              type="button"
              onClick={() => {
                // Smart merge
                const merged: ChildAccount = {
                  ...remoteProfile,
                  ...localProfile,
                  // Keep highest or newest
                  weightKg: localProfile.weightKg || remoteProfile.weightKg,
                  heightCm: localProfile.heightCm || remoteProfile.heightCm,
                  notes: `${localProfile.notes || ''} | ${remoteProfile.notes || ''}`.trim(),
                  lastUpdated: new Date().toISOString(),
                };
                onResolve('merge', merged);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <GitMerge className="w-4 h-4" />
              <span>Mesclar Inteligente (Merge)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
