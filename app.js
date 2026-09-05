// Portal das Finanças — início: a situação fiscal da empresa.
//
// Este ecrã responde a três perguntas, por esta ordem: estou em dia? o que
// falta fazer neste período? e o que já ficou entregue? Tudo o resto tem
// página própria.

const areaEntrada = document.getElementById('area-entrada');
const areaApp = document.getElementById('area-app');
const areaSituacao = document.getElementById('area-situacao');
const areaSemEmpresa = document.getElementById('area-sem-empresa');
const msgGeral = document.getElementById('msg-geral');

let empresaAtual = null;
const COMPETENCIA = competenciaAtual();

// ── o painel do topo ──────────────────────────────────────────────────
// Três hipóteses, e a nota diz o que fazer a seguir — não só o diagnóstico.
function desenharSituacao(porPagar, atrasados) {
  const hero = document.getElementById('hero');
  const icone = document.getElementById('situacao-icone');
  const titulo = document.getElementById('situacao-titulo');
  const nota = document.getElementById('situacao-nota');

  const devido = porPagar.reduce((t, b) => t + Number(b.valor || 0), 0);

  if (atrasados.length) {
    hero.dataset.estado = 'erro';
    icone.innerHTML = '<span class="at-icone i-aviso" aria-hidden="true"></span>';
    titulo.textContent = 'Em dívida, com prazo ultrapassado';
    nota.textContent =
      `${atrasados.length} pagamento(s) à Autoridade Tributária passaram do prazo, `
      + `num total de ${formatarP$(devido)}. Enquanto não regularizar, a situação `
      + 'fiscal aparece assim a quem a consultar.';
  } else if (porPagar.length) {
    hero.dataset.estado = 'aviso';
    icone.innerHTML = '<span class="at-icone i-relogio" aria-hidden="true"></span>';
    titulo.textContent = 'Com pagamentos em aberto';
    nota.textContent =
      `Tem ${formatarP$(devido)} por pagar à Autoridade Tributária, ainda dentro do `
      + 'prazo. Assim que pagar, a entrega recebe protocolo automaticamente.';
  } else {
    hero.dataset.estado = 'ok';
    icone.innerHTML = '<span class="at-icone i-ok" aria-hidden="true"></span>';
    titulo.textContent = 'Situação regularizada';
    nota.textContent = 'Não há nada em falta perante a Autoridade Tributária.';
  }
}

// ── o período em curso ────────────────────────────────────────────────
function desenharPeriodo(proposta, jaEntregue, jaPaga) {
  document.getElementById('periodo-nome').textContent =
    competenciaPorExtenso(COMPETENCIA);
  document.getElementById('periodo-selo').innerHTML =
    jaEntregue ? selo('aprovado') : selo('em_analise');

  const p = proposta || {};
  const numeros = [
    ['Base tributável', formatarP$(p.valor_base)],
    ['IVA liquidado', formatarP$(p.iva_liquidado)],
    ['IVA dedutível', formatarP$(p.iva_dedutivel)],
    [Number(p.a_recuperar) > 0 ? 'IVA a recuperar' : 'IVA a entregar',
      formatarP$(Number(p.a_recuperar) > 0 ? p.a_recuperar : p.a_entregar)],
  ];
  document.getElementById('periodo-numeros').innerHTML = numeros.map(([r, v], i) => `
    <div class="at-cartao" style="margin:0">
      <p class="at-sobretitulo">${esc(r)}</p>
      <p class="at-num" style="margin:4px 0 0${i === 3 ? ';color:var(--at-roxo)' : ''}">${esc(v)}</p>
    </div>`).join('');

  // Os passos pela ordem real: comunicar, declarar, pagar. Cada um só faz
  // sentido depois do anterior, e é isso que o ecrã tem de mostrar.
  const comunicado = !!(p.saft_comunicado);
  const passos = [
    {
      feito: comunicado,
      titulo: 'Comunicar as faturas (SAF-T)',
      nota: comunicado
        ? 'Ficheiro do período já comunicado e conferido.'
        : 'Exporte o SAF-T no Prepacoin e entregue-o aqui, em e-Fatura.',
      accao: comunicado ? null : { texto: 'Ir para e-Fatura', href: 'efatura.html' },
    },
    {
      feito: jaEntregue,
      titulo: 'Entregar a Guia de IVA',
      nota: !comunicado
        ? 'Disponível depois de comunicar as faturas.'
        : jaEntregue
          ? 'Guia do período entregue.'
          : 'Os valores já estão calculados a partir do e-Fatura; confirme e entregue.',
      accao: (comunicado && !jaEntregue)
        ? { texto: 'Entregar guia', href: 'declaracoes.html' } : null,
    },
    {
      feito: jaPaga,
      titulo: 'Pagar o boleto',
      nota: jaPaga
        ? 'Boleto pago; a entrega já tem protocolo.'
        : 'A entrega só recebe protocolo depois de o boleto estar pago.',
      accao: (jaEntregue && !jaPaga)
        ? { texto: 'Ver pagamentos', href: 'pagamentos.html' } : null,
    },
  ];

  document.getElementById('periodo-passos').innerHTML = passos.map((s, i) => `
    <li class="at-linha-passo" data-feito="${s.feito}">
      <span class="at-passo-num">${s.feito ? '✓' : i + 1}</span>
      <div>
        <div class="at-linha-titulo">${esc(s.titulo)}</div>
        <div class="at-linha-detalhe">${esc(s.nota)}</div>
      </div>
      ${s.accao
        ? `<a class="at-botao at-botao-linha" href="${comVersao(s.accao.href)}">${esc(s.accao.texto)}</a>`
        : ''}
    </li>`).join('');
}

