# Nota de voz na landing

## Objetivo

Substituir o player decorativo atual por uma nota de voz inspirada na interface do WhatsApp, mantendo a identidade visual da Mesa Certa e sem copiar assets proprietários.

## Visual

- Bolha de mensagem enviada com cantos arredondados e ponta discreta.
- Botão circular de reprodução, waveform mais longa, duração `0:08` e horário da mensagem.
- Texto abaixo do waveform: “Preciso de 20kg de mussarela até quinta”.
- Tipografia de interface nativa usando `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto` e fallbacks. Em macOS, isso utiliza a tipografia de sistema associada à experiência do WhatsApp.
- Cores adaptadas à paleta verde-lima e verde profundo da Mesa Certa.

## Movimento

As barras da waveform terão animação coordenada e o botão responderá a hover e clique. O bloco entrará na sequência já existente do hero. Como não há arquivo de áudio real no escopo, o controle será uma demonstração visual e não fingirá reprodução sonora.

## Acessibilidade

O bloco será identificado como demonstração visual de uma mensagem de voz. Elementos puramente decorativos ficarão ocultos para leitores de tela. `prefers-reduced-motion` removerá o movimento da waveform.

## Entrega conjunta

Esta alteração será implementada junto ao autocomplete descrito em `2026-08-19-supplies-autocomplete-design.md`, incluindo o JSON local com aproximadamente 100 insumos e suporte a itens personalizados.

## Verificação

- A landing exibe a nova nota de voz sem deslocar o CTA.
- Tipografia usa a pilha nativa definida.
- A waveform é legível e animada.
- Layout funciona em desktop e celular.
- Autocomplete pesquisa, seleciona, remove e envia insumos corretamente.
- Testes, lint e build passam.
