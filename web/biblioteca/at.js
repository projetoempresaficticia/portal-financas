// Portal das Finanças — utilitários da biblioteca deste app.
// O cliente Supabase (`sb`) e o `api()` vêm do comum.js da pp-base.

// Dinheiro é bigint em cêntimos de P$; formatar só no ecrã.
function formatarP$(centimos) {
  return 'P$ ' + (Number(centimos || 0) / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function diasAte(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

// A competência é texto "AAAA-MM", nunca uma data — é a regra da pp-base
// para o que só se parece com data.
function competenciaAtual() {
  const h = new Date();
  return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0');
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function competenciaPorExtenso(comp) {
  if (!comp) return '—';
  const [ano, mes] = comp.split('-');
  return MESES[Number(mes) - 1] + ' de ' + ano;
}

const NOME_ORGAO = {
  AT: 'Autoridade Tributária',
  cartorio: 'Cartório Notarial',
  seg_social: 'Segurança Social',
  diario: 'Diário da República',
};

// Ícone e palavra em todos, nunca só a cor: quem não distingue verde de
// vermelho tem de continuar a saber em que estado está.
function selo(estado) {
  const mapa = {
    aprovado:          ['at-selo-ok',    'Entregue'],
    pago:              ['at-selo-ok',    'Pago'],
    rejeitado:         ['at-selo-erro',  'Rejeitado'],
    atrasado:          ['at-selo-erro',  'Prazo ultrapassado'],
    aguarda_pagamento: ['at-selo-aviso', 'Aguarda pagamento'],
    por_pagar:         ['at-selo-aviso', 'Por pagar'],
    em_pagamento:      ['at-selo-info',  'A aguardar aprovação'],
    em_analise:        ['at-selo-info',  'Em análise'],
  };
  const [classe, texto] = mapa[estado] || ['at-selo-info', estado];
  return `<span class="at-selo ${classe}">${esc(texto)}</span>`;
}

function mostrarMsg(el, texto, tipo) {
  if (!el) return;
  el.textContent = texto || '';
  el.className = 'at-msg' + (tipo ? ' at-msg-' + tipo : '');
}

// Escapar texto que vem da base antes de o pôr em innerHTML.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ligarFormularioLogin(aoEntrar) {
  const form = document.getElementById('form-login');
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('msg-login');
    mostrarMsg(msg, 'A entrar…');
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById('email').value,
      password: document.getElementById('senha').value,
    });
    if (error) {
      mostrarMsg(msg, 'Login inválido.', 'erro');
      return;
    }
    mostrarMsg(msg, '');
    await aoEntrar();
  });
}

// A empresa que a pessoa logada representa.
async function minhaEmpresa() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  const { data: pessoa } = await sb
    .from('pessoas').select('cedula, nome, empresa_id')
    .eq('id', data.session.user.id).single();
  if (!pessoa || !pessoa.empresa_id) return null;
  const { data: empresa } = await sb
    .from('empresas').select('cedula, nome, setor, regiao, estado')
    .eq('id', pessoa.empresa_id).single();
  return empresa ? { pessoa, empresa } : null;
}

// A versão do site, tirada do <meta> desta página.
//
// Os links internos levam-na no endereço. Sem isto, cada clique na barra
// lateral vai buscar a entrada de cache antiga daquela página — o GitHub
// Pages guarda o HTML dez minutos — e carrega o JS e o CSS velhos que essa
// página nomeia. O atualizar.js ainda recupera, mas só depois de a página
// velha ter corrido: dá o erro à vista e repete-se a cada aba.
function versaoDoSite() {
  const m = document.querySelector('meta[name="at-versao"]');
  return (m && m.content) ? m.content : '';
}

function comVersao(href) {
  const v = versaoDoSite();
  if (!v || /^https?:/.test(href)) return href;
  return href + (href.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(v);
}

// A barra lateral é igual em todas as páginas; montá-la aqui evita seis
// cópias que se desalinham à primeira alteração.
const AT_PAGINAS = [
  { href: 'index.html',      icone: 'inicio',      nome: 'Início' },
  { href: 'efatura.html',    icone: 'efatura',     nome: 'e-Fatura' },
  { href: 'declaracoes.html', icone: 'declaracoes', nome: 'Declarações' },
  { href: 'pagamentos.html', icone: 'pagamentos',  nome: 'Pagamentos' },
  { href: 'consultar.html',  icone: 'escudo',      nome: 'Consultar' },
];

function paginaAtual() {
  const f = window.location.pathname.split('/').pop();
  return f === '' ? 'index.html' : f;
}

function montarLateral(alvo) {
  const atual = paginaAtual();
  alvo.innerHTML = `
    <div class="at-marca">
      <img src="web/marca/at-marca.webp" alt="" width="36" height="36" />
      <span class="at-marca-nome">Portal das Finanças<small>Prepara Portugal</small></span>
    </div>
    <nav aria-label="Navegação principal">
      ${AT_PAGINAS.map((p) => `
        <a href="${comVersao(p.href)}" ${p.href === atual ? 'aria-current="page"' : ''}>
          <span class="at-icone i-${p.icone}" aria-hidden="true"></span>
          ${esc(p.nome)}
        </a>`).join('')}
    </nav>
`;
}

// Arranque das páginas internas. Sem sessão volta-se à entrada, em vez de
// mostrar um esqueleto vazio a quem não entrou.
async function arrancarPagina(aoCarregar) {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.replace('index.html');
    return null;
  }
  montarLateral(document.getElementById('lateral'));

  const btnSair = document.getElementById('btn-sair');
  if (btnSair) {
    btnSair.addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.replace('index.html');
    });
  }

  const ctx = await minhaEmpresa();
  const nome = document.getElementById('nome-empresa');
  const ced = document.getElementById('cedula-empresa');

  if (!ctx) {
    if (nome) nome.textContent = 'Sem empresa';
    const sem = document.getElementById('area-sem-empresa');
    if (sem) sem.hidden = false;
    return null;
  }
  if (nome) nome.textContent = ctx.empresa.nome;
  if (ced) ced.textContent = ctx.empresa.cedula;

  const conteudo = document.getElementById('area-conteudo');
  if (conteudo) conteudo.hidden = false;
  await aoCarregar(ctx);
  return ctx;
}

// O seletor de mês, igual nas três páginas que o usam.
function ligarSeletorMes(id, aoMudar) {
  const campo = document.getElementById(id);
  if (!campo) return null;
  campo.value = competenciaAtual();
  campo.addEventListener('change', () => {
    if (campo.value) aoMudar(campo.value);
  });
  return campo;
}

// Os links escritos à mão no HTML levam a versão também — não só os que
// este ficheiro gera. Sem isto, clicar em "Consultar um protocolo" a
// partir da entrada caía outra vez na cópia em cache dessa página.
function versionarLinks() {
  document.querySelectorAll('a[href$=".html"]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h || /^https?:/.test(h) || h.includes('v=')) return;
    a.setAttribute('href', comVersao(h));
  });
}
document.addEventListener('DOMContentLoaded', versionarLinks);
