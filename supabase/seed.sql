-- Dados iniciais: a empresa e as duas lojas. Pessoas entram por convite (npm run criar-dono).
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000001', 'Nome da empresa');
insert into lojas (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Loja 1'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Loja 2');

-- Despacho de avisos (só ambiente local; em produção criar com a URL pública e um segredo forte).
select vault.create_secret('http://host.docker.internal:3000/api/avisos/despachar', 'avisos_url');
select vault.create_secret('segredo-local-avisos', 'avisos_segredo');
