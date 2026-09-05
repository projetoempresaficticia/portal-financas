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

## A biblioteca

[biblioteca.html](https://projetoempresaficticia.github.io/portal-financas/biblioteca.html)
mostra tudo: cores, tipografia, ícones, componentes, estado e raios.

- `web/biblioteca/at.css` — 42 tokens e 55 classes. Tokens, esqueleto
  (sidebar roxa + conteúdo), botões, formulários, superfícies, hero,
  cartões de serviço, estado, tabelas e gráficos.
- **Tipografia:** Bricolage Grotesque no display, IBM Plex Sans no corpo,
  IBM Plex Mono nos números que alinham em coluna — NIF, referências,
  valores.
- **Raios:** 6px marcas, 9px controlos, 14px painéis, 999px pílulas.

## Os ícones

Iconex, estilo Light, exportados do Figma em SVG. **A cor está trocada
dentro do próprio ficheiro**, em quatro pastas:

| pasta | cor | onde |
|---|---|---|
| `branco` | `#FFFFFF` | sidebar roxa e hero |
| `roxo` | `#5B3F8C` | cartões de serviço e ênfase |
| `tinta` | `#292331` | interface neutra |
| `suave` | `#716A78` | apoio e legendas |

Escolhe-se a pasta pela cor que o sítio pede, sem CSS pelo meio. Saem do
Figma com `stroke="white"`, que sobre branco é invisível; o
`ferramentas/gerar_icones.py` pinta-os e é repetível.

Não há variante no `#A39DA9` da paleta original: dava 2,64:1 e um ícone
funcional precisa de 3:1. São 30 ícones × 4 cores = 120 ficheiros, 102 KB
no total.

O `fill="none"` é preservado no recorte — é o que mantém o ícone vazado,
e trocá-lo enchia a forma toda.

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
