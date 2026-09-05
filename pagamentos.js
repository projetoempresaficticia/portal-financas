// Portal das Finanças — pagamentos.
//
// A AT mostra o que é devido e dá a referência; quem cobra é o banco. É
// assim na vida real, e evita ter duas portas para a mesma operação.
//
// A lista vem de `at_boletos`, no servidor: saber quais boletos são da AT
// exige cruzar o órgão com a conta dele, e isso não é coisa para o browser
// adivinhar com uma cédula escrita à mão.

function linhaBoleto(b) {
  const pago = b.estado === 'pago';
  const dias = diasAte(b.prazo);
  const prazo = pago
    ? 'pago em ' + formatarData(b.pago_em)
    : b.atrasado
      ? 'prazo ultrapassado em ' + formatarData(b.prazo)
      : `paga até ${formatarData(b.prazo)}${dias !== null && dias <= 3 ? ` (faltam ${dias} dias)` : ''}`;

  return `
    <div class="at-linha">
      <div>
        <div class="at-linha-titulo">
          ${esc(b.descricao || 'Boleto da AT')}
          ${selo(pago ? 'pago' : (b.atrasado ? 'atrasado' : b.estado))}
        </div>
        <div class="at-linha-detalhe">${esc(b.numero || '')} · ${prazo}</div>
        ${pago ? '' : `
          <div class="at-linha-detalhe mono" style="margin-top:6px">
            Entidade <strong>${esc(b.entidade)}</strong> ·
            Referência <strong>${esc(b.referencia_mb)}</strong>
          </div>`}
      </div>
      <div style="text-align:right">
        <div class="at-linha-titulo">${formatarP$(b.valor)}</div>
        <div class="at-linha-detalhe mono">${esc(b.referencia)}</div>
      </div>
    </div>`;
}

async function carregar() {
  const msg = document.getElementById('msg-geral');
  mostrarMsg(msg, '');

  const r = await api('at_boletos', {});
  if (!r.ok) {
    mostrarMsg(msg, r.erro, 'erro');
    return;
  }

  const linhas = r.dados.linhas || [];
  const porPagar = linhas.filter((b) => b.estado === 'por_pagar');
  const pagos = linhas.filter((b) => b.estado === 'pago');

  document.getElementById('lista-por-pagar').innerHTML = porPagar.length
    ? porPagar.map(linhaBoleto).join('')
    : '<p class="at-vazio">Não tem nada por pagar à Autoridade Tributária.</p>';

  document.getElementById('lista-pagos').innerHTML = pagos.length
    ? pagos.map(linhaBoleto).join('')
    : '<p class="at-vazio">Ainda não pagou nada à Autoridade Tributária.</p>';
}

arrancarPagina(carregar);
