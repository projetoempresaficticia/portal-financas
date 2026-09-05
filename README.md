# portal-financas

**Portal das Finanças AT** — Autoridade Tributária do Prepara Portugal

**Status:** biblioteca de design em construção. A app ainda não existe.
**Depende de:** [pp-base](https://github.com/projetoempresaficticia/pp-base),
[classcard](https://github.com/projetoempresaficticia/classcard) (pp-identidade),
[prepacoin](https://github.com/projetoempresaficticia/prepacoin) (taxas e coimas)

Site: https://projetoempresaficticia.github.io/portal-financas/

## A paleta foi auditada antes de entrar

A página inicial é essa auditoria: os mesmos componentes do portal
lado a lado, na paleta como veio e na corrigida, com o contraste medido
em cada um.

**14 cores passam** e ficam intocadas — toda a espinha roxa. O botão
primário dá 8,29:1, a sidebar 10,38:1, o texto principal 15,23:1. A
identidade não muda.

**7 reprovam para o uso que têm.** As quatro cores de estado são as por
omissão do Tailwind (`green-500`, `blue-500`, `amber-500`, `red-500`),
desenhadas para preencher com branco por cima e não para serem lidas
como texto sobre branco:

| | sobre branco | sobre o próprio fundo claro |
|---|---|---|
| Sucesso `#22C55E` | 2,28:1 | **2,07:1** |
| Aviso `#F59E0B` | 2,15:1 | 1,93:1 |
| Erro `#EF4444` | 3,76:1 | 3,07:1 |
| Informação `#3B82F6` | 3,68:1 | 3,01:1 |

Onde isto morde: a maqueta mostra **"Situação regular" a verde sobre
fundo verde claro**. É o elemento mais importante do portal — diz ao
contribuinte se tem dívidas — e é o que menos se lê.

Mais três: o texto terciário `#A39DA9` (2,64:1), o anel de foco
`#B89EDB` (2,35:1, e um anel precisa de 3:1) e duas das quatro cores de
gráficos.

### A regra que daí sai

Cada cor de estado tem **duas versões**: uma para preencher, uma mais
escura para escrever. É o mesmo padrão do Prepacoin e do Subsight; o
ClassCard foi a exceção, por o azul ser escuro o bastante para os dois
papéis.

```css
--at-ok: #22C55E;   --at-ok-texto: #15803D;   --at-ok-veu: #DCFCE7;
```

Nenhuma cor saiu da paleta. Os tons que reprovavam como texto continuam
cá, no papel para que foram feitos.

## Por fazer

- Ícones: exportar do Figma (catálogo de 6128 já em cache na skill
  `figma-icons`), em SVG, com a cor trocada dentro do próprio ficheiro.
- Componentes da biblioteca: sidebar, cartões de serviço, hero, tabelas,
  formulários de declaração.
- A app: declarações, pagamentos, situação fiscal, e-fatura.
- SQL: as RPCs da AT vivem em `pp-orgaos`; falta o que é próprio deste
  órgão.

## Convenções

- Commits seguem a convenção Angular (`feat`, `fix`, `docs`, `chore`, ...).
- A skill `pp-orgaos` tem as regras do domínio.
