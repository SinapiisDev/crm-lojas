-- Dados iniciais: a empresa e as duas lojas. Pessoas entram por convite (npm run criar-dono).
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000001', 'Nome da empresa');
insert into lojas (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Loja 1'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Loja 2');
