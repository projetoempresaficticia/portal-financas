-- Portal das Finanças (AT): entregar a Guia de IVA, com imposto de valor
-- variável, e corrigir o que conta como IVA dedutível.
--
-- Duas coisas aqui.
--
-- 1. O VALOR VARIÁVEL, sem mexer no que é partilhado.
--    A `orgao_tipos.exige_taxa` é fixa e o IVA devido não é. A solução não
--    foi tornar o `orgao_submeter` variável — que o Cartório partilha e que
--    partiria — mas emitir UM boleto com DUAS linhas: a taxa de
--    processamento (fixa, P$ 20) e o imposto (o que resultar do período).
--    Uma referência só para pagar, e o `trg_orgao_boleto_pago` que já existe
--    aprova a submissão e dá-lhe protocolo quando for paga.
--
-- 2. TAXAS DO ESTADO NÃO SÃO IVA DEDUTÍVEL.
--    A primeira versão (0002) contava todas as faturas recebidas como
--    compras com IVA dedutível — incluindo as taxas do Cartório e do Diário.
--    Não é assim: imposto pago ao Estado não desconta. Continuam a aparecer
--    na lista do e-Fatura, marcadas `dedutivel: false`, mas fora do total.
--    Na Padaria Central isto mudou o IVA a entregar de P$ 0,70 para P$ 12,85.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh) em 2026-09-05.

create or replace function public.fn_e_orgao(p_cedula text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.orgao_tipos ot
      join public.contas c on c.iban = ot.iban_orgao
     where c.cedula = p_cedula);
$$;

revoke execute on function public.fn_e_orgao(text) from public, anon, authenticated;


-- ── e-Fatura, agora a distinguir o que desconta ─────────────────────────
create or replace function public.at_efatura(
  p_competencia text,
  p_empresa text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minha   text := public.fn_minha_empresa_cedula();
  v_alvo    text;
  v_inicio  date;
  v_vendas  jsonb;
  v_compras jsonb;
  v_vb bigint; v_vl bigint; v_vi bigint; v_vn int;
  v_cb bigint; v_cl bigint; v_ci bigint; v_cn int; v_cnd bigint;
  v_periodo record;
begin
  if v_minha is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada à sessão.');
  end if;
  if p_competencia is null or p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'erro', 'Competência inválida. Use AAAA-MM.');
  end if;

  v_alvo := coalesce(nullif(p_empresa, ''), v_minha);
  if v_alvo <> v_minha and not public.fn_fisco_visivel(v_alvo) then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para ver o e-Fatura desta empresa.');
  end if;

  v_inicio := (p_competencia || '-01')::date;

  select jsonb_agg(jsonb_build_object(
           'numero', f.numero,
           'data', to_char(f.emitida_em, 'YYYY-MM-DD'),
           'contraparte', f.devedor_cedula,
           'nome', public.fn_nome_de(f.devedor_cedula),
           'descricao', f.descricao,
           'estado', f.estado,
           'bruto', f.valor_total,
           'base', round(f.valor_total / 1.23)::bigint,
           'iva', f.valor_total - round(f.valor_total / 1.23)::bigint)
         order by f.numero),
         count(*), coalesce(sum(f.valor_total), 0),
         coalesce(sum(round(f.valor_total / 1.23)::bigint), 0)
    into v_vendas, v_vn, v_vb, v_vl
    from public.faturas f
   where f.emitente_cedula = v_alvo
     and f.emitida_em >= v_inicio
     and f.emitida_em <  v_inicio + interval '1 month'
     and f.estado is distinct from 'anulada';
  v_vi := v_vb - v_vl;

  -- Uma taxa do Estado é uma despesa, não uma compra com IVA dedutível.
  -- Aparece na lista — o formando tem de a ver — mas marcada, e fora do
  -- total que desconta.
  select jsonb_agg(jsonb_build_object(
           'numero', f.numero,
           'data', to_char(f.emitida_em, 'YYYY-MM-DD'),
           'contraparte', f.emitente_cedula,
           'nome', public.fn_nome_de(f.emitente_cedula),
           'descricao', f.descricao,
           'estado', f.estado,
           'bruto', f.valor_total,
           'base', round(f.valor_total / 1.23)::bigint,
           'iva', f.valor_total - round(f.valor_total / 1.23)::bigint,
           'dedutivel', not public.fn_e_orgao(f.emitente_cedula))
         order by f.numero),
         count(*),
         coalesce(sum(f.valor_total), 0),
         coalesce(sum(round(f.valor_total / 1.23)::bigint)
                  filter (where not public.fn_e_orgao(f.emitente_cedula)), 0),
         coalesce(sum(f.valor_total - round(f.valor_total / 1.23)::bigint)
                  filter (where public.fn_e_orgao(f.emitente_cedula)), 0)
    into v_compras, v_cn, v_cb, v_cl, v_cnd
    from public.faturas f
   where f.devedor_cedula = v_alvo
     and f.emitida_em >= v_inicio
     and f.emitida_em <  v_inicio + interval '1 month'
     and f.estado is distinct from 'anulada';

  select coalesce(sum(f.valor_total - round(f.valor_total / 1.23)::bigint), 0)
    into v_ci
    from public.faturas f
   where f.devedor_cedula = v_alvo
     and f.emitida_em >= v_inicio
     and f.emitida_em <  v_inicio + interval '1 month'
     and f.estado is distinct from 'anulada'
     and not public.fn_e_orgao(f.emitente_cedula);

  select * into v_periodo from public.at_efatura_periodos
   where empresa_cedula = v_alvo and competencia = p_competencia;

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'competencia', p_competencia,
    'empresa', v_alvo,
    'nome', public.fn_nome_de(v_alvo),
    'vendas',  jsonb_build_object('linhas', coalesce(v_vendas, '[]'::jsonb),
                 'n', v_vn, 'base', v_vl, 'iva', v_vi, 'bruto', v_vb),
    'compras', jsonb_build_object('linhas', coalesce(v_compras, '[]'::jsonb),
                 'n', v_cn, 'base', v_cl, 'iva', v_ci, 'bruto', v_cb,
                 'iva_nao_dedutivel', v_cnd),
    'saft', case when v_periodo.competencia is null then null
                 else jsonb_build_object('comunicado_em', v_periodo.comunicada_em,
                                         'faturas', v_periodo.n_faturas) end));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível ler o e-Fatura.');
