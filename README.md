# ChatGuru MCP Server

MCP (Model Context Protocol) server para integração com o ChatGuru WhatsApp. Permite que assistentes AI (Claude Code, Claude Desktop, etc.) enviem mensagens, leiam conversas e gerenciem contatos no ChatGuru.

> **Credenciais são pessoais.** Cada pessoa usa sua própria API Key do ChatGuru. Nenhuma credencial está incluída neste repositório.

## Funcionalidades

- **Mensagens**: enviar texto, arquivos via URL, verificar status de entrega
- **Contatos**: registrar novos chats, atualizar campos customizados, nome e contexto
- **Notas**: adicionar notas internas em conversas
- **Fluxos**: executar diálogos/fluxos automatizados
- **Leitura**: ler histórico de mensagens, listar chats com filtros avançados
- **Scraping (Playwright)**: buscar contatos existentes via UI (fallback para endpoints não disponíveis na API)

## Pré-requisitos

- Node.js 18+
- Conta no ChatGuru com acesso à API
- Credenciais: API Key, Account ID, Phone ID e número do Server (peça ao admin da conta)

## Como usar

### 1. Clonar e instalar

```bash
git clone https://github.com/ericluciano/chatguru-mcp.git
cd chatguru-mcp
npm install
```

### 2. Configurar suas credenciais

```bash
cp .env.example .env
# Abra o .env e preencha com suas credenciais do ChatGuru
```

As credenciais estão disponíveis em: **ChatGuru > Configurações > Celulares**

### 3. Registrar no Claude Desktop

Edite `C:\Users\SeuUsuario\AppData\Roaming\Claude\claude_desktop_config.json` e adicione:

```json
{
  "mcpServers": {
    "chatguru": {
      "command": "node",
      "args": ["C:\\caminho\\para\\chatguru-mcp\\index.js"],
      "env": {
        "CHATGURU_API_KEY": "sua_chave_aqui",
        "CHATGURU_ACCOUNT_ID": "seu_account_id_aqui",
        "CHATGURU_PHONE_ID": "seu_phone_id_aqui",
        "CHATGURU_SERVER": "17"
      }
    }
  }
}
```

> Substitua os valores pelos da **sua conta**. Esse arquivo fica apenas na sua máquina.

### 4. Reiniciar o Claude Desktop

Feche e reabra o Claude Desktop para carregar o MCP.

### Login Playwright (opcional)

Para funcionalidades que usam scraping da UI do ChatGuru:

```bash
npm run login
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia o MCP server |
| `npm run login` | Login no ChatGuru via Playwright |
| `npm run setup` | Setup interativo inicial |

## Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `chatguru_send_message` | Envia mensagem de texto para um contato |
| `chatguru_send_file` | Envia arquivo via URL |
| `chatguru_get_message_status` | Verifica status de entrega de uma mensagem |
| `chatguru_register_chat` | Registra um novo contato/chat |
| `chatguru_get_chat_status` | Verifica status de registro de um chat |
| `chatguru_update_custom_fields` | Atualiza campos customizados de um contato |
| `chatguru_update_chat_name` | Atualiza o nome de um contato |
| `chatguru_update_context` | Atualiza o contexto/tag de uma conversa |
| `chatguru_add_note` | Adiciona nota interna em uma conversa |
| `chatguru_execute_dialog` | Executa um fluxo/diálogo automatizado |
| `chatguru_get_chat_link` | Busca link/dados de um chat existente (Playwright) |
| `chatguru_read_messages` | Lê histórico de mensagens de uma conversa |
| `chatguru_list_chats` | Lista chats com filtros avançados |

## Segurança

- Credenciais via variáveis de ambiente — nunca commitadas no repositório
- `.env` está no `.gitignore`
- `session.json` (cache do Playwright) está no `.gitignore`

## Licença

MIT
