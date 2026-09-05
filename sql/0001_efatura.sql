-- Portal das Finanças (AT): receber e conferir o SAF-T do período.
--
-- A AT não acredita no ficheiro. Recebe-o, recalcula os mesmos totais a
-- partir das faturas que ela própria vê, e compara FATURA A FATURA. Comparar
-- só os totais deixaria passar dois erros que se anulam.
--
-- É esta a peça que dá sentido ao exercício: o formando faz o percurso real
-- de dois sistemas — exporta no Prepacoin, entrega na AT — e se abrir o XML
-- no bloco de notas e mudar um valor, a AT diz-lhe exatamente qual.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh) em 2026-09-05.

-- ── o bucket ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('fisco', 'fisco', false)
on conflict (id) do nothing;

-- A policy de Storage corre como quem chama, não como o dono, por isso não
-- pode usar fn_orgao_cedula diretamente (essa está fechada a authenticated).
-- Este helper é security definer e faz a ponte — mesmo padrão da
-- fn_documento_visivel do Subsight.
create or replace function public.fn_fisco_visivel(p_cedula_pasta text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_minha text;
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.fn_e_professor() then
    return true;
  end if;
  v_minha := public.fn_minha_empresa_cedula();
  if v_minha is null then
    return false;
  end if;
  return v_minha = p_cedula_pasta or v_minha = public.fn_orgao_cedula('AT');
end;
$$;

revoke execute on function public.fn_fisco_visivel(text) from public, anon;
grant execute on function public.fn_fisco_visivel(text) to authenticated;

-- Caminho: <cedula>/<competencia>/saft.xml
create policy "empresa envia o seu saft"
  on storage.objects for insert
  with check (
    bucket_id = 'fisco'
    and (storage.foldername(name))[1] = public.fn_minha_empresa_cedula()
  );

create policy "empresa e AT leem o saft"
  on storage.objects for select
  using (
    bucket_id = 'fisco'
    and public.fn_fisco_visivel((storage.foldername(name))[1])
  );

-- Sem policy de update: um SAF-T entregue não se substitui em silêncio.
create policy "professor remove saft (manutencao)"
  on storage.objects for delete
  using (bucket_id = 'fisco' and public.fn_e_professor());

-- ── o registo do que foi comunicado ─────────────────────────────────────
create table if not exists public.at_efatura_periodos (
  empresa_cedula text not null,
  competencia    text not null,
  n_faturas      int    not null,
  liquido        bigint not null,
  imposto        bigint not null,
  bruto          bigint not null,
  arquivo_url    text,
  comunicada_em  timestamptz not null default now(),
  primary key (empresa_cedula, competencia)
);

comment on table public.at_efatura_periodos is
  'e-Fatura: o que cada empresa comunicou à AT por período, já conferido contra as faturas.';

alter table public.at_efatura_periodos enable row level security;

-- Leitura: a própria empresa, a AT e o professor. Escrita só pela RPC, que
-- é security definer — sem policy de insert/update, a RLS nega tudo.
create policy "empresa e AT leem o periodo comunicado"
  on public.at_efatura_periodos for select
  using (public.fn_fisco_visivel(empresa_cedula));

-- ── a conferência ───────────────────────────────────────────────────────
create or replace function public.at_comunicar_saft(
  p_competencia text,
  p_xml text,
  p_arquivo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cedula      text := public.fn_minha_empresa_cedula();
  v_doc         xml;
  v_empresa_xml text;
  v_inicio_xml  text;
  v_inicio      date;
  v_n_real      int;
  v_liquido     bigint;
  v_imposto     bigint;
  v_bruto       bigint;
  v_divergencias jsonb;
begin
  if v_cedula is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada à sessão.');
  end if;
  -- "is null or" não é redundante: com competência nula o !~ devolve NULL e
  -- o if não dispara.
  if p_competencia is null or p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'erro', 'Competência inválida. Use AAAA-MM.');
  end if;
  if coalesce(p_xml, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Ficheiro vazio.');
  end if;
  if length(p_xml) > 2000000 then
    return jsonb_build_object('ok', false, 'erro', 'Ficheiro grande demais (máximo 2 MB).');
  end if;
  -- Uma DTD com entidades recursivas rebenta o parser antes de chegarmos a
  -- validar seja o que for. O ficheiro vem do browser de um formando; não há
  -- razão nenhuma para trazer entidades.
  if p_xml ~* '<!DOCTYPE|<!ENTITY' then
    return jsonb_build_object('ok', false,
      'erro', 'O ficheiro traz definições de entidades XML e não é aceite.');
  end if;

  begin
    v_doc := p_xml::xml;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'O ficheiro não é XML válido.');
  end;

  v_inicio := (p_competencia || '-01')::date;

  v_empresa_xml := (xpath('/AuditFile/Header/CompanyID/text()', v_doc))[1]::text;
  if v_empresa_xml is distinct from v_cedula then
    return jsonb_build_object('ok', false,
      'erro', 'O ficheiro é de outra empresa e não pode ser comunicado por si.');
  end if;

  v_inicio_xml := (xpath('/AuditFile/Header/StartDate/text()', v_doc))[1]::text;
  if v_inicio_xml is distinct from to_char(v_inicio, 'YYYY-MM-DD') then
    return jsonb_build_object('ok', false,
      'erro', 'O período do ficheiro não é o que está a comunicar.');
  end if;

  -- O que a AT vê, calculado exatamente como o Prepacoin o calculou.
  select count(*),
         coalesce(sum(round(valor_total / 1.23)::bigint), 0),
         coalesce(sum(valor_total), 0)
    into v_n_real, v_liquido, v_bruto
    from public.faturas
   where emitente_cedula = v_cedula
     and emitida_em >= v_inicio
     and emitida_em <  v_inicio + interval '1 month'
     and estado is distinct from 'anulada';
  v_imposto := v_bruto - v_liquido;

  with declaradas as (
    -- O caminho é "/Invoice/…" e não "./…": depois do unnest, o nó de
    -- contexto é o documento que envolve o <Invoice>, não o <Invoice>.
    -- Com "./InvoiceNo" o xpath devolve vazio e TODAS as faturas apareciam
    -- como divergentes, mesmo num ficheiro honesto.
    select (xpath('/Invoice/InvoiceNo/text()', inv))[1]::text as numero,
           round(((xpath('/Invoice/DocumentTotals/GrossTotal/text()', inv))[1]::text)::numeric * 100)::bigint as bruto
      from unnest(xpath('/AuditFile/SourceDocuments/SalesInvoices/Invoice', v_doc)) as t(inv)
  ),
  reais as (
    select numero, valor_total as bruto
      from public.faturas
     where emitente_cedula = v_cedula
       and emitida_em >= v_inicio
       and emitida_em <  v_inicio + interval '1 month'
       and estado is distinct from 'anulada'
  )
  select jsonb_agg(jsonb_build_object(
           'fatura', coalesce(d.numero, r.numero),
           'no_ficheiro', d.bruto,
           'na_at', r.bruto,
           'problema', case
             when r.numero is null then 'está no ficheiro mas a AT não a conhece'
             when d.numero is null then 'a AT vê esta fatura e o ficheiro não a traz'
             else 'o valor não bate' end)
         order by coalesce(d.numero, r.numero))
    into v_divergencias
    from declaradas d
    full outer join reais r on r.numero = d.numero
   where d.numero is null or r.numero is null or d.bruto is distinct from r.bruto;

  if v_divergencias is not null then
    return jsonb_build_object('ok', false,
      'erro', 'O ficheiro não bate com as faturas que a AT vê.',
      'dados', jsonb_build_object('divergencias', v_divergencias));
  end if;

  insert into public.at_efatura_periodos(
    empresa_cedula, competencia, n_faturas, liquido, imposto, bruto, arquivo_url, comunicada_em)
  values (v_cedula, p_competencia, v_n_real, v_liquido, v_imposto, v_bruto, p_arquivo_url, now())
  on conflict (empresa_cedula, competencia) do update
    set n_faturas = excluded.n_faturas,
        liquido   = excluded.liquido,
        imposto   = excluded.imposto,
        bruto     = excluded.bruto,
        arquivo_url = excluded.arquivo_url,
        comunicada_em = excluded.comunicada_em;

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'competencia', p_competencia,
    'faturas', v_n_real,
    'liquido', v_liquido,
    'imposto', v_imposto,
    'bruto', v_bruto));
exception when others then
  -- Sem sqlerrm: o erro cru do Postgres não vai ao browser (R1 da pp-base).
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível comunicar o SAF-T.');
end;
$$;

revoke execute on function public.at_comunicar_saft(text, text, text) from public, anon;
grant execute on function public.at_comunicar_saft(text, text, text) to authenticated;
