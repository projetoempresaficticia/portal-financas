// Portal das Finanças — verificação pública de um protocolo.
//
// Esta página não exige sessão de propósito: quem precisa de confirmar uma
// entrega é um terceiro — um cliente, um banco, outra empresa — e não a
// empresa que a fez. É o mesmo papel da certidão do Cartório.

async function consultar(protocolo) {
  const msg = document.getElementById('msg-consulta');
  const painel = document.getElementById('resultado');
  const btn = document.getElementById('btn-consultar');

  painel.hidden = true;
  btn.disabled = true;
  mostrarMsg(msg, 'A consultar…');

  const r = await api('orgao_verificar_protocolo', { p_protocolo: protocolo });
  btn.disabled = false;

  if (!r.ok) {
    mostrarMsg(msg, r.erro, 'erro');
    return;
  }
  mostrarMsg(msg, '');
  const d = r.dados;

  document.getElementById('r-documento').textContent = d.documento || 'Protocolo';
  document.getElementById('r-selo').innerHTML =
    d.valido ? selo('aprovado') : selo('rejeitado');

  document.getElementById('r-campos').innerHTML = [
    ['Protocolo', d.protocolo, true],
    ['Órgão', NOME_ORGAO[d.orgao] || d.orgao, false],
    ['Empresa', d.empresa, false],
    ['Entregue em', formatarDataHora(d.criada_em), false],
  ].map(([rot, val, mono]) => `
    <div>
      <p class="at-sobretitulo">${esc(rot)}</p>
      <p class="${mono ? 'mono ' : ''}at-linha-titulo" style="margin:4px 0 0">${esc(val || '—')}</p>
    </div>`).join('');

  // "Íntegro" e "válido" são coisas diferentes, e a diferença importa:
  // um documento pode ter sido aprovado e alterado depois.
  const nota = document.getElementById('r-nota');
  if (d.valido) {
    nota.textContent =
      'Entrega aprovada, e os dados carimbados continuam a bater com o que '
      + 'está registado. Este protocolo é válido.';
  } else if (!d.integro) {
    nota.textContent =
      'ATENÇÃO: os dados foram alterados depois de carimbados. O protocolo '
      + 'existe, mas o conteúdo já não é o que foi aprovado.';
  } else {
    nota.textContent =
      `O protocolo existe, mas a submissão está no estado "${d.estado}" — `
      + 'não foi aprovada.';
  }
  painel.hidden = false;
}

document.getElementById('form-consultar').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const valor = document.getElementById('protocolo').value.trim();
  if (valor) consultar(valor);
});

// Vindo de um link com ?protocolo=…, consulta-se logo.
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const lateral = document.getElementById('lateral');
    lateral.hidden = false;
    montarLateral(lateral);
    document.getElementById('link-entrar').hidden = true;
    const sair = document.getElementById('btn-sair');
    sair.hidden = false;
    sair.addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.replace('index.html');
    });
    const ctx = await minhaEmpresa();
    if (ctx) {
      document.getElementById('nome-empresa').textContent = ctx.empresa.nome;
      document.getElementById('cedula-empresa').textContent = ctx.empresa.cedula;
    }
  }

  const daUrl = new URLSearchParams(window.location.search).get('protocolo');
  if (daUrl) {
    document.getElementById('protocolo').value = daUrl;
    await consultar(daUrl);
  }
})();
