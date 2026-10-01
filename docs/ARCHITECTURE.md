# Arquitetura Técnica & Design de Conexão — BabySync Workspace 🏗️

Este documento descreve detalhadamente o design estrutural do **BabySync Workspace**, os contratos de comunicação entre a interface do usuário (Front-end), a camada de orquestração de serviços (API/Gateway) e os ecossistemas do **Firebase** e **Google Workspace**.

---

## 1. Topologia de Conexão

```text
 ┌────────────────────────────────────────────────────────┐
 │                      FRONT-END                         │
 │               (React 19 + TypeScript)                  │
 └──────────────┬──────────────────────────┬──────────────┘
                │                          │
        1. Login Popup             3. Sincronização REST
        (OAuth 2.0 Token)          (Fetch Nativo / Bearer)
                │                          │
                ▼                          ▼
 ┌───────────────────────────┐  ┌─────────────────────────┐
 │   Firebase Authentication │  │    Google Workspace     │
 │  • GoogleAuthProvider     │  │  • Google Sheets API v4 │
 │  • Credenciais Federadas  │  │  • Google Drive API v3  │
 │  • Scopes Delegados       │  │  • Google Calendar API  │
 └───────────────────────────┘  └─────────────────────────┘
                ▲                          ▲
                │                          │
                │     4. Proxy & Schemas   │
                └──────────┬───────────────┘
                           │
 ┌─────────────────────────┴──────────────────────────────┐
 │                     BACK-END                           │
 │             (Express API Gateway / Node.js)            │
 │ • Validação e Formatação de Linhas                     │
 │ • Tratamento de Fila de Pendências                     │
 │ • Especificação OpenAPI 3.0.3 Integrada                │
 └────────────────────────────────────────────────────────┘
```

---

## 2. Máquina de Estados da Sincronização Offline-First

O motor `childProfilesService` opera sob uma máquina de estados finitos orientada a eventos para garantir que dados nunca sejam perdidos:

```text
                       [Edição no Formulário]
                                 │
                                 ▼
                     [Gravação Imediata no Cache]
                   (localStorage: baby_cache_{id})
                                 │
                 Tem Conexão à Internet e Planilha?
                                ╱ ╲
                             SIM   NÃO
                             ╱       ╲
                            ▼         ▼
                [Chamada REST Sheets] [Adicionar à Fila]
                         │           (baby_pending_queue)
                    Sucesso?                   │
                      ╱ ╲                      ▼
                   SIM   NÃO            [Aguardar Rede]
                   ╱       ╲                   │
                  ▼         ▼            [window.online]
       [Remover da Fila] [Empurrar p/ Fila]    │
                  │                            ▼
                  └─────────► [Drenar Fila (flushQueue)]
```

### Regras de Resolução de Conflitos
1. **Timestamp Baseado em ISO-8601**: Toda atualização embute a coluna `Última Sincronização` com precisão de milissegundos.
2. **Identificador Chave Primária**: O campo `id` da criança é único. Durante o `saveChildProfile`, o serviço lê a coluna `A` (`baby-profile!A2:A100`) para identificar se a criança já existe em uma linha específica. Se existir na linha `N`, executa `PUT baby-profile!AN:JN`. Caso contrário, invoca `POST baby-profile!A:J:append`.

---

## 3. Estrutura do Google Sheets como Banco de Dados

A planilha criada automaticamente no Google Drive possui a aba `baby-profile` com a seguinte modelagem tabular:

| Coluna | Nome do Campo | Tipo de Dado | Exemplo | Descrição |
|---|---|---|---|---|
| **A** | `ID` | String (PK) | `baby_001` | Identificador único estável do bebê |
| **B** | `Nome` | String | `Maya Rodrigues` | Nome completo |
| **C** | `Data de Nascimento` | ISO Date | `2024-04-15` | Data no formato YYYY-MM-DD |
| **D** | `Gênero` | Enum String | `Feminino` | Feminino, Masculino, Outro |
| **E** | `Tipo Sanguíneo` | Enum String | `O+` | Tipagem ABO e Rh |
| **F** | `Peso (kg)` | Decimal String | `7.8` | Peso corporal recente |
| **G** | `Altura (cm)` | Integer String | `68` | Estatura corporal em centímetros |
| **H** | `Notas / Cuidados` | Long Text | `Alérgica a amendoim` | Informações clínicas e observações |
| **I** | `Contato de Emergência`| String | `(11) 98765-4321` | Telefone ou nome do médico pediatra |
| **J** | `Última Sincronização` | ISO Datetime | `2026-10-01T04:20:00Z` | Carimbo de data/hora da gravação |

---

## 4. Política de Armazenamento e Ciclo de Vida do Token

1. **Obtenção**: Quando o usuário clica em `Conectar Google`, o Firebase dispara `signInWithPopup(auth, provider)`.
2. **Captura**: O token retornado em `credential.accessToken` é gravado na variável em memória `cachedAccessToken`.
3. **Escopo de Sessão**: Para evitar falhas ao recarregar a aba mantendo conformidade com as diretrizes do navegador, uma cópia volátil pode ser temporariamente referenciada durante a navegação.
4. **Desconexão (Logout)**: Ao executar `logout()`, `cachedAccessToken` é limpo imediatamente e a sessão do Firebase é encerrada via `signOut(firebaseAuth)`.

---

## 5. Diretriz de Confirmação Explícita para Mutações

Conforme os padrões de segurança do Google Workspace:
- Operações que alteram linhas já existentes ou atualizam dados do usuário disparam um componente modal de confirmação (`ConfirmationModal.tsx`).
- O usuário é informado sobre qual registro será afetado e precisa clicar explicitamente em `Salvar no Sheets` antes que o payload REST seja transmitido.
