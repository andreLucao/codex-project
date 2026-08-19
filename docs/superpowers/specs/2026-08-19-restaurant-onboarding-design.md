# Onboarding de restaurante

## Objetivo

Criar um projeto Next.js simples, sem autenticação, para cadastrar os dados que alimentam o pipeline de busca de fornecedores e mensageria: nome do restaurante, endereço, WhatsApp e insumos frequentes opcionais.

## Arquitetura

- Next.js com App Router e TypeScript.
- Uma única página de onboarding com formulário responsivo.
- Uma Server Action valida e normaliza os dados antes de inserir no Supabase com `@supabase/supabase-js`.
- Uma migration SQL versionada cria a tabela `restaurants`.
- As credenciais do Supabase ficam apenas em variáveis de ambiente do servidor.

## Interface e fluxo

O formulário contém:

1. Nome do restaurante, obrigatório.
2. Endereço completo, obrigatório e armazenado como texto para uso posterior pelo Maps.
3. WhatsApp, obrigatório. A interface aceita pontuação comum, remove caracteres de apresentação e normaliza o valor para `+55` seguido de DDD e número. O resultado deve ter 10 ou 11 dígitos nacionais e é salvo no formato canônico `+55DDDNÚMERO`.
4. Insumos frequentes, opcionais, digitados como uma lista separada por vírgulas e salvos como `text[]` sem itens vazios.

Ao enviar, a Server Action repete a validação no servidor. Em caso de sucesso, o formulário exibe uma confirmação e limpa os campos. Em caso de falha de validação ou persistência, exibe uma mensagem curta na própria página.

## Modelo de dados

A tabela `restaurants` terá:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `address text not null`
- `whatsapp text not null`, com constraint que exige `+55` e 10 ou 11 dígitos nacionais
- `frequent_supplies text[] not null default '{}'`
- `created_at timestamptz not null default now()`

Como não há autenticação, a escrita ocorre no servidor usando a chave de serviço. Nenhuma política pública de inserção será criada.

## Tratamento de erros

- Campos obrigatórios vazios retornam erro de validação.
- WhatsApp fora do formato brasileiro esperado retorna orientação explícita.
- Falhas do Supabase geram uma mensagem segura para o usuário e são registradas no servidor sem expor detalhes internos na interface.
- Variáveis de ambiente ausentes impedem a ação e retornam erro de configuração.

## Verificação

- `npm run lint` e `npm run build` devem passar.
- A normalização deve aceitar exemplos como `(11) 99999-9999`, `5511999999999` e `+55 11 99999-9999`, produzindo `+5511999999999`.
- Números sem DDD, com país diferente de 55 ou com quantidade inválida de dígitos devem ser rejeitados.
- A migration deve ser aplicável pelo Supabase CLI ou pelo SQL Editor.

## Fora do escopo

Autenticação, edição de cadastro, dashboard, geocodificação do endereço, integração direta com Maps/WhatsApp e estilização elaborada.
