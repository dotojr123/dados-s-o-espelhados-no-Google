import React, { useState, useEffect } from 'react';
import { ChildGrowthRecord, ChildAccount } from '../types';
import { childProfilesService } from '../childProfilesService';
import {
  TrendingUp,
  Plus,
  Scale,
  Ruler,
  Calendar,
  Sparkles,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

interface GrowthHistoryTimelineProps {
  child: ChildAccount;
  spreadsheetId: string;
  onRecordAdded?: () => void;
}

export const GrowthHistoryTimeline: React.FC<GrowthHistoryTimelineProps> = ({
  child,
  spreadsheetId,
  onRecordAdded,
}) => {
  const [history, setHistory] = useState<ChildGrowthRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // New record form state
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const records = await childProfilesService.getGrowthHistory(child.id, spreadsheetId);
      // Sort newest first
      records.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      setHistory(records);
    } catch (err) {
      console.warn('Erro ao carregar histórico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [child.id, spreadsheetId]);

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight && !height) return;

    setSaving(true);
    try {
      const newRecord: ChildGrowthRecord = {
        id: `meas_${Date.now()}`,
        childId: child.id,
        childName: child.name,
        recordedAt: new Date().toISOString(),
        weightKg: weight,
        heightCm: height,
        notes: notes || 'Consulta de rotina',
      };

      childProfilesService.recordGrowthMeasurementLocally(newRecord);

      // Se online e com planilha vinculada, salva no Sheets
      if (spreadsheetId && navigator.onLine) {
        try {
          const { googleWorkspaceSync } = await import('../googleWorkspaceSync');
          await googleWorkspaceSync.recordGrowthMeasurement(spreadsheetId, newRecord);
        } catch (err) {
          console.warn('Erro ao gravar medição remota no Sheets:', err);
        }
      }

      setWeight('');
      setHeight('');
      setNotes('');
      setShowAddForm(false);
      await loadHistory();
      if (onRecordAdded) onRecordAdded();
    } finally {
      setSaving(false);
    }
  };

  // Stats
  const latest = history[0];
  const oldest = history[history.length - 1];

  const weightGain =
    latest && oldest && Number(latest.weightKg) && Number(oldest.weightKg)
      ? (Number(latest.weightKg) - Number(oldest.weightKg)).toFixed(1)
      : null;

  const heightGrowth =
    latest && oldest && Number(latest.heightCm) && Number(oldest.heightCm)
      ? (Number(latest.heightCm) - Number(oldest.heightCm)).toFixed(1)
      : null;

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              Histórico & Gráfico de Crescimento (Versionamento)
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-300">
              baby-history
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cada pesagem e estatura é arquivada como um registro versionado no Google Sheets, preservando a evolução temporal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadHistory}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
            title="Recarregar histórico"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Medição</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Peso Atual</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {latest?.weightKg ? `${latest.weightKg} kg` : 'Sem registro'}
            </div>
            {weightGain && Number(weightGain) > 0 && (
              <div className="text-[11px] text-emerald-400 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>+{weightGain} kg desde o início</span>
              </div>
            )}
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Estatura Atual</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {latest?.heightCm ? `${latest.heightCm} cm` : 'Sem registro'}
            </div>
            {heightGrowth && Number(heightGrowth) > 0 && (
              <div className="text-[11px] text-sky-400 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>+{heightGrowth} cm desde o início</span>
              </div>
            )}
          </div>
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Ruler className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Total de Consultas</div>
            <div className="text-xl font-bold text-white mt-0.5">{history.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">Registros versionados</div>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Add Measurement Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddMeasurement}
          className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              Adicionar Nova Medição / Consulta
            </h4>
            <span className="text-[11px] text-slate-400">Gravado na aba baby-history</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Peso (kg)</label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Ex: 8.2"
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Altura (cm)</label>
              <input
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="Ex: 71"
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Notas / Marco</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Consulta 6º mês, vacinas em dia"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Salvar Medição</span>
            </button>
          </div>
        </form>
      )}

      {/* Chronological Timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Linha do Tempo de Medições ({history.length})
        </h4>

        {history.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            Nenhuma medição versionada registrada para este bebê ainda.
          </div>
        ) : (
          <div className="relative pl-6 border-l border-slate-800 space-y-4">
            {history.map((record, index) => (
              <div key={record.id} className="relative group">
                {/* Timeline bullet */}
                <div
                  className={`absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 ${
                    index === 0
                      ? 'bg-emerald-400 border-slate-900 ring-4 ring-emerald-500/20'
                      : 'bg-slate-700 border-slate-900'
                  }`}
                />

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 group-hover:border-slate-700 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{record.notes || 'Consulta'}</span>
                      {index === 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">
                          Mais Recente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(record.recordedAt).toLocaleDateString()} &bull; {new Date(record.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-6 text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Scale className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Peso: <strong className="text-white">{record.weightKg} kg</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Ruler className="w-3.5 h-3.5 text-sky-400" />
                      <span>Altura: <strong className="text-white">{record.heightCm} cm</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
