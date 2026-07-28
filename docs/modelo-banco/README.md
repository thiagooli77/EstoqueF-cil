# Modelagem do banco — Estoque Fácil

Arquivos:

- `modelo-conceitual.md`: visão conceitual e cardinalidades em Mermaid.
- `estoque-facil.dbml`: modelo lógico completo e importável em ferramentas
  compatíveis com DBML.
- `../../src/database/mysql_schema.sql`: modelo físico MySQL usado pela
  aplicação.

## Uso no brModelo

O brModelo 3 utiliza o formato nativo `.brM3`, mantido pelo próprio aplicativo.
Use o modelo conceitual como guia para desenhar as entidades e relacionamentos
no brModelo. Depois, gere o esquema lógico pela função de transformação do
programa e compare-o com `estoque-facil.dbml` e `mysql_schema.sql`.

O projeto possui 19 entidades/tabelas e 27 relacionamentos por chave
estrangeira.
