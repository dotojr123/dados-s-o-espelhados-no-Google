# BabySync Workspace 🍼☁️
> **Orquestrador de Sincronização Resiliente em Segundo Plano: Firebase Auth + Google Sheets + Google Drive + Google Calendar + Cache Offline-First.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg?logo=express)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Google Workspace](https://img.shields.io/badge/Google%20Workspace-Sheets%20%7C%20Drive%20%7C%20Calendar-4285F4.svg?logo=google)](https://workspace.google.com/)
[![Firebase Auth](https://img.shields.io/badge/Firebase-Auth%20OAuth2.0-FFCA28.svg?logo=firebase)](https://firebase.google.com/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-CSS%204.x-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## 📋 Sumário Executivo

O **BabySync Workspace** é uma solução de nível empresarial para rastreamento de perfis infantis e registros pediátricos. Ele conecta de ponta a ponta o **Front-end (React 19 + TypeScript)** a uma camada de **API Gateway Backend (Node.js/Express)** e aos serviços do **Google Workspace (Sheets, Drive, Calendar)** via autenticação segura **Firebase Auth OAuth 2.0**.

Sua arquitetura é baseada no princípio **Offline-First com Resiliência**:
1. O usuário edita ou consulta perfis com latência zero via cache instantâneo local (`localStorage`).
2. Quando conectado à internet, o motor de segundo plano (`googleWorkspaceSync.ts` / `/api/sync`) empurra as atualizações diretamente para o **Google Sheets**, que atua como **Fonte Única da Verdade (Single Source of Truth - SSOT)**.
3. Se o dispositivo estiver offline (queda de sinal, túnel, avião), os dados são enfileirados em uma fila de pendências (`baby_pending_queue`) e enviados automaticamente assim que a conexão for restabelecida.

---

## 🏛️ Visão Geral da Arquitetura

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         NAVEGADOR / CLIENTE                            │
 │                                                                        │
 │  ┌────────────────────────┐         ┌───────────────────────────────┐  │
 │  │   React 19 Interface   │ ◄─────► │  childProfilesService.ts      │  │
 │  │ (Formulários, Badge,   │         │ (Orquestrador de Resiliência) │  │
 │  │  Monitor REST, Modais) │         └──────────────┬────────────────┘  │
 │  └────────────────────────┘                        │                   │
 │                ▲                                   │                   │
 │                │                   ┌───────────────┴──────────────┐    │
 │                │                   ▼                              ▼    │
 │  ┌─────────────┴──────────┐ ┌───────────────┐          ┌───────────────┐
 │  │      authService       │ │ LocalStorage  │          │ WorkspaceSync │
 │  │ (Firebase Auth Pop-up  │ │ (Cache & Fila │          │ (Fetch Nativo │
 │  │  + Token em Memória)   │ │  Pendências)  │          │  Sheets/Drive)│
 │  └────────────────────────┘ └───────────────┘          └───────┬───────┘
 └────────────────────────────────────────────────────────────────┼───────┘
                                                                  │
                                      Bearer <AccessToken>        │
                                      (Scopes: drive.file,        │
                                       spreadsheets, calendar)    │
                                                                  ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      CAMADA DE SERVIÇOS & BACKEND                      │
 │                                                                        │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │             Express API Gateway (server.ts / :3000)              │  │
 │  │  • /api/health           • /api/workspace/status                 │  │
 │  │  • /api/sync/child-profile • /api/sync/flush-queue               │  │
 │  │  • /api/docs/openapi.json• /api/workspace/sheets/query           │  │
 │  └──────────────────────────────────┬───────────────────────────────┘  │
 │                                     │                                  │
 │                                     ▼                                  │
 │  ┌─────────────────────────┬───────────────────────┬────────────────┐  │
 │  │    Google Drive API     │   Google Sheets API   │Google Calendar │  │
 │  │   Pasta: "BabySync -    │  Planilha: "BabySync- │ Agenda de      │  │
 │  │        Registros"       │   Registro Oficial"   │ Consultas &    │  │
 │  │                         │  Aba: baby-profile    │ Vacinas        │  │
 │  └─────────────────────────┴───────────────────────┴────────────────┘  │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Recursos Principais

### 1. Autenticação com Escopos Expandidos e Token em Memória
- **Menor Privilégio (Least Privilege)**:
  - `https://www.googleapis.com/auth/drive.file`: O app só enxerga arquivos e pastas criados por ele mesmo, sem acesso a outros arquivos pessoais do Drive do usuário.
  - `https://www.googleapis.com/auth/spreadsheets`: Leitura e escrita restrita a planilhas vinculadas.
  - `https://www.googleapis.com/auth/calendar.events`: Criação e visualização de eventos na agenda do usuário.
- **Segurança de Tokens**: O token OAuth é mantido preferencialmente em memória volátil durante a sessão ativa, evitando persistência desprotegida e mitigando riscos de XSS.
- **Tratamento de Cancelamento**: Interrupções voluntárias do pop-up de login (`auth/popup-closed-by-user`) ou bloqueios de navegador são capturados sem quebras na aplicação.

### 2. Motor de Sincronização REST Nativo
- Construído com `fetch` nativo no cliente e validadores de esquema no backend.
- Não depende de bibliotecas pesadas de cliente para Google APIs, mantendo o bundle leve (< 180kB gzip).
- Suporte a:
  - `GET /values/{range}`: Consulta de linhas.
  - `PUT /values/{range}?valueInputOption=USER_ENTERED`: Atualização pontual.
  - `POST /values/{range}:append`: Inserção contínua de registros.
  - Criação automática de planilhas formatadas com cabeçalhos pré-definidos (`ID`, `Nome`, `Data de Nascimento`, `Gênero`, `Tipo Sanguíneo`, `Peso`, `Altura`, `Notas`, `Contato`, `Última Sincronização`).

### 3. Camada Resiliente de Dados (Offline-First)
- **Zero-Latency UI**: Toda alteração é persistida imediatamente no cache `localStorage` com prefixo `baby_cache_`.
- **Fila de Pendências Automática**: Em modo offline, as requisições recebem status `queued` em `baby_pending_queue`.
- **Descarregamento Inteligente (Queue Flush)**: Ao detectar evento `window.online`, o serviço drena os itens pendentes para a planilha do Sheets de forma atômica.
- **Simulador de Queda de Rede**: Chave na interface para simular ambiente desconectado sem precisar desligar o Wi-Fi da máquina.

### 4. Proteção contra Operações Destrutivas (User Confirmation)
- Conforme as diretrizes oficiais de integração do Google Workspace, nenhuma mutação ou sobrescrita em planilhas ocorre de forma silenciosa. A aplicação exibe um diálogo modal de confirmação explícita com detalhes do registro antes do disparo.

---

## 📂 Estrutura de Diretórios do Projeto

```text
.
├── server.ts                    # Backend Express API & Vite dev middleware
├── package.json                 # Dependências e scripts de execução
├── tsconfig.json                # Configuração TypeScript ES2022 / React
├── vite.config.ts               # Bundler Vite com plugin Tailwind v4
├── index.html                   # HTML entry point com meta-tags sincronizadas
├── metadata.json                # Metadados e permissões da aplicação no AI Studio
├── firebase-applet-config.json  # Credenciais do cliente Firebase provisionado
├── API.md                       # Especificação completa da REST API para desenvolvedores
├── README.md                    # Documentação principal para o GitHub
├── docs/
│   ├── ARCHITECTURE.md          # Documento de arquitetura detalhada e fluxo de dados
│   └── openapi.json             # Especificação OpenAPI 3.0.3 (Swagger compatível)
└── src/
    ├── main.tsx                 # Ponto de entrada React 19
    ├── index.css                # Estilização global com Tailwind CSS
    ├── App.tsx                  # Dashboard principal, orquestrador e abas interativas
    ├── firebase.ts              # Inicialização do singleton Firebase
    ├── authService.ts           # Serviço de login Google OAuth com escopos expandidos
    ├── googleWorkspaceSync.ts   # Motor REST para Google Sheets, Drive e Calendar
    ├── childProfilesService.ts  # Camada de cache resiliente e fila offline
    ├── types.ts                 # Interfaces e tipos TypeScript de domínio
    └── components/
        ├── GoogleSignInButton.tsx # Botão oficial com especificação de marca Google
        ├── ConfirmationModal.tsx  # Diálogo de confirmação para operações destrutivas
        ├── CalendarModal.tsx      # Modal para agendar consultas no Google Calendar
        ├── SyncLogViewer.tsx      # Console de monitoramento de tráfego REST em tempo real
        └── ApiDocsViewer.tsx      # Visualizador interativo da documentação de API na UI
```

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- **Node.js**: v18.0.0 ou superior (recomendado v20+).
- **Gerenciador de Pacotes**: npm ou yarn.
- **Conta Google**: Para autenticar e vincular pastas e planilhas no Google Drive.

### 1. Clonar o Repositório
```bash
git clone https://github.com/seu-usuario/babysync-workspace.git
cd babysync-workspace
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Crie um arquivo `.env` baseado no `.env.example`:
```bash
cp .env.example .env
```
Variáveis esperadas:
```env
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
```
> As credenciais do Firebase Client já vêm pré-configuradas no arquivo `firebase-applet-config.json`.

### 4. Executar o Servidor de Desenvolvimento
```bash
npm run dev
```
O servidor Express inicializará em conjunto com o Vite em `http://localhost:3000`.

---

## 📡 Visão Rápida da API REST

A aplicação expõe uma API REST documentada sob padrão **OpenAPI 3.0.3**:

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/api/health` | Status de saúde do servidor e uptime | Pública |
| `GET` | `/api/workspace/status` | Escopos suportados e estado das integrações | Pública |
| `GET` | `/api/docs/openapi.json` | Especificação completa OpenAPI 3.0 em JSON | Pública |
| `POST` | `/api/sync/child-profile` | Validação e formatação de perfil para Sheets | Opcional |
| `POST` | `/api/sync/flush-queue` | Validação de lote represado de fila offline | Opcional |
| `POST` | `/api/workspace/sheets/query` | Consulta direta a abas do Sheets via Proxy | Bearer Token |

👉 Para conferir todos os parâmetros, payloads de requisição e cURL de exemplo, veja o [API.md](./API.md).

---

## 🔒 Segurança e Privacidade de Dados

1. **Sem Segredos Expostos no Front-end**: As chamadas REST usam o token temporário do usuário (OAuth Access Token emitido pelo Firebase Auth). Nenhuma chave privada ou client secret do Google Cloud é embutida no código do cliente.
2. **Armazenamento de Token**: O token de acesso do Workspace é armazenado na memória de execução (`cachedAccessToken`). Não há persistência de credenciais em cookies inseguros.
3. **Escopos Restritos**: Utiliza exclusivamente `drive.file`, garantindo que o aplicativo nunca tenha acesso aos dados confidenciais ou outros documentos que o usuário possua no Google Drive.
4. **Consentimento de Operação**: Toda modificação que altera dados existentes requer interação consciente do usuário via confirmação modal.

---

## 🛠️ Scripts Disponíveis

```bash
# Iniciar o servidor full-stack de desenvolvimento (Express + Vite)
npm run dev

# Compilar a aplicação para produção (Front-end Vite)
npm run build

# Executar a verificação estática de tipos TypeScript (Lint)
npm run lint

# Iniciar o servidor de produção
npm start
```

---

## 📄 Licença
Distribuído sob a licença **Apache 2.0**. Consulte o arquivo `LICENSE` para mais detalhes.
