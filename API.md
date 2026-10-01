# BabySync Workspace — Especificação Completa da API REST 📖

Versão: `1.0.0`  
Protocolo: `HTTP/1.1` e `HTTP/2`  
Formato de Intercâmbio: `application/json`  
Base URL: `http://localhost:3000/api` (ou a URL de produção do seu deploy)

---

## 📑 Índice
1. [Autenticação & Segurança](#1-autenticação--segurança)
2. [Tabela de Códigos de Status HTTP](#2-tabela-de-códigos-de-status-http)
3. [Endpoints do Sistema & Metadados](#3-endpoints-do-sistema--metadados)
   - `GET /api/health`
   - `GET /api/workspace/status`
   - `GET /api/docs/openapi.json`
4. [Endpoints de Sincronização & Perfis](#4-endpoints-de-sincronização--perfis)
   - `POST /api/sync/child-profile`
   - `POST /api/sync/flush-queue`
5. [Endpoints Proxy do Google Workspace](#5-endpoints-proxy-do-google-workspace)
   - `POST /api/workspace/sheets/query`
6. [Integração Front-End ↔ Back-End (Fluxo de Dados)](#6-integração-front-end--back-end-fluxo-de-dados)
7. [Exemplos com cURL e Fetch](#7-exemplos-com-curl-e-fetch)

---

## 1. Autenticação & Segurança

Os endpoints operam sob dois regimes de segurança:

1. **Públicos / Utilitários**: Endpoints como `/api/health`, `/api/workspace/status` e `/api/docs/openapi.json` não exigem credenciais.
2. **Protegidos pelo Google Workspace**: Endpoints que realizam consultas ou mutações diretas em recursos do usuário requerem o token de acesso OAuth obtido pelo Firebase Auth:

```http
Authorization: Bearer <GOOGLE_WORKSPACE_ACCESS_TOKEN>
Content-Type: application/json
```

### Escopos Necessários
- **Google Sheets**: `https://www.googleapis.com/auth/spreadsheets`
- **Google Drive**: `https://www.googleapis.com/auth/drive.file`
- **Google Calendar**: `https://www.googleapis.com/auth/calendar.events`

---

## 2. Tabela de Códigos de Status HTTP

| Código | Mensagem | Significado no BabySync |
|---|---|---|
| `200 OK` | Operação concluída com sucesso | Leitura, cálculo ou atualização realizada |
| `201 Created` | Recurso criado | Nova linha inserida ou pasta criada no Drive |
| `400 Bad Request` | Parâmetros inválidos | Faltam campos obrigatórios (ex: `child.id` ou `spreadsheetId`) |
| `401 Unauthorized` | Autenticação necessária | Token ausente, expirado ou com escopos insuficientes |
| `403 Forbidden` | Permissão negada | Usuário sem acesso à planilha especificada |
| `404 Not Found` | Não encontrado | Planilha ou pasta não localizada no Drive |
| `429 Too Many Requests` | Limite de taxa excedido | Cota da API do Google Workspace atingida temporariamente |
| `500 Internal Server Error` | Erro no servidor | Falha inesperada durante a execução |

---

## 3. Endpoints do Sistema & Metadados

### `GET /api/health`
Retorna a integridade operacional do servidor, tempo de atividade (uptime) e ambiente.

#### Resposta de Sucesso (`200 OK`)
```json
{
  "status": "ok",
  "uptime": 124.5,
  "environment": "development",
  "timestamp": "2026-10-01T04:20:00.000Z",
  "version": "1.0.0",
  "service": "BabySync Workspace Backend Engine"
}
```

---

### `GET /api/workspace/status`
Informa o estado da infraestrutura de integração com o Google Workspace e os escopos configurados.

#### Resposta de Sucesso (`200 OK`)
```json
{
  "configured": true,
  "platform": "google_workspace",
  "scopes": [
    {
      "id": "drive.file",
      "url": "https://www.googleapis.com/auth/drive.file",
      "description": "Acesso apenas aos arquivos criados pelo app no Google Drive",
      "status": "active"
    },
    {
      "id": "spreadsheets",
      "url": "https://www.googleapis.com/auth/spreadsheets",
      "description": "Leitura e escrita de tabelas de bebês e registros",
      "status": "active"
    },
    {
      "id": "calendar.events",
      "url": "https://www.googleapis.com/auth/calendar.events",
      "description": "Agendamento de consultas pediátricas e vacinas",
      "status": "active"
    }
  ],
  "features": {
    "offlineFirst": true,
    "localStorageBackup": true,
    "backgroundSyncQueue": true,
    "restProxyEnabled": true
  }
}
```

---

### `GET /api/docs/openapi.json`
Retorna a especificação integral compatível com **OpenAPI 3.0.3**. Pode ser importada no Postman, Insomnia ou renderizada no Swagger UI.

---

## 4. Endpoints de Sincronização & Perfis

### `POST /api/sync/child-profile`
Valida, sanitiza e formata os dados do perfil de uma criança antes de persistir no Google Sheets.

#### Cabeçalhos da Requisição
```http
Content-Type: application/json
Authorization: Bearer <TOKEN> (Opcional se operando em modo offline)
```

#### Corpo da Requisição (`application/json`)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "child": {
    "id": "baby_001",
    "name": "Maya Rodrigues",
    "birthdate": "2024-04-15",
    "gender": "Feminino",
    "bloodType": "O+",
    "weightKg": "7.8",
    "heightCm": "68",
    "notes": "Alérgica a amendoim. Em introdução alimentar.",
    "emergencyContact": "(11) 98765-4321 - Dra. Camila"
  }
}
```

#### Resposta de Sucesso (`200 OK`)
```json
{
  "success": true,
  "message": "Perfil validado e formatado com sucesso para persistência.",
  "preparedRow": [
    "baby_001",
    "Maya Rodrigues",
    "2024-04-15",
    "Feminino",
    "O+",
    "7.8",
    "68",
    "Alérgica a amendoim. Em introdução alimentar.",
    "(11) 98765-4321 - Dra. Camila",
    "2026-10-01T04:20:15.123Z"
  ],
  "targetSheet": "baby-profile",
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "syncedAt": "2026-10-01T04:20:15.123Z"
}
```

#### Resposta de Erro de Validação (`400 Bad Request`)
```json
{
  "error": "Payload inválido: Campos id e name do perfil da criança são obrigatórios.",
  "timestamp": "2026-10-01T04:20:15.123Z"
}
```

---

### `POST /api/sync/flush-queue`
Valida e processa um lote de mutações pendentes gravadas no cliente enquanto estava desconectado.

#### Corpo da Requisição (`application/json`)
```json
{
  "items": [
    {
      "id": "queue_1727760000_a1b2",
      "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      "child": {
        "id": "baby_001",
        "name": "Maya Rodrigues",
        "birthdate": "2024-04-15",
        "gender": "Feminino",
        "bloodType": "O+"
      },
      "queuedAt": "2026-10-01T04:10:00.000Z"
    }
  ]
}
```

#### Resposta de Sucesso (`200 OK`)
```json
{
  "success": true,
  "totalReceived": 1,
  "validItemsCount": 1,
  "results": [
    {
      "index": 0,
      "id": "queue_1727760000_a1b2",
      "valid": true,
      "childId": "baby_001",
      "preparedAt": "2026-10-01T04:20:30.000Z"
    }
  ]
}
```

---

## 5. Endpoints Proxy do Google Workspace

### `POST /api/workspace/sheets/query`
Realiza a consulta segura em uma planilha do Google Sheets através do backend utilizando o token do cliente.

#### Cabeçalhos da Requisição
```http
Authorization: Bearer <WORKSPACE_ACCESS_TOKEN>
Content-Type: application/json
```

#### Corpo da Requisição (`application/json`)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "range": "baby-profile!A1:J10"
}
```

#### Resposta de Sucesso (`200 OK`)
```json
{
  "range": "baby-profile!A1:J10",
  "majorDimension": "ROWS",
  "values": [
    ["ID", "Nome", "Data de Nascimento", "Gênero", "Tipo Sanguíneo", "Peso (kg)", "Altura (cm)", "Notas / Cuidados", "Contato de Emergência", "Última Sincronização"],
    ["baby_001", "Maya Rodrigues", "2024-04-15", "Feminino", "O+", "7.8", "68", "Alérgica a amendoim", "(11) 98765-4321", "2026-10-01T04:15:00.000Z"]
  ]
}
```

---

## 6. Integração Front-End ↔ Back-End (Fluxo de Dados)

1. **Obtenção do Token**: O usuário clica em `Conectar Google` no Front-end (`src/authService.ts`). O Firebase Auth abre a janela de consentimento e devolve o `accessToken`.
2. **Armazenamento Volátil**: O token é guardado em memória (`cachedAccessToken`).
3. **Escrita no Sheets**:
   - `childProfilesService.saveChildProfile(child, spreadsheetId)`:
   - Grava instantaneamente no cache local `localStorage.setItem('baby_cache_' + id, ...)`.
   - Se online, invoca `googleWorkspaceSync.updateSheetData(spreadsheetId, 'baby-profile!A2:J2', values)`.
   - Se a rede oscilar, empurra para a fila `baby_pending_queue`.
4. **Leitura do Sheets**:
   - Se houver conexão, busca `baby-profile!A2:J100` via Sheets API v4.
   - Atualiza o cache local com os dados remotos.
   - Em caso de falha de conexão, devolve os dados locais sem que o usuário note lentidão.

---

## 7. Exemplos com cURL e Fetch

### Exemplo 1: Verificar Saúde do Backend (cURL)
```bash
curl -X GET http://localhost:3000/api/health \
  -H "Accept: application/json"
```

### Exemplo 2: Validar Perfil de Bebê (cURL)
```bash
curl -X POST http://localhost:3000/api/sync/child-profile \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "child": {
      "id": "baby_002",
      "name": "Noah Albuquerque",
      "birthdate": "2023-11-20",
      "gender": "Masculino",
      "bloodType": "A+"
    }
  }'
```

### Exemplo 3: Requisição Nativa via JavaScript / TypeScript (Fetch)
```typescript
const response = await fetch('/api/sync/child-profile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    child: {
      id: 'baby_001',
      name: 'Maya Rodrigues',
      birthdate: '2024-04-15',
      gender: 'Feminino',
      bloodType: 'O+',
    },
  }),
});

const data = await response.json();
console.log('Resposta do Backend:', data);
```
