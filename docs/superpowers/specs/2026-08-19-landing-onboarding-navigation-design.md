# Landing e navegação do onboarding

## Objetivo

Separar a apresentação do produto do cadastro: uma landing curta em `/` introduz a proposta e leva a um wizard de três etapas em `/onboarding`.

## Rotas e navegação

- `/`: landing com hero, três benefícios e CTA “Começar cadastro”.
- `/onboarding`: wizard existente, mantendo as três etapas na mesma rota.
- O logo em ambas as páginas será um link para `/`.
- O CTA usará `Link` do Next.js e abrirá o onboarding na etapa 1.
- Voltar e continuar dentro do wizard continuarão preservando os valores digitados.

## Landing

O hero terá proposta direta para a demo, texto curto e CTA destacado. A seção seguinte exibirá três benefícios: pedido por áudio, comparação de fornecedores e respostas organizadas. Não haverá seções adicionais.

## Direção visual

- Manter a paleta Aurora em verde profundo, lima, menta e terracota.
- Usar emojis nativos de ingredientes, como 🍅, 🧀, 🥬, 🥖 e 🌶️. Dispositivos Apple renderizam esses caracteres com o estilo Apple; nenhum arquivo proprietário será incorporado.
- Na landing, os emojis serão maiores, distribuídos pelo background e animados lentamente.
- No onboarding, haverá menos emojis e menor contraste para proteger a legibilidade.
- Cada etapa continuará em um painel, com entrada por deslocamento, escala e opacidade.
- `prefers-reduced-motion` removerá movimentos decorativos e transições.

## Estrutura

A landing ficará em `src/app/page.tsx`. O conteúdo atual de onboarding será movido para `src/app/onboarding/page.tsx`. O componente `OnboardingForm` será reutilizado sem criar componentes decorativos adicionais. Estilos compartilhados e específicos das duas páginas permanecerão em `globals.css`.

## Dados e erros

A Server Action, migration, normalização de WhatsApp e modelo de dados não mudarão. Erros de validação e persistência continuarão aparecendo na etapa final do onboarding.

## Verificação

- `/` renderiza landing, benefícios e CTA.
- O CTA navega para `/onboarding` na etapa 1.
- O logo retorna para `/`.
- As três etapas preservam valores ao avançar e voltar.
- Emojis não prejudicam foco, leitura ou interação e ficam ocultos para leitores de tela.
- Layout funciona em desktop e celular.
- Testes, lint e build passam.

## Fora do escopo

URLs distintas por etapa, novas integrações, alterações no Supabase, imagens proprietárias de emojis e seções longas de marketing.
