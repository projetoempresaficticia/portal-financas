-- Portal das Finanças (AT): ler o e-Fatura e propor a Guia de IVA.
--
-- O e-Fatura é a origem do número que o formando vai declarar. Não se
-- pergunta "quanto é o IVA?" a quem não tem onde ir buscá-lo: mostra-se de
-- onde vem — vendas de um lado, compras do outro — e propõe-se a conta.
--
-- O formando confirma ou corrige. Quando entregar a guia, a AT compara com
-- o que ela própria vê e rejeita se não bater (mesma ideia do
-- at_comunicar_saft, no 0001).
--
-- ATENÇÃO: o 0003 substitui as duas funções deste ficheiro para deixar de
-- contar as taxas do Estado como IVA dedutível. Se este 0002 for reaplicado
-- depois do 0003, essa correção é desfeita em silêncio. Correr sempre por
-- ordem, e nunca este sozinho.

-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh) em 2026-09-05.

-- ── e-Fatura do período ─────────────────────────────────────────────────
-- p_empresa nulo = a minha. Com valor, só a AT e o professor passam — é o
-- que permite à app da AT abrir o e-Fatura de quem está a ser conferido.
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
  v_cb bigint; v_cl bigint; v_ci bigint; v_cn int;
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

  select jsonb_agg(jsonb_build_object(
           'numero', f.numero,
           'data', to_char(f.emitida_em, 'YYYY-MM-DD'),
           'contraparte', f.emitente_cedula,
           'nome', public.fn_nome_de(f.emitente_cedula),
           'descricao', f.descricao,
           'estado', f.estado,
           'bruto', f.valor_total,
           'base', round(f.valor_total / 1.23)::bigint,
           'iva', f.valor_total - round(f.valor_total / 1.23)::bigint)
         order by f.numero),
         count(*), coalesce(sum(f.valor_total), 0),
         coalesce(sum(round(f.valor_total / 1.23)::bigint), 0)
    into v_compras, v_cn, v_cb, v_cl
    from public.faturas f
   where f.devedor_cedula = v_alvo
     and f.emitida_em >= v_inicio
     and f.emitida_em <  v_inicio + interval '1 month'
     and f.estado is distinct from 'anulada';
  v_ci := v_cb - v_cl;

  select * into v_periodo from public.at_efatura_periodos
   where empresa_cedula = v_alvo and competencia = p_competencia;

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'competencia', p_competencia,
    'empresa', v_alvo,
    'nome', public.fn_nome_de(v_alvo),
    'vendas',  jsonb_build_object('linhas', coalesce(v_vendas, '[]'::jsonb),
                 'n', v_vn, 'base', v_vl, 'iva', v_vi, 'bruto', v_vb),
    'compras', jsonb_build_object('linhas', coalesce(v_compras, '[]'::jsonb),
                 'n', v_cn, 'base', v_cl, 'iva', v_ci, 'bruto', v_cb),
    'saft', case when v_periodo.competencia is null then null
                 else jsonb_build_object('comunicado_em', v_periodo.comunicada_em,
                                         'faturas', v_periodo.n_faturas) end));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível ler o e-Fatura.');
end;
$$;

revoke execute on function public.at_efatura(text, text) from public, anon;
grant execute on function public.at_efatura(text, text) to authenticated;


-- ── proposta de Guia de IVA ─────────────────────────────────────────────
create or replace function public.at_guia_iva_proposta(p_competencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cedula text := public.fn_minha_empresa_cedula();
  v_inicio date;
  v_liquidado bigint;  -- IVA das vendas: o que cobrou aos clientes
  v_dedutivel bigint;  -- IVA das compras: o que pagou aos fornecedores
  v_base_v bigint; v_base_c bigint;
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

  select coalesce(sum(round(valor_total / 1.23)::bigint), 0),
         coalesce(sum(valor_total), 0) - coalesce(sum(round(valor_total / 1.23)::bigint), 0)
    into v_base_c, v_dedutivel
    from public.faturas
   where devedor_cedula = v_cedula
     and emitida_em >= v_inicio and emitida_em < v_inicio + interval '1 month'
     and estado is distinct from 'anulada';

  v_comunicado := exists (select 1 from public.at_efatura_periodos
                           where empresa_cedula = v_cedula and competencia = p_competencia);

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object(
    'competencia', p_competencia,
    'empresa', v_cedula,
    'valor_base', v_base_v,
    'iva_liquidado', v_liquidado,
    'iva_dedutivel', v_dedutivel,
    -- Positivo: a entregar ao Estado. Negativo: crédito a reportar.
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
