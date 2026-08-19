# Movimento e navegação do onboarding

## Objetivo

Refinar a landing e o onboarding com animações equilibradas, mantendo a experiência rápida, acessível e sem novas dependências.

## Emojis

Serão mantidos caracteres emoji nativos. Em macOS e iOS, o sistema os renderiza no estilo Apple; em outros sistemas, será usado o estilo local. Nenhum arquivo gráfico proprietário será incorporado. Os emojis serão decorativos, terão `aria-hidden` e não bloquearão interação.

## Landing

- Eyebrow, título, descrição, CTA e player de áudio entram em sequência curta.
- Emojis flutuam com velocidades, rotações e profundidades diferentes.
- O CTA terá brilho horizontal, elevação no hover e resposta pressionada.
- As ondas do player terão ritmos variados.
- Cards de benefícios terão revelação em sequência ao entrar na viewport e elevação discreta no hover.
- A entrada da rota terá fade, escala mínima e deslocamento sem atrasar a navegação.

## Onboarding

- Cada etapa entra com fade, escala e deslocamento lateral.
- O painel terá brilho discreto na borda e o progresso preencherá suavemente.
- Inputs e botões terão estados de foco, hover e pressionado mais expressivos.
- A confirmação final manterá sua entrada própria.

## Navegação entre etapas

O progresso será composto por três botões com rótulos acessíveis. O usuário poderá clicar em qualquer etapa já visitada. Uma etapa futura ainda não visitada ficará indisponível; para liberá-la, o usuário usa “Continuar”, que valida os campos obrigatórios da etapa atual. Voltar continua sempre permitido. Essa regra preserva os valores e impede que campos obrigatórios sejam pulados.

## Implementação

O componente `OnboardingForm` ganhará apenas o estado da maior etapa visitada e a navegação pelo progresso. As animações serão implementadas no CSS existente. Não haverá biblioteca de animação nem novos componentes.

## Acessibilidade

- `prefers-reduced-motion` remove animações e transições.
- Botões de etapa usam `aria-current` na etapa ativa e `disabled` nas etapas futuras.
- Títulos continuam recebendo foco após a navegação.
- Contraste, foco visível e leitura do formulário serão preservados.

## Verificação

- Elementos da landing entram na ordem especificada.
- CTA navega imediatamente para `/onboarding`.
- Etapas visitadas são clicáveis e preservam dados.
- Etapas futuras não podem ser puladas.
- “Continuar” valida e libera a próxima etapa.
- Layout e interação funcionam em desktop e celular.
- Testes, lint e build passam.

## Fora do escopo

Assets de emoji da Apple, bibliotecas de animação, URLs separadas por etapa e alterações no Supabase ou servidor.
