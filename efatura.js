// Portal das Finanças — e-Fatura.
//
// Duas coisas neste ecrã: ver as faturas do período, e comunicar o SAF-T
// que o Prepacoin exportou. A AT confere o ficheiro contra as faturas que
// ela própria vê, por isso a recusa aponta a fatura exata que não bate.

let empresa = null;
let competencia = competenciaAtual();

function linhaFatura(f, ehCompra) {
  const naoDesconta = ehCompra && f.dedutivel === false;
  return `
    <div class="at-linha">
      <div>
        <div class="at-linha-titulo">
          ${esc(f.numero)}
          ${naoDesconta ? '<span class="at-selo at-selo-aviso">Não desconta IVA</span>' : ''}
        </div>
        <div class="at-linha-detalhe">
          ${esc(f.nome || f.contraparte)} · ${formatarData(f.data)} · ${esc(f.descricao || '')}
        </div>
      </div>
      <div style="text-align:right">
        <div class="at-linha-titulo">${formatarP$(f.bruto)}</div>
        <div class="at-linha-detalhe">base ${formatarP$(f.base)} · IVA ${formatarP$(f.iva)}</div>
      </div>
    </div>`;
}

function desenhar(d) {
  const v = d.vendas;
  const c = d.compras;

  document.getElementById('resumo').innerHTML = [
    ['Vendas', v.n + ' fatura(s)', formatarP$(v.bruto)],
    ['IVA liquidado', 'sobre ' + formatarP$(v.base), formatarP$(v.iva)],
    ['Compras', c.n + ' fatura(s)', formatarP$(c.bruto)],
    ['IVA dedutível',
      Number(c.iva_nao_dedutivel) > 0
        ? formatarP$(c.iva_nao_dedutivel) + ' não desconta'
        : 'sobre ' + formatarP$(c.base),
      formatarP$(c.iva)],
  ].map(([r, nota, valor]) => `
    <div class="at-cartao" style="margin:0">
      <p class="at-sobretitulo">${esc(r)}</p>
      <p class="at-num" style="margin:4px 0 0">${esc(valor)}</p>
      <p class="at-linha-detalhe" style="margin:2px 0 0">${esc(nota)}</p>
    </div>`).join('');

  document.getElementById('lista-vendas').innerHTML = v.linhas.length
    ? v.linhas.map((f) => linhaFatura(f, false)).join('')
    : '<p class="at-vazio">Não emitiu faturas neste período.</p>';

  document.getElementById('lista-compras').innerHTML = c.linhas.length
    ? c.linhas.map((f) => linhaFatura(f, true)).join('')
    : '<p class="at-vazio">Não recebeu faturas neste período.</p>';

  const selo_ = document.getElementById('saft-selo');
  const nota = document.getElementById('saft-nota');
  if (d.saft) {
    selo_.innerHTML = selo('aprovado');
    nota.textContent =
      `Comunicado em ${formatarDataHora(d.saft.comunicado_em)}, com `
      + `${d.saft.faturas} fatura(s). Pode voltar a comunicar se corrigir algo no Prepacoin.`;
  } else {
    selo_.innerHTML = selo('em_analise');
    nota.textContent =
      'Ainda não comunicou este período. Exporte o SAF-T no Prepacoin, no ecrã '
      + 'de emitir fatura, e entregue aqui o ficheiro.';
  }
}

async function carregar() {
  mostrarMsg(document.getElementById('msg-geral'), '');
  const r = await api('at_efatura', { p_competencia: competencia, p_empresa: null });
  if (!r.ok) {
    mostrarMsg(document.getElementById('msg-geral'), r.erro, 'erro');
    return;
  }
  desenhar(r.dados);
}

// ── comunicar ─────────────────────────────────────────────────────────
document.getElementById('btn-comunicar').addEventListener('click', async () => {
  const msg = document.getElementById('msg-saft');
  const divs = document.getElementById('divergencias');
  const btn = document.getElementById('btn-comunicar');
  const ficheiro = document.getElementById('ficheiro').files[0];
  divs.innerHTML = '';

  if (!ficheiro) {
    mostrarMsg(msg, 'Escolha o ficheiro SAF-T exportado do Prepacoin.', 'erro');
    return;
  }
  if (ficheiro.size > 2 * 1024 * 1024) {
    mostrarMsg(msg, 'Ficheiro grande demais (máximo 2 MB).', 'erro');
    return;
  }

  btn.disabled = true;
  mostrarMsg(msg, 'A ler o ficheiro…');
  const xml = await ficheiro.text();

  // O ficheiro fica guardado antes de ser aceite: uma entrega recusada
  // também é um facto, e o professor tem de poder ver o que foi entregue.
  const caminho = `${empresa.cedula}/${competencia}/saft.xml`;
  mostrarMsg(msg, 'A entregar…');
  const { error: erroUpload } = await sb.storage
    .from('fisco').upload(caminho, ficheiro, { contentType: 'application/xml', upsert: true });

  const r = await api('at_comunicar_saft', {
    p_competencia: competencia,
    p_xml: xml,
    p_arquivo_url: erroUpload ? null : caminho,
  });
  btn.disabled = false;

  if (!r.ok) {
    mostrarMsg(msg, r.erro, 'erro');
    const lista = (r.dados && r.dados.divergencias) || [];
    if (lista.length) {
      divs.innerHTML = `
        <div class="at-cartao" style="margin-top:var(--at-e4);border-color:var(--at-erro)">
          <h3 style="margin-top:0">O que não bate</h3>
          ${lista.map((d) => `
            <div class="at-linha">
              <div>
                <div class="at-linha-titulo">${esc(d.fatura || '—')}</div>
                <div class="at-linha-detalhe">${esc(d.problema)}</div>
              </div>
              <div style="text-align:right">
                <div class="at-linha-detalhe">no ficheiro: ${d.no_ficheiro == null ? '—' : formatarP$(d.no_ficheiro)}</div>
                <div class="at-linha-detalhe">a AT vê: ${d.na_at == null ? '—' : formatarP$(d.na_at)}</div>
              </div>
            </div>`).join('')}
        </div>`;
    }
    return;
  }

  mostrarMsg(msg,
    `Comunicado: ${r.dados.faturas} fatura(s), IVA ${formatarP$(r.dados.imposto)}.`, 'ok');
  document.getElementById('ficheiro').value = '';
  await carregar();
});

arrancarPagina(async (ctx) => {
  empresa = ctx.empresa;
  ligarSeletorMes('mes', async (novo) => {
    competencia = novo;
    await carregar();
  });
  await carregar();
});
