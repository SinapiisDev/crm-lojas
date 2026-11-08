-- Correções da revisão do Plano 5: registro só depois de começar; ata registrada só a gerência corrige.
create or replace function registrar_reuniao(p_reuniao uuid, p_aconteceu boolean, p_ata text) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or auth.uid() is null
     or not (gere_loja(r.loja_id) or (eh_participante(r.id, auth.uid()) and membro_da_loja(auth.uid(), r.loja_id))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if r.cancelada then raise exception 'reuniao_cancelada'; end if;
  if r.inicio > now() then raise exception 'reuniao_nao_comecou'; end if;
  if r.aconteceu is not null and not gere_loja(r.loja_id) then raise exception 'ja_registrada'; end if;
  if p_aconteceu is null then raise exception 'escolha_se_aconteceu'; end if;
  if p_aconteceu and length(trim(coalesce(p_ata, ''))) = 0 then raise exception 'ata_obrigatoria'; end if;
  update reunioes set aconteceu = p_aconteceu, ata = nullif(trim(p_ata), ''), registrada_por = auth.uid(), registrada_em = now()
    where id = r.id;
end $$;
