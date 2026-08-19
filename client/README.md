# Onboarding de restaurante

1. Execute `npm install` dentro de `client/`.
2. Inicie o backend e o PostgreSQL conforme `../server/README.md`.
3. Copie `.env.example` para `.env.local`.
4. Execute `npm run dev`.

O formulário usa uma Server Action para enviar o cadastro ao endpoint
`POST /api/users`; a URL interna é configurada por `SERVER_API_URL`.
