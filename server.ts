import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// OpenAPI 3.0 Specification
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BabySync Workspace REST API',
    version: '1.0.0',
    description:
      'API de orquestração resiliente para sincronização em segundo plano entre Firebase Auth, Google Sheets, Google Drive e Google Calendar com suporte Offline-First.',
    contact: {
      name: 'BabySync Architecture Team',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Servidor Local / Gateway da Aplicação',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Verificação de integridade do sistema',
        description: 'Retorna o status operacional do backend e ambiente.',
        responses: {
          '200': {
            description: 'Sistema operacional',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptime: { type: 'number', example: 120.4 },
                    environment: { type: 'string', example: 'development' },
                    timestamp: { type: 'string', example: '2026-10-01T04:15:00Z' },
                    version: { type: 'string', example: '1.0.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/workspace/status': {
      get: {
        summary: 'Status dos serviços do Google Workspace',
        description: 'Informa os escopos OAuth requeridos e status das integrações.',
        responses: {
          '200': {
            description: 'Status dos escopos e serviços suportados',
          },
        },
      },
    },
    '/sync/child-profile': {
      post: {
        summary: 'Validar e sincronizar perfil de criança',
        description:
          'Recebe os dados do perfil, valida a integridade dos campos e prepara o payload para o Google Sheets.',
        parameters: [
          {
            name: 'Authorization',
            in: 'header',
            required: false,
            description: 'Bearer token do Google Workspace (opcional se salvar apenas localmente)',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['child', 'spreadsheetId'],
                properties: {
                  spreadsheetId: { type: 'string', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
                  child: {
                    type: 'object',
                    required: ['id', 'name', 'birthdate', 'gender', 'bloodType'],
                    properties: {
                      id: { type: 'string', example: 'baby_001' },
                      name: { type: 'string', example: 'Maya Rodrigues' },
                      birthdate: { type: 'string', example: '2024-04-15' },
                      gender: { type: 'string', example: 'Feminino' },
                      bloodType: { type: 'string', example: 'O+' },
                      weightKg: { type: 'string', example: '7.8' },
                      heightCm: { type: 'string', example: '68' },
                      notes: { type: 'string', example: 'Alérgica a amendoim' },
                      emergencyContact: { type: 'string', example: '(11) 98765-4321' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Perfil validado e formatado com sucesso',
          },
          '400': {
            description: 'Erro de validação nos campos obrigatórios',
          },
        },
      },
    },
    '/sync/flush-queue': {
      post: {
        summary: 'Processar lote da fila offline',
        description:
          'Recebe uma lista de registros represados no localStorage e valida o lote para descarregamento no Sheets.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: { type: 'object' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Lote processado',
          },
        },
      },
    },
    '/workspace/sheets/query': {
      post: {
        summary: 'Consultar dados de uma planilha no Google Sheets',
        description: 'Proxy backend para leitura segura de planilhas usando o Bearer Token do cliente.',
        parameters: [
          {
            name: 'Authorization',
            in: 'header',
            required: true,
            description: 'Bearer <token> OAuth do usuário',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['spreadsheetId', 'range'],
                properties: {
                  spreadsheetId: { type: 'string' },
                  range: { type: 'string', example: 'baby-profile!A1:J10' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Dados da planilha retornados' },
          '401': { description: 'Token ausente ou inválido' },
        },
      },
    },
  },
};

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'BabySync Workspace Backend Engine',
  });
});

// OpenAPI Spec endpoint
app.get('/api/docs/openapi.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// Workspace Scopes & Integration Status
app.get('/api/workspace/status', (req: Request, res: Response) => {
  res.json({
    configured: true,
    platform: 'google_workspace',
    scopes: [
      {
        id: 'drive.file',
        url: 'https://www.googleapis.com/auth/drive.file',
        description: 'Acesso apenas aos arquivos criados pelo app no Google Drive',
        status: 'active',
      },
      {
        id: 'spreadsheets',
        url: 'https://www.googleapis.com/auth/spreadsheets',
        description: 'Leitura e escrita de tabelas de bebês e registros',
        status: 'active',
      },
      {
        id: 'calendar.events',
        url: 'https://www.googleapis.com/auth/calendar.events',
        description: 'Agendamento de consultas pediátricas e vacinas',
        status: 'active',
      },
    ],
    features: {
      offlineFirst: true,
      localStorageBackup: true,
      backgroundSyncQueue: true,
      restProxyEnabled: true,
    },
  });
});

// Validate & Process Child Profile Sync
app.post('/api/sync/child-profile', (req: Request, res: Response) => {
  const { child, spreadsheetId } = req.body || {};

  if (!child || !child.id || !child.name) {
    return res.status(400).json({
      error: 'Payload inválido: Campos id e name do perfil da criança são obrigatórios.',
      timestamp: new Date().toISOString(),
    });
  }

  // Prepara as colunas normalizadas para a planilha
  const timestamp = new Date().toISOString();
  const rowData = [
    child.id,
    child.name,
    child.birthdate || '',
    child.gender || '',
    child.bloodType || '',
    child.weightKg || '',
    child.heightCm || '',
    child.notes || '',
    child.emergencyContact || '',
    timestamp,
  ];

  res.json({
    success: true,
    message: 'Perfil validado e formatado com sucesso para persistência.',
    preparedRow: rowData,
    targetSheet: 'baby-profile',
    spreadsheetId: spreadsheetId || null,
    syncedAt: timestamp,
  });
});

// Process Offline Queue Batch
app.post('/api/sync/flush-queue', (req: Request, res: Response) => {
  const { items } = req.body || {};

  if (!Array.isArray(items)) {
    return res.status(400).json({
      error: 'Parâmetro "items" deve ser um array de requisições pendentes.',
    });
  }

  const validatedItems = items.map((item, index) => {
    const isValid = Boolean(item && item.child && item.child.id);
    return {
      index,
      id: item?.id || `item_${index}`,
      valid: isValid,
      childId: item?.child?.id,
      preparedAt: new Date().toISOString(),
    };
  });

  res.json({
    success: true,
    totalReceived: items.length,
    validItemsCount: validatedItems.filter((i) => i.valid).length,
    results: validatedItems,
  });
});

// Proxy for Google Sheets Query
app.post('/api/workspace/sheets/query', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Cabeçalho Authorization com Bearer token do Workspace é obrigatório.',
    });
  }

  const { spreadsheetId, range } = req.body || {};
  if (!spreadsheetId || !range) {
    return res.status(400).json({
      error: 'spreadsheetId e range são obrigatórios.',
    });
  }

  try {
    const googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`;

    const googleRes = await fetch(googleUrl, {
      method: 'GET',
      headers: { Authorization: authHeader },
    });

    const data = await googleRes.json();
    if (!googleRes.ok) {
      return res.status(googleRes.status).json({
        error: data.error?.message || 'Falha ao consultar Google Sheets API',
        googleError: data.error,
      });
    }

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      error: 'Erro interno ao consultar Google Sheets API',
      message: err.message,
    });
  }
});

// -------------------------------------------------------------
// Vite Middleware / Production Static Server
// -------------------------------------------------------------
async function setupServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BabySync] Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
    console.log(`[BabySync] API Documentation available at http://0.0.0.0:${PORT}/api/docs/openapi.json`);
  });
}

setupServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
