import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  Play,
  FileText,
  Server,
  Database,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  authRequired: boolean;
  description: string;
  sampleBody?: object;
  curlExample: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/health',
    summary: 'Health check do Backend & Uptime',
    authRequired: false,
    description: 'Retorna a integridade operacional do servidor Express, uptime e versão.',
    curlExample: 'curl -X GET http://localhost:3000/api/health',
  },
  {
    method: 'GET',
    path: '/api/workspace/status',
    summary: 'Status dos Escopos e Serviços Google Workspace',
    authRequired: false,
    description: 'Informa os escopos OAuth 2.0 ativos (drive.file, spreadsheets, calendar.events) e capacidades.',
    curlExample: 'curl -X GET http://localhost:3000/api/workspace/status',
  },
  {
    method: 'POST',
    path: '/api/sync/child-profile',
    summary: 'Validar e Formatar Perfil para Google Sheets',
    authRequired: false,
    description: 'Recebe o payload do formulário do bebê, valida campos obrigatórios e formata a linha tabular com timestamp.',
    sampleBody: {
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      child: {
        id: 'baby_001',
        name: 'Maya Rodrigues',
        birthdate: '2024-04-15',
        gender: 'Feminino',
        bloodType: 'O+',
        weightKg: '7.8',
        heightCm: '68',
        notes: 'Alérgica a amendoim',
        emergencyContact: '(11) 98765-4321',
      },
    },
    curlExample: `curl -X POST http://localhost:3000/api/sync/child-profile \\
  -H "Content-Type: application/json" \\
  -d '{"spreadsheetId":"1BxiMVs...","child":{"id":"baby_001","name":"Maya Rodrigues","birthdate":"2024-04-15","gender":"Feminino","bloodType":"O+"}}'`,
  },
  {
    method: 'POST',
    path: '/api/sync/flush-queue',
    summary: 'Processar Lote da Fila Offline',
    authRequired: false,
    description: 'Valida um lote de requisições que estavam represadas no localStorage durante o modo desconectado.',
    sampleBody: {
      items: [
        {
          id: 'queue_1727760000_abc',
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          child: {
            id: 'baby_001',
            name: 'Maya Rodrigues',
            birthdate: '2024-04-15',
            gender: 'Feminino',
            bloodType: 'O+',
          },
          queuedAt: '2026-10-01T04:10:00Z',
        },
      ],
    },
    curlExample: `curl -X POST http://localhost:3000/api/sync/flush-queue \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"id":"q1","child":{"id":"baby_001","name":"Maya Rodrigues"}}] }'`,
  },
  {
    method: 'GET',
    path: '/api/docs/openapi.json',
    summary: 'Especificação OpenAPI 3.0.3 (JSON)',
    authRequired: false,
    description: 'Retorna a especificação OpenAPI 3.0 completa para consumo no Swagger, Postman ou geradores de SDK.',
    curlExample: 'curl -X GET http://localhost:3000/api/docs/openapi.json',
  },
];

export const ApiDocsViewer: React.FC = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(ENDPOINTS[0]);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestEndpoint = async (ep: Endpoint) => {
    setTesting(true);
    setTestResult(null);

    try {
      let res: Response;
      if (ep.method === 'GET') {
        res = await fetch(ep.path);
      } else {
        res = await fetch(ep.path, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ep.sampleBody || {}),
        });
      }

      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResult(`Erro ao executar requisição: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                REST API v1.0.0
              </span>
              <span className="px-2 py-0.5 text-xs rounded-md bg-indigo-500/20 text-indigo-300 font-mono">
                OpenAPI 3.0.3
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-2">
              Documentação Oficial da API & Conexão Front ↔ Back
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Especificação interativa dos endpoints disponíveis no backend Express que conectam a interface React aos serviços do Google Workspace e orquestram a sincronização de dados.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/docs/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ver OpenAPI JSON</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
        {/* Left: Endpoint List */}
        <div className="lg:col-span-4 border-r border-slate-800 p-4 space-y-2 bg-slate-950/40">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-3">
            Endpoints Disponíveis
          </div>
          {ENDPOINTS.map((ep) => {
            const isSelected = selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method;
            return (
              <button
                key={`${ep.method}-${ep.path}`}
                onClick={() => {
                  setSelectedEndpoint(ep);
                  setTestResult(null);
                }}
                className={`w-full text-left p-3 rounded-xl transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-indigo-500/50 shadow-md'
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                      ep.method === 'GET'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="font-mono text-xs text-slate-200 truncate">{ep.path}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{ep.summary}</div>
              </button>
            );
          })}

          <div className="mt-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2 text-slate-400">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>Base URL</span>
            </div>
            <code className="block bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[11px] text-slate-300">
              http://localhost:3000/api
            </code>
          </div>
        </div>

        {/* Right: Endpoint Details & Interactive Test */}
        <div className="lg:col-span-8 p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${
                    selectedEndpoint.method === 'GET'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {selectedEndpoint.method}
                </span>
                <span className="font-mono text-base font-semibold text-white">
                  {selectedEndpoint.path}
                </span>
              </div>

              <button
                onClick={() => handleTestEndpoint(selectedEndpoint)}
                disabled={testing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testando...' : 'Testar Requisição'}</span>
              </button>
            </div>
            <p className="text-sm text-slate-300 mt-2">{selectedEndpoint.description}</p>
          </div>

          {/* cURL Example */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <span>Exemplo com cURL</span>
              <button
                onClick={() => handleCopy(selectedEndpoint.curlExample, 'curl')}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                {copiedId === 'curl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'curl' ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap">
              {selectedEndpoint.curlExample}
            </pre>
          </div>

          {/* Sample Payload */}
          {selectedEndpoint.sampleBody && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <span>Corpo da Requisição (Request Payload Schema)</span>
                <button
                  onClick={() =>
                    handleCopy(JSON.stringify(selectedEndpoint.sampleBody, null, 2), 'body')
                  }
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  {copiedId === 'body' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'body' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto">
                {JSON.stringify(selectedEndpoint.sampleBody, null, 2)}
              </pre>
            </div>
          )}

          {/* Test Live Response */}
          {testResult && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                <span>Resposta do Servidor (Live 200 OK)</span>
                <button
                  onClick={() => handleCopy(testResult, 'result')}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {copiedId === 'result' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'result' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl font-mono text-xs text-emerald-300 overflow-x-auto max-h-64 overflow-y-auto">
                {testResult}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
