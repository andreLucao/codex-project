# Pós-onboarding com acesso ao WhatsApp

## Objetivo

Após o restaurante ser salvo com sucesso, conduzir o responsável a uma página de conclusão clara e atraente, com duas formas equivalentes de iniciar a primeira conversa com a Mesa Certa: QR Code e link direto para o WhatsApp.

## Fluxo

1. O usuário conclui as três etapas em `/onboarding`.
2. O servidor valida os dados e salva o restaurante no Supabase.
3. Em caso de sucesso, a aplicação redireciona para `/onboarding/concluido`.
4. Em caso de erro, o usuário permanece na etapa 3 e recebe a mensagem existente; a conclusão não é exibida.
5. Na conclusão, o usuário pode escanear o QR Code ou abrir a conversa pelo botão/link direto.

## Página de conclusão

A nova rota seguirá a direção visual B aprovada:

- fundo e elementos decorativos coerentes com landing e onboarding;
- header flutuante compacto, com a marca à esquerda e o link “Voltar ao início” à direita;
- entrada animada, respeitando `prefers-reduced-motion`;
- título de sucesso e explicação curta;
- card principal com QR Code, botão destacado “Abrir conversa no WhatsApp” e link textual alternativo;
- indicação de que a mensagem poderá ser revisada antes do envio.

O botão e o QR Code apontarão para o mesmo endereço `https://wa.me/5511913912829` com a mensagem codificada:

> Olá! Acabei de cadastrar meu restaurante na Mesa Certa e quero fazer minha primeira cotação.

Abrir o link não envia a mensagem automaticamente; o usuário confirma o envio no WhatsApp.

## Header

O header da nova página usará a versão flutuante aprovada. O mesmo tratamento será aplicado ao header do onboarding para remover a aparência rígida atual e manter consistência visual. A landing permanece funcionalmente igual; somente ajustes estritamente necessários à coerência da navegação entram no escopo.

## Dados e segurança

- O frontend usa somente o número público `5511913912829`.
- IDs da conta, tokens de acesso, segredo do app e token de webhook não serão adicionados ao código, variáveis públicas, documentação ou Git.
- A URL do WhatsApp será construída em um utilitário pequeno e testável para garantir a codificação correta da mensagem.
- O QR Code será gerado localmente pela aplicação a partir dessa URL, sem enviar dados a serviços externos.

## Implementação

- Alterar a action para redirecionar apenas depois de uma inserção bem-sucedida.
- Criar `client/src/app/onboarding/concluido/page.tsx`.
- Reutilizar estilos, tokens e elementos existentes; não criar biblioteca de componentes para uma única tela.
- Adicionar a menor dependência adequada para gerar QR Code localmente, caso nenhuma já instalada cubra essa função.
- Manter `server/` intacto.

## Acessibilidade e estados

- O QR Code terá descrição textual e não será a única forma de acesso.
- O link direto será uma âncora real, acessível por teclado.
- Foco visível, contraste e hierarquia de títulos serão preservados.
- Animações serão reduzidas quando o sistema solicitar menos movimento.

## Verificação

- Teste unitário da construção do link e da codificação da mensagem.
- Testes existentes, lint e build devem passar.
- Validação no navegador de cadastro bem-sucedido, redirecionamento, QR Code visível, URL idêntica no botão e no QR Code e navegação “Voltar ao início”.

## Fora de escopo

- Integração com Graph API, WABA ou webhook.
- Envio automático da mensagem.
- Armazenamento de credenciais Meta no frontend.
- Alterações no `server/`.
