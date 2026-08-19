# Integração do onboarding V1

## Objetivo

Adequar o onboarding ao scaffold real do time, acrescentar o nome obrigatório do responsável e aplicar provisoriamente a direção visual C, sem alterar o servidor.

## Estrutura

- Mover `client/app` para `client/src/app`.
- Mover `client/components` para `client/src/components`.
- Mover `client/lib` para `client/src/lib`.
- Configurar o alias `@/*` para `client/src/*`.
- Manter `client/tests` e `client/supabase` em suas posições atuais.
- Não modificar nenhum arquivo em `server/`.

## Dados e fluxo

O formulário terá cinco campos: nome do restaurante, nome do responsável, endereço, WhatsApp e insumos frequentes opcionais. A Server Action validará os quatro campos obrigatórios e persistirá o responsável como `responsible_name`.

A migration inicial da tabela `restaurants` incluirá `responsible_name text not null` com verificação contra texto vazio. A normalização existente de WhatsApp para `+55DDDNÚMERO` será preservada.

## Direção visual C

- Estética utilitária premium, provisória e concentrada no CSS.
- Fundo verde-claro suave e superfícies claras.
- Verde profundo para marca, títulos e botão principal.
- Tipografia editorial nos títulos e sans-serif legível no formulário.
- Campos agrupados em blocos com bordas, sem novos componentes.
- Mais espaço entre introdução, título, campos e ação.
- Botão largo, de alto contraste, com sombra gráfica cítrica e estados acessíveis.
- Layout responsivo em uma coluna nas telas menores.

## Erros e acessibilidade

O nome do responsável será obrigatório no navegador e validado novamente no servidor. Mensagens existentes de sucesso, validação, configuração e falha do Supabase serão mantidas. Labels, foco visível, `aria-live` e redução de movimento continuarão presentes.

## Verificação

- Testes da normalização de WhatsApp passam.
- Lint e build de produção passam a partir de `client/`.
- A página renderiza pelo App Router em `client/src/app`.
- Inspeção no navegador confirma os cinco campos, responsividade e direção visual C.

## Fora do escopo

Mudança definitiva de marca, autenticação, alterações no servidor, dashboard, geocodificação e integrações adicionais.
