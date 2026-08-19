# Onboarding em wizard animado

## Objetivo

Transformar o onboarding existente em uma experiência de três etapas mais interativa para a demonstração, preservando os dados, a Server Action, a migration e a ausência de autenticação.

## Fluxo

1. **Primeiro, sua cozinha:** nome do restaurante e nome do responsável.
2. **Onde encontramos você?:** endereço completo e WhatsApp.
3. **O que não pode faltar?:** insumos frequentes opcionais, contexto final e envio.

O formulário será único e manterá os valores ao navegar. “Continuar” validará somente os campos visíveis da etapa atual. As etapas 2 e 3 terão ação “Voltar”. A etapa final enviará todos os dados pela Server Action existente. Depois do sucesso, o painel exibirá uma confirmação visual no lugar do formulário.

## Estrutura

O estado da etapa ficará no componente `OnboardingForm`. Cada grupo será um `fieldset` identificado por título e descrição. Não serão criados componentes adicionais nem instaladas bibliotecas de animação. A persistência e validação no servidor não mudam.

## Visual e movimento

- Direção “Aurora viva”: fundo verde profundo com três manchas luminosas em verde-lima, esmeralda e terracota.
- Movimento lento e contínuo do background usando apenas CSS.
- Painel translúcido com contraste suficiente para leitura.
- Indicador `01 / 03` e três segmentos de progresso, atualizados a cada avanço.
- Entrada das etapas com deslocamento e opacidade suaves.
- Botões com resposta visual clara; ação principal em verde-lima e secundária discreta.
- `prefers-reduced-motion` desativa animações e transições.

## Validação e acessibilidade

- “Continuar” usa a validação nativa dos inputs da etapa ativa e não avança quando houver campo obrigatório inválido.
- O WhatsApp continua sendo normalizado no `blur` e novamente validado no servidor.
- O título da etapa recebe foco ao avançar ou voltar para orientar leitores de tela e teclado.
- O progresso possui texto acessível e a etapa ativa é anunciada.
- O envio mantém os estados pendente, sucesso e erro existentes.

## Verificação

- Avançar e voltar preserva os valores digitados.
- Campos obrigatórios impedem avanço em suas respectivas etapas.
- Somente a etapa 3 envia o formulário.
- Sucesso mostra a confirmação; erro mantém a etapa final e exibe a mensagem.
- Testes de WhatsApp, lint e build passam.
- O fluxo completo é inspecionado no navegador em desktop e largura móvel.

## Fora do escopo

Novos campos, mudanças de banco, bibliotecas de animação, autenticação e alterações no servidor.