end;
$$;

revoke execute on function public.at_efatura(text, text) from public, anon;
grant execute on function public.at_efatura(text, text) to authenticated;


-- ── proposta de Guia de IVA, com o dedutível corrigido ──────────────────
create or replace function public.at_guia_iva_proposta(p_competencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cedula text := public.fn_minha_empresa_cedula();
  v_inicio date;
  v_liquidado bigint;
  v_dedutivel bigint;
  v_base_v bigint;
  v_comunicado boolean;
begin
  if v_cedula is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada à sessão.');
  end if;
  if p_competencia is null or p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'erro', 'Competência inválida. Use AAAA-MM.');
  end if;

  v_inicio := (p_competencia || '-01')::date;

  select coalesce(sum(round(valor_total / 1.23)::bigint), 0),
         coalesce(sum(valor_total), 0) - coalesce(sum(round(valor_total / 1.23)::bigint), 0)
    into v_base_v, v_liquidado
    from public.faturas
   where emitente_cedula = v_cedula
     and emitida_em >= v_inicio and emitida_em < v_inicio + interval '1 month'
     and estado is distinct from 'anulada';

  -- Taxas do Estado fora: não são compras com IVA dedutível.
  select coalesce(sum(valor_total - round(valor_total / 1.23)::bigint), 0)
    into v_dedutivel
    from public.faturas
   where devedor_cedula = v_cedula
     and emitida_em >= v_inicio and emitida_em < v_inicio + interval '1 month'
     and estado is distinct from 'anulada'
     and not public.fn_e_orgao(emitente_cedula);

  v_comunicado := exists (select 1 from public.at_efatura_periodos
                           where empresa_cedula = v_cedula and competencia = p_competencia);

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'competencia', p_competencia,
    'empresa', v_cedula,
    'valor_base', v_base_v,
    'iva_liquidado', v_liquidado,
    'iva_dedutivel', v_dedutivel,
    'valor_iva', v_liquidado - v_dedutivel,
    'a_entregar', greatest(v_liquidado - v_dedutivel, 0),
    'a_recuperar', greatest(v_dedutivel - v_liquidado, 0),
    'saft_comunicado', v_comunicado,
    'taxa', 23));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível calcular a proposta de IVA.');
end;
$$;

revoke execute on function public.at_guia_iva_proposta(text) from public, anon;
grant execute on function public.at_guia_iva_proposta(text) to authenticated;


