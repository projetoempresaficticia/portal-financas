// Portal das Finanças — declarações.
//
// A Guia de IVA vem pré-preenchida do e-Fatura; o Modelo 22 exige a
// declaração assinada pelo contabilista certificado. Em ambos, quem decide
// se aceita é o servidor — aqui só se recolhe e se mostra o resultado.

let competencia = competenciaAtual();

// P$ escreve-se com vírgula; a base guarda cêntimos inteiros.
function paraCentimos(texto) {
  const limpo = String(texto || '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

function deCentimos(centimos) {
  return (Number(centimos || 0) / 100).toFixed(2).replace('.', ',');
}

// ── Guia de IVA ───────────────────────────────────────────────────────
async function carregarIva() {
  const nota = document.getElementById('iva-nota');
  const r = await api('at_guia_iva_proposta', { p_competencia: competencia });
  if (!r.ok) {
    mostrarMsg(document.getElementById('msg-iva'), r.erro, 'erro');
    return;
  }
  const p = r.dados;
  const aRecuperar = Number(p.a_recuperar) > 0;

  document.getElementById('iva-numeros').innerHTML = [
    ['Base tributável', formatarP$(p.valor_base)],
    ['IVA liquidado', formatarP$(p.iva_liquidado)],
    ['IVA dedutível', formatarP$(p.iva_dedutivel)],
    [aRecuperar ? 'A recuperar' : 'A entregar',
      formatarP$(aRecuperar ? p.a_recuperar : p.a_entregar)],
  ].map(([rot, val], i) => `
    <div class="at-cartao" style="margin:0">
      <p class="at-sobretitulo">${esc(rot)}</p>
      <p class="at-num" style="margin:4px 0 0${i === 3 ? ';color:var(--at-roxo)' : ''}">${esc(val)}</p>
    </div>`).join('');

  document.getElementById('iva-base').value = deCentimos(p.valor_base);
  document.getElementById('iva-valor').value = deCentimos(p.valor_iva);

  const btn = document.getElementById('btn-iva');
  if (!p.saft_comunicado) {
    document.getElementById('iva-selo').innerHTML = selo('em_analise');
    nota.textContent =
      'Comunique primeiro o SAF-T deste período, em e-Fatura. Não se declara '
      + 'sobre faturas que a AT ainda não recebeu.';
    btn.disabled = true;
  } else {
    document.getElementById('iva-selo').innerHTML = selo('aprovado');
    nota.textContent =
      'Faturas comunicadas e conferidas. Confirme os valores e entregue; o '
      + 'boleto traz a taxa de processamento e o imposto na mesma referência.';
    btn.disabled = false;
  }
}

document.getElementById('form-iva').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById('msg-iva');
  const btn = document.getElementById('btn-iva');

  const base = paraCentimos(document.getElementById('iva-base').value);
  const iva = paraCentimos(document.getElementById('iva-valor').value);
  if (base === null || iva === null) {
    mostrarMsg(msg, 'Valores inválidos. Use por exemplo 55,85.', 'erro');
    return;
  }

  btn.disabled = true;
  mostrarMsg(msg, 'A entregar…');
  const r = await api('at_entregar_guia_iva', {
    p_competencia: competencia,
    p_valor_base: base,
    p_valor_iva: iva,
    p_dias: 15,
  });
  btn.disabled = false;

  if (!r.ok) {
    const d = r.dados || {};
    if (d.a_at_ve) {
      mostrarMsg(msg,
        `${r.erro} Declarou base ${formatarP$(d.declarou.valor_base)} e IVA `
        + `${formatarP$(d.declarou.valor_iva)}; a AT vê base `
        + `${formatarP$(d.a_at_ve.valor_base)} e IVA ${formatarP$(d.a_at_ve.valor_iva)}.`, 'erro');
    } else {
      mostrarMsg(msg, r.erro, 'erro');
    }
    return;
  }

  mostrarMsg(msg,
    `Entregue. Boleto ${r.dados.boleto} de ${formatarP$(r.dados.total)} `
    + `(taxa ${formatarP$(r.dados.taxa)} + imposto ${formatarP$(r.dados.imposto)}). `
    + 'O protocolo sai quando o boleto for pago.', 'ok');
  await carregarHistorico();
});

