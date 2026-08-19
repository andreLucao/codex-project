# Modo demo local e ícones da landing

## Objetivo

Permitir a apresentação completa do onboarding antes da criação do Supabase e substituir os emojis dos cards da landing por ícones com aparência mais profissional.

## Modo demo

- A action mantém todas as validações atuais.
- Quando `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estiverem ausentes, a action registra no terminal que executou em modo demo e redireciona para `/onboarding/concluido`.
- Quando as duas variáveis existirem, o fluxo continua salvando no Supabase e só redireciona após inserção bem-sucedida.
- O modo demo não exibirá uma confirmação falsa de persistência; a página final falará apenas que o agente está pronto para iniciar a conversa.
- Nenhum dado será persistido localmente no modo demo.

## Ícones da landing

- Os emojis dentro dos três cards serão substituídos por SVGs lineares locais: mensagem de voz, negociação e organização da cotação.
- Os ícones usarão o verde-limão existente, traço consistente e animação curta no hover do card.
- Não será adicionada biblioteca de ícones.
- Os emojis decorativos do fundo permanecem fora deste escopo.

## Verificação

- Testar que a ausência das variáveis ativa o modo demo e permite chegar à conclusão.
- Manter o caminho real do Supabase inalterado quando as variáveis existirem.
- Executar testes, lint e build.
- Conferir os três ícones e o fluxo completo no navegador.

## Fora de escopo

- Criar ou configurar o projeto Supabase.
- Persistir cadastros feitos no modo demo.
- Alterar o backend ou integrar o agente.
