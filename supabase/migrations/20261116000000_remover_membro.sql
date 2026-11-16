-- Tirar alguém da loja (ex.: vendedora que saiu). Mesma hierarquia dos convites:
-- dono tira qualquer um; gerente tira quem não é dono. Ninguém tira a si mesmo (a loja não fica sem dono por engano).
create policy membros_remover on membros for delete to authenticated using (
  usuario_id <> auth.uid()
  and (meu_cargo(loja_id) = 'dono' or (meu_cargo(loja_id) = 'gerente' and cargo <> 'dono'))
);
