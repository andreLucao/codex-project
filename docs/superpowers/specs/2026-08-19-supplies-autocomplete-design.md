# Autocomplete de insumos frequentes

## Objetivo

Facilitar a seleção de insumos frequentes no onboarding com uma lista local de aproximadamente 100 produtos comuns, sem impedir itens personalizados e sem alterar o modelo atual do Supabase.

## Dados

O arquivo `client/src/data/supplies.json` conterá objetos com `name` e `category`. A lista cobrirá hortifruti, carnes, pescados, laticínios, grãos, massas, panificação, secos, temperos, bebidas, congelados, descartáveis e limpeza. Nomes serão únicos e escritos em português brasileiro.

## Interação

- O usuário digita em um campo de pesquisa na terceira etapa.
- A busca ignora maiúsculas, minúsculas e acentos.
- Até seis sugestões correspondentes são exibidas com nome e categoria.
- Clique ou Enter adiciona a sugestão destacada.
- Se não houver correspondência exata, Enter aceita o texto como item personalizado.
- Itens selecionados aparecem como chips removíveis.
- Duplicados são ignorados, inclusive com diferenças de caixa ou acentuação.
- Setas para cima e para baixo alteram a sugestão ativa.
- Escape fecha a lista.
- Backspace remove o último chip quando a pesquisa está vazia.

## Persistência

Um input oculto chamado `frequentSupplies` enviará os nomes selecionados separados por vírgula. A Server Action continuará convertendo esse valor em `text[]`; banco, migration e contrato de persistência não mudarão.

## Estrutura

A lógica será incluída no componente `OnboardingForm`, pois é usada uma única vez. O JSON será importado diretamente pelo Next.js. Não haverá dependências, API, contexto global ou componente adicional.

## Acessibilidade

- O campo terá semântica de combobox e associação com a listbox.
- Sugestões usarão `role="option"` e indicação da opção ativa.
- Chips terão botões com rótulos explícitos de remoção.
- Estados de foco serão visíveis.
- A lista será navegável por teclado.

## Verificação

- A lista contém aproximadamente 100 itens únicos.
- Busca por texto com ou sem acentos encontra o mesmo produto.
- Clique, Enter, setas, Escape e Backspace funcionam.
- Itens personalizados são aceitos.
- Duplicados não são adicionados.
- O input oculto contém os itens separados por vírgula.
- Navegar entre etapas preserva os chips.
- Testes, lint e build passam.

## Fora do escopo

Busca remota, quantidades, unidades, preços, criação de catálogo no banco e administração da lista.
