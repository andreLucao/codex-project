# Backend

## Banco local e Prisma

Com Docker em execucao, rode dentro de `server/`:

```bash
npm run db:up
npm run db:migrate -- --name init
npm run dev
```

O PostgreSQL fica disponivel em `localhost:5432`. A API usa a URL definida em
`DATABASE_URL` e valida a conexao antes de começar a escutar na porta 4000.

Para verificar a API e o banco:

```bash
curl http://localhost:4000/api/health
```

## Cadastro e contexto do agente

O onboarding grava ou atualiza um usuário pelo número de WhatsApp:

```bash
curl -X POST http://localhost:4000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"restaurantName":"Cantina do Bairro","responsibleName":"Ana","address":"Rua das Flores, 10, Sao Paulo","whatsapp":"+5511999999999","frequentSupplies":["Mussarela","Tomate"]}'
```

O agente pode carregar o perfil cadastrado usando o mesmo número recebido pelo
webhook. A resposta é estruturada e pronta para ser anexada ao contexto do modelo:

```bash
curl 'http://localhost:4000/api/users/context?whatsapp=5511999999999'
```

O serviço também exporta `getUserContextByWhatsapp` para agentes executados no
mesmo processo. Proteja as rotas de contexto e histórico com autenticação antes
de expor a API publicamente, pois elas retornam dados pessoais.

Comandos uteis:

```bash
npm run db:studio    # interface visual do Prisma
npm run db:logs      # logs do PostgreSQL
npm run db:down      # encerra o container sem apagar os dados
npm run db:generate  # regenera o Prisma Client apos mudar o schema
```

O volume `postgres_data` preserva os dados entre reinicializacoes. Para trocar
usuario, senha ou banco, mantenha `compose.yaml` e `DATABASE_URL` sincronizados.