-- ── a entrega ───────────────────────────────────────────────────────────
create or replace function public.at_entregar_guia_iva(
  p_competencia text,
  p_valor_base bigint,
  p_valor_iva bigint,
  p_dias integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pessoa      record;
  v_empresa     text := public.fn_minha_empresa_cedula();
  r_tipo        record;
  v_at          text;
  v_proposta    jsonb;
  v_base_at     bigint;
  v_iva_at      bigint;
  v_a_entregar  bigint;
  v_dados       jsonb;
  v_linhas      jsonb;
  v_fatura      jsonb;
  v_id          uuid := gen_random_uuid();
  v_motivo      text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem sessão.');
  end if;
  select p.cedula into v_pessoa from public.pessoas p where p.id = auth.uid();
  if v_pessoa.cedula is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem ficha na Carteirinha.');
  end if;
  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro',
      'Só quem está vinculado a uma empresa pode entregar a Guia de IVA.');
  end if;
  if p_competencia is null or p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'erro', 'Competência inválida. Use AAAA-MM.');
  end if;
  if p_valor_base is null or p_valor_iva is null then
    return jsonb_build_object('ok', false, 'erro', 'Preencha a base e o IVA.');
  end if;

  select * into r_tipo from public.orgao_tipos where tipo = 'guia_iva';
  select cedula into v_at from public.contas where iban = r_tipo.iban_orgao;
  if v_at is null then
    return jsonb_build_object('ok', false, 'erro', 'A AT não tem conta configurada.');
  end if;

  -- Uma guia por período. Sem isto, um duplo clique paga a taxa duas vezes.
  if exists (select 1 from public.submissoes
              where tipo = 'guia_iva'
                and empresa_cedula = v_empresa
                and dados->>'competencia' = p_competencia
                and estado in ('aguarda_pagamento', 'aprovado')) then
    return jsonb_build_object('ok', false, 'erro',
      'A Guia de IVA deste período já foi entregue.');
  end if;

  v_proposta := public.at_guia_iva_proposta(p_competencia);
  if not coalesce((v_proposta->>'ok')::boolean, false) then
    return v_proposta;
  end if;

  -- A ordem real: comunica-se o SAF-T, e só depois se declara sobre ele.
  if not coalesce((v_proposta->'dados'->>'saft_comunicado')::boolean, false) then
    return jsonb_build_object('ok', false, 'erro',
      'Comunique primeiro o SAF-T deste período, em e-Fatura.');
  end if;

  v_base_at    := (v_proposta->'dados'->>'valor_base')::bigint;
  v_iva_at     := (v_proposta->'dados'->>'valor_iva')::bigint;
  v_a_entregar := (v_proposta->'dados'->>'a_entregar')::bigint;

  v_dados := jsonb_build_object(
    'competencia', p_competencia,
    'valor_base', p_valor_base::text,
    'valor_iva', p_valor_iva::text);

  -- A AT não acredita no que foi declarado: confere contra o que vê.
  if p_valor_base is distinct from v_base_at or p_valor_iva is distinct from v_iva_at then
    v_motivo := 'Os valores declarados não batem com as faturas do período.';
    insert into public.submissoes(id, tipo, empresa_cedula, submetido_por, dados, estado, motivo)
    values (v_id, 'guia_iva', v_empresa, v_pessoa.cedula, v_dados, 'rejeitado', v_motivo);
    return jsonb_build_object('ok', false, 'erro', v_motivo, 'dados', jsonb_build_object(
      'id', v_id, 'estado', 'rejeitado',
      'declarou', jsonb_build_object('valor_base', p_valor_base, 'valor_iva', p_valor_iva),
      'a_at_ve', jsonb_build_object('valor_base', v_base_at, 'valor_iva', v_iva_at)));
  end if;

  -- Um único boleto com duas linhas: a taxa de processamento, que é fixa, e
  -- o imposto, que é o que resultar do período. É isto que resolve o valor
  -- variável sem mexer no orgao_submeter, que o Cartório partilha.
  v_linhas := jsonb_build_array(jsonb_build_object(
    'descricao', 'Taxa de processamento — Guia de IVA ' || p_competencia,
    'quantidade', 1, 'valor_unitario', r_tipo.exige_taxa));
  if v_a_entregar > 0 then
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'descricao', 'IVA a entregar — ' || p_competencia,
      'quantidade', 1, 'valor_unitario', v_a_entregar));
  end if;

  v_fatura := public.banco_emitir_fatura_interna(
    v_at, v_empresa, 'Guia de IVA ' || p_competencia,
    v_linhas, coalesce(p_dias, 15), 'guia_iva', p_competencia);
  if not coalesce((v_fatura->>'ok')::boolean, false) then
    return v_fatura;
  end if;

  -- Fica a aguardar pagamento; o trigger trg_orgao_boleto_pago aprova-a e
  -- dá-lhe protocolo quando o boleto for pago.
  insert into public.submissoes(id, tipo, empresa_cedula, submetido_por, dados,
    estado, fatura_id)
  values (v_id, 'guia_iva', v_empresa, v_pessoa.cedula, v_dados,
    'aguarda_pagamento', (v_fatura->'dados'->>'fatura_id')::uuid);

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'id', v_id,
    'estado', 'aguarda_pagamento',
    'competencia', p_competencia,
    'taxa', r_tipo.exige_taxa,
    'imposto', v_a_entregar,
    'a_recuperar', (v_proposta->'dados'->>'a_recuperar')::bigint,
    'total', r_tipo.exige_taxa + v_a_entregar,
    'fatura', v_fatura->'dados'->>'numero',
    'boleto', v_fatura->'dados'->>'referencia',
    'prazo', v_fatura->'dados'->>'prazo'));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível entregar a Guia de IVA.');
end;
$$;

revoke execute on function public.at_entregar_guia_iva(text, bigint, bigint, integer) from public, anon;
grant execute on function public.at_entregar_guia_iva(text, bigint, bigint, integer) to authenticated;
