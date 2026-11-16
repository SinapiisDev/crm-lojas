-- Parceiro (arquiteto, construtora, imobiliária que indica clientes) x cliente (quem compra).
-- Os dois ficam no mesmo funil de etapas, mas em abas separadas; o painel de vendas conta só clientes.
create type tipo_lead as enum ('cliente', 'parceiro');
alter table leads add column tipo tipo_lead not null default 'cliente';
create index leads_loja_tipo on leads (loja_id, tipo);
