# Garagem do Gustavo

Jogo de estacionamento para crianças pequenas, **sem propagandas, sem compras e sem coleta de dados**.
O objetivo é tirar os carros do caminho para o carro vermelho sair da garagem.

**Jogar:** https://micheltlutz.github.io/garagem-do-gustavo/

## Instalar no iPad

1. Abra o link acima no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Abra o jogo pelo ícone **uma vez com internet**. Depois disso ele funciona offline.

Bom saber:
- O progresso fica salvo no app do ícone. Apagar o ícone apaga o progresso.
- **Acesso Guiado** (Ajustes → Acessibilidade → Acesso Guiado; depois clique três vezes no botão lateral) mantém a criança dentro do jogo.
- Atualizações chegam sozinhas quando o jogo é aberto com internet (são aplicadas na tela inicial ou no mapa, nunca no meio de uma fase).

## Como se joga

- A garagem tem as bordas abertas. A meta é **tirar todos os veículos** e deixá-la vazia.
- Cada veículo só anda no sentido em que está virado e sai pela frente ou por trás, quando o caminho até a borda está livre.
- **Arrastar** move o veículo (ou o leva para fora); **tocar** faz ele sair, se estiver livre, ou deslizar até o fim do caminho.
- A **lâmpada** mostra qual veículo tirar e por onde (a dica também aparece sozinha depois de 40 segundos parado).
- A garagem nunca trava: sempre existe algum veículo livre para sair.
- 36 fases (8x8) em 3 mundos: amarelo (4 a 7 veículos), verde (8 a 12) e roxo (13 a 16).

## Desenvolvimento

Requer Node 24 ou mais novo.

```sh
npm install
npm run dev -- --host   # abre na rede local (teste no iPad pela Wi-Fi)
npm test                # regras, solver e validação de todas as fases
npm run build           # versão final em dist/
npm run levels          # gera de novo src/game/levels.json
npm run icons           # gera os ícones PNG a partir de public/icon.svg
```

Estrutura:
- `src/game/`: regras do tabuleiro, solver (dificuldade e dica) e fases.
- `src/ui/`: tabuleiro na tela, desenhos dos carros, telas, ícones e confete.
- `src/audio/sfx.ts`: sons sintetizados (sem arquivos de áudio).
- `scripts/generate-levels.ts`: gerador de fases com semente fixa (sempre gera as mesmas fases).

Cada push na branch `main` roda os testes e publica no GitHub Pages.
