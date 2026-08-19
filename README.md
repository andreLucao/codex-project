# Agente de compras para restaurantes

Aplicação com cliente Next.js e servidor Express. O servidor expõe uma busca
assíncrona de fornecedores no Google Maps através do Actor da Apify
`compass/crawler-google-places` e um agente de negociação de cotações.

## Fluxo do agente

1. O dono descreve item, quantidade e prazo em linguagem natural.
2. O agente usa o cadastro do restaurante no Supabase para obter a localização.
3. A busca Apify encontra até 10 fornecedores com telefone.
4. O primeiro contato é enviado pela integração direta com a WhatsApp Cloud API usando um template aprovado.
5. A primeira resposta do fornecedor abre a janela de atendimento e o agente passa a cuidar da thread.
6. Texto, áudio e imagem são convertidos em uma cotação estruturada e normalizada.
7. Ao receber cinco cotações comparáveis, o menor preço é congelado como âncora e enviado aos demais fornecedores.
8. Uma única rodada de contraoferta atualiza o ranking no Supabase Realtime.
9. O dono aprova uma oferta e somente o vencedor recebe a confirmação.

As decisões com efeitos colaterais são determinísticas. O modelo interpreta conteúdo não estruturado, mas não decide quantos fornecedores contam, não altera a âncora e não envia mensagens diretamente.

## Configuração do servidor

Copie `server/.env.example` para `server/.env` e informe um token da Apify:

```env
APIFY_TOKEN=your_apify_token
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
META_WHATSAPP_ACCESS_TOKEN=your_meta_access_token
META_WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
META_GRAPH_API_VERSION=vXX.X
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
```

O token é lido somente pelo Express; não use uma variável `NEXT_PUBLIC_*` para
ele. Inicie o servidor com `npm run dev` dentro de `server/`.

Antes de iniciar o agente, aplique `server/supabase/migrations/001_procurement_agent.sql` no projeto Supabase. A tabela de cadastro de restaurantes deve fornecer `id`, `name` e `location`; o nome pode ser configurado com `RESTAURANTS_TABLE`.

## Integração das branches

O runtime do agente concilia diretamente as duas integrações:

- a busca de fornecedores da branch Apify, configurada por `APIFY_TOKEN`;
- a implementação de WhatsApp Cloud API, configurada pelas variáveis `META_*`.

O agente estrutura a RFQ, chama a busca Apify, envia o primeiro template pela implementação de WhatsApp e passa a processar as respostas recebidas pelo webhook. Durante a janela de 24 horas, contraofertas e esclarecimentos usam mensagens de sessão; fora dela, a integração envia o template de reengajamento aprovado.

As mensagens recebidas entram em `GET/POST /api/whatsapp/webhook`, com validação do token e da assinatura `X-Hub-Signature-256`. O agente correlaciona a resposta pelo ID da mensagem original e usa o telefone como fallback.

Para testar um envio direto sem passar pelo agente, use `POST /api/whatsapp/messages` com `{ "to": "5511999999999", "message": "Olá" }` ou um payload oficial da Meta.

## API do agente

### Criar RFQ

`POST /api/agent/rfqs`

```json
{
  "requestId": "idempotency-key",
  "restaurantId": "restaurant-id",
  "message": "Preciso de 100 kg de tomate para quinta"
}
```

### Receber resposta do WhatsApp

`POST /api/agent/whatsapp-events`

```json
{
  "eventId": "webhook-event-id",
  "providerMessageId": "whatsapp-message-id",
  "restaurantId": "restaurant-id",
  "rfqId": "rfq-id",
  "rfqSupplierId": "rfq-supplier-id",
  "supplierPhone": "+5511999999999",
  "type": "text",
  "text": "Faço R$ 38 o quilo com frete incluso",
  "receivedAt": "2026-08-19T15:00:00.000Z"
}
```

Para áudio ou imagem, use `type: "audio" | "image"` e `media: { "mediaId": "...", "mimeType": "..." }`.

### Consultar e aprovar

- `GET /api/agent/rfqs/:rfqId`
- `POST /api/agent/rfqs/:rfqId/approve` com `{ "requestId": "...", "quoteId": "..." }`
- `POST /api/agent/tick` força uma passagem do worker de timeouts para desenvolvimento.

## API de busca de fornecedores

O agente (ou, futuramente, uma tool MCP) deve extrair o tipo de fornecedor e a
localização antes de chamar esta API. A API não interpreta a mensagem do dono
do restaurante.

### Iniciar busca

`POST /api/supplier-searches`

```json
{
  "supplierType": "distribuidor de hortifruti",
  "location": "Campinas, SP"
}
```

Uma solicitação válida responde com `202 Accepted`:

```json
{
  "runId": "apify-run-id",
  "status": "running"
}
```

### Consultar resultado

`GET /api/supplier-searches/:runId`

Enquanto a Apify está processando, a resposta é:

```json
{ "status": "running" }
```

Quando a execução termina, a resposta contém até 10 fornecedores normalizados:

```json
{
  "status": "succeeded",
  "suppliers": [
    {
      "id": "place-id",
      "name": "Fornecedor Exemplo",
      "address": "Rua Exemplo, 123",
      "phone": "+5511999999999",
      "website": "https://fornecedor.example",
      "rating": 4.8,
      "reviewCount": 120,
      "mapsUrl": "https://www.google.com/maps/...",
      "latitude": -22.9,
      "longitude": -47.0
    }
  ]
}
```

Uma execução encerrada sem sucesso retorna `{ "status": "failed" }`. Erros de
entrada retornam `400`, uma execução inexistente retorna `404`, token ausente
retorna `503`, e falhas de comunicação com a Apify retornam `502`.

## Verificação

Dentro de `server/`:

```bash
npm test
npm run build
```