// ── listas ────────────────────────────────────────────────────────────
function desenharPorPagar(lista) {
  const painel = document.getElementById('painel-por-pagar');
  if (!lista.length) {
    painel.hidden = true;
    return;
  }
  painel.hidden = false;
  document.getElementById('lista-por-pagar').innerHTML = lista.map((b) => {
    const dias = diasAte(b.prazo);
    const prazo = b.atrasado
      ? '<strong>prazo ultrapassado</strong>'
      : `paga até ${formatarData(b.prazo)}${dias !== null && dias <= 3 ? ` (faltam ${dias} dias)` : ''}`;
    return `
      <div class="at-linha">
        <div>
          <div class="at-linha-titulo">${esc(b.documento)} ${selo(b.atrasado ? 'atrasado' : b.estado_boleto)}</div>
          <div class="at-linha-detalhe">fatura ${esc(b.fatura)} · ${prazo}</div>
        </div>
        <div style="text-align:right">
          <div class="at-linha-titulo">${formatarP$(b.valor)}</div>
          <div class="at-linha-detalhe mono">${esc(b.boleto)}</div>
        </div>
      </div>`;
  }).join('');
}

function desenharEntregues(lista) {
  const alvo = document.getElementById('lista-entregues');
  if (!lista.length) {
    alvo.innerHTML =
      '<p class="at-vazio">Ainda não entregou nada à Autoridade Tributária.</p>';
    return;
  }
  alvo.innerHTML = lista.map((a) => `
    <div class="at-linha">
      <div>
        <div class="at-linha-titulo">${esc(a.documento)} ${selo('aprovado')}</div>
        <div class="at-linha-detalhe">${formatarData(a.em)}</div>
      </div>
      <a class="mono at-linha-titulo" style="text-decoration:none"
         href="consultar.html?protocolo=${encodeURIComponent(a.protocolo)}">${esc(a.protocolo)}</a>
    </div>`).join('');
}

// ── carregar ──────────────────────────────────────────────────────────
async function carregar() {
  mostrarMsg(msgGeral, '');

  const [rSituacao, rProposta] = await Promise.all([
    api('orgao_situacao_empresa', { p_cedula: null }),
    api('at_guia_iva_proposta', { p_competencia: COMPETENCIA }),
  ]);

  if (!rSituacao.ok) {
    mostrarMsg(msgGeral, rSituacao.erro, 'erro');
    return;
  }
  const s = rSituacao.dados;

  // Este ecrã é da AT: o que é do Cartório ou do Diário mostra-se lá.
  const porPagar = (s.a_aguardar_pagamento || []).filter((b) => b.orgao === 'AT');
  const entregues = (s.aprovados || []).filter((a) => a.orgao === 'AT');
  const atrasados = porPagar.filter((b) => b.atrasado);

  // Entregue = submetida (mesmo a aguardar pagamento). Paga = já tem
  // protocolo, que é o que o trigger põe quando o boleto é pago.
  const jaPaga = entregues.some((a) => a.tipo === 'guia_iva');
  const jaEntregue = jaPaga || porPagar.some((b) => b.tipo === 'guia_iva');

  desenharSituacao(porPagar, atrasados);
  desenharPorPagar(porPagar);
  desenharEntregues(entregues);
  desenharPeriodo(rProposta.ok ? rProposta.dados : null, jaEntregue, jaPaga);

  if (!rProposta.ok) {
    mostrarMsg(msgGeral, 'Não foi possível calcular o IVA do período: ' + rProposta.erro, 'aviso');
  }
}

async function verificarSessao() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    areaEntrada.hidden = false;
    areaApp.hidden = true;
    return;
  }
  areaEntrada.hidden = true;
  areaApp.hidden = false;
  montarLateral(document.getElementById('lateral'));
  document.getElementById('btn-sair').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.reload();
  });

  const ctx = await minhaEmpresa();
  if (!ctx) {
    areaSemEmpresa.hidden = false;
    document.getElementById('nome-empresa').textContent = 'Sem empresa';
    return;
  }
  empresaAtual = ctx.empresa;
  document.getElementById('nome-empresa').textContent = ctx.empresa.nome;
  document.getElementById('cedula-empresa').textContent = ctx.empresa.cedula;
  areaSituacao.hidden = false;
  await carregar();
}

// Mostrar/esconder a senha. O aria-pressed conta a quem usa leitor de ecrã
// em que estado está o botão; o texto muda para quem o lê.
const btnVerSenha = document.getElementById('btn-ver-senha');
if (btnVerSenha) {
  btnVerSenha.addEventListener('click', () => {
    const campo = document.getElementById('senha');
    const escondida = campo.type === 'password';
    campo.type = escondida ? 'text' : 'password';
    btnVerSenha.textContent = escondida ? 'Esconder' : 'Mostrar';
    btnVerSenha.setAttribute('aria-pressed', String(escondida));
    campo.focus();
  });
}

ligarFormularioLogin(verificarSessao);
verificarSessao();
