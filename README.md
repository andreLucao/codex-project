# codex-project

Aplicação com cliente Next.js e servidor Express. O servidor expõe uma busca
assíncrona de fornecedores no Google Maps através do Actor da Apify
`compass/crawler-google-places`.

## Configuração do servidor

Copie `server/.env.example` para `server/.env` e informe um token da Apify:

```env
APIFY_TOKEN=your_apify_token
PORT=4000
CLIENT_ORIGIN=http://localhost:3000
```

O token é lido somente pelo Express; não use uma variável `NEXT_PUBLIC_*` para
ele. Inicie o servidor com `npm run dev` dentro de `server/`.

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
