#!/usr/bin/env python3
"""Pinta os ícones do Portal das Finanças AT, dentro do próprio SVG.

PORQUE É QUE A COR VAI DENTRO DO FICHEIRO

Os ícones saem do Figma com `stroke="white"`, que sobre uma página branca
é invisível. Há duas formas de resolver:

  a) `mask-image` no CSS, que faz o ícone seguir o `currentColor`;
  b) gravar variantes já pintadas, uma por cor.

Aqui usa-se (b), por decisão do Germano. Tem duas vantagens reais neste
projeto: um `<img>` com o ficheiro certo funciona sem depender do suporte
a máscaras, e um ícone de duas cores continuaria a funcionar — a máscara
tem um canal só e perderia a segunda cor.

O preço é haver quatro cópias de cada ícone. Como são 24x24 com um traço,
cada uma pesa uns 400 bytes; as 120 juntas não chegam a 50 KB.

AS QUATRO VARIANTES saem de onde os ícones aparecem na maqueta:

  branco  #FFFFFF  sidebar roxa e hero
  roxo    #5B3F8C  cartões de serviço e ênfase       8,29:1 sobre branco
  tinta   #292331  interface neutra                 15,23:1 sobre branco
  suave   #716A78  apoio e legendas                  5,20:1 sobre branco

Nenhuma delas é o `#A39DA9` da paleta original: dava 2,64:1 e um ícone
funcional precisa de 3:1.

Uso:
    python ferramentas/gerar_icones.py
"""

import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
BRUTO = pathlib.Path(
    r"C:/Users/devel/AppData/Local/Temp/claude"
    r"/c--Users-devel-OneDrive-Documentos-projetoempresaficticio"
    r"/bc6d0a4e-af49-4952-a854-a6b5e266289b/scratchpad/at_svg_bruto")

VARIANTES = {
    'branco': '#FFFFFF',
    'roxo':   '#5B3F8C',
    'tinta':  '#292331',
    'suave':  '#716A78',
}

# `fill="none"` NÃO pode ser tocado: é o que mantém o ícone vazado. Só
# se troca a cor onde ela existe de facto.
COR = re.compile(r'(stroke|fill)="(?!none")[^"]*"')


def pintar(svg: str, cor: str) -> str:
    return COR.sub(lambda m: f'{m.group(1)}="{cor}"', svg)


def main():
    origens = sorted(BRUTO.glob('*.svg'))
    if not origens:
        raise SystemExit(f'não encontro SVGs em {BRUTO}')

    total = 0
    for nome, cor in VARIANTES.items():
        destino = RAIZ / 'web' / 'icones' / nome
        destino.mkdir(parents=True, exist_ok=True)
        for f in origens:
            (destino / f.name).write_text(
                pintar(f.read_text(encoding='utf-8'), cor), encoding='utf-8')
            total += 1
        print(f'  {nome:<7} {cor}  {len(origens)} ícones')

    peso = sum(p.stat().st_size for p in (RAIZ / 'web' / 'icones').rglob('*.svg'))
    print(f'\n{total} ficheiros, {peso/1024:.0f} KB no total')


if __name__ == '__main__':
    main()