// ── Modelo 22 ─────────────────────────────────────────────────────────
async function carregarDocumentos() {
  const alvo = document.getElementById('m22-doc');
  const { data, error } = await sb
    .from('documentos')
    .select('id, nome_arquivo, criado_em, estado')
    .eq('tipo', 'declaracao_fiscal')
    .eq('estado', 'completo')
    .order('criado_em', { ascending: false });

  if (error || !data || !data.length) {
    alvo.innerHTML = '<option value="">Nenhuma declaração assinada disponível</option>';
    alvo.disabled = true;
    document.getElementById('btn-m22').disabled = true;
    return;
  }
  alvo.disabled = false;
  document.getElementById('btn-m22').disabled = false;
  alvo.innerHTML = data.map((d) =>
    `<option value="${esc(d.id)}">${esc(d.nome_arquivo || 'declaração')} · ${formatarData(d.criado_em)}</option>`
  ).join('');
}

document.getElementById('form-m22').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById('msg-m22');
  const btn = document.getElementById('btn-m22');

  const exercicio = document.getElementById('m22-exercicio').value.trim();
  const lucro = paraCentimos(document.getElementById('m22-lucro').value);
  const doc = document.getElementById('m22-doc').value;

  if (!/^\d{4}$/.test(exercicio)) {
    mostrarMsg(msg, 'O exercício é um ano com quatro dígitos.', 'erro');
    return;
  }
  if (lucro === null) {
    mostrarMsg(msg, 'Lucro tributável inválido. Use por exemplo 1250,00.', 'erro');
    return;
  }

  btn.disabled = true;
  mostrarMsg(msg, 'A entregar…');
  const r = await api('orgao_pedir_servico', {
    p_tipo: 'modelo22',
    p_dados: { exercicio, lucro_tributavel: String(lucro) },
    p_assinatura: doc,
    p_dias: 15,
  });
  btn.disabled = false;

  if (!r.ok) {
    mostrarMsg(msg, r.erro, 'erro');
    return;
  }
  mostrarMsg(msg,
    `Entregue. Boleto ${r.dados.boleto} de ${formatarP$(r.dados.valor)}. `
    + 'O protocolo sai quando o boleto for pago.', 'ok');
  await carregarHistorico();
});

// ── histórico ─────────────────────────────────────────────────────────
async function carregarHistorico() {
  const alvo = document.getElementById('lista-historico');
  const { data, error } = await sb
    .from('submissoes')
    .select('tipo, estado, protocolo, motivo, criada_em, dados')
    .in('tipo', ['guia_iva', 'modelo22'])
    .order('criada_em', { ascending: false });

  if (error) {
    alvo.innerHTML = '<p class="at-vazio">Não foi possível ler o histórico.</p>';
    return;
  }
  if (!data.length) {
    alvo.innerHTML = '<p class="at-vazio">Ainda não entregou nenhuma declaração.</p>';
    return;
  }
  const NOME = { guia_iva: 'Guia de IVA', modelo22: 'Modelo 22' };
  alvo.innerHTML = data.map((s) => {
    const ref = s.dados && (s.dados.competencia || s.dados.exercicio);
    return `
      <div class="at-linha">
        <div>
          <div class="at-linha-titulo">${esc(NOME[s.tipo] || s.tipo)} ${selo(s.estado)}</div>
          <div class="at-linha-detalhe">
            ${ref ? esc(ref) + ' · ' : ''}${formatarDataHora(s.criada_em)}
            ${s.motivo ? ' · ' + esc(s.motivo) : ''}
          </div>
        </div>
        ${s.protocolo
          ? `<a class="mono at-linha-titulo" style="text-decoration:none"
                href="consultar.html?protocolo=${encodeURIComponent(s.protocolo)}">${esc(s.protocolo)}</a>`
          : '<span class="at-linha-detalhe">sem protocolo</span>'}
      </div>`;
  }).join('');
}

arrancarPagina(async () => {
  ligarSeletorMes('mes', async (novo) => {
    competencia = novo;
    await carregarIva();
  });
  await Promise.all([carregarIva(), carregarDocumentos(), carregarHistorico()]);
});
