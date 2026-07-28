# Modelo conceitual — Estoque Fácil

Este modelo representa os conceitos do negócio e suas cardinalidades. O modelo
lógico completo, com atributos, tipos, chaves primárias e estrangeiras, está em
`estoque-facil.dbml`. O modelo físico MySQL permanece em
`src/database/mysql_schema.sql`.

```mermaid
erDiagram
    USUARIO ||--o{ PEDIDO : cria
    USUARIO ||--o{ MOVIMENTACAO_ESTOQUE : registra
    USUARIO ||--o{ CAIXA : abre_fecha
    USUARIO ||--o{ VENDA : realiza

    UNIDADE ||--o{ INGREDIENTE : mede
    FORNECEDOR ||--o{ INGREDIENTE : fornece
    FORNECEDOR ||--o{ LOTE_ESTOQUE : entrega
    FORNECEDOR ||--o{ COMPRA : recebe

    CATEGORIA ||--o{ PRODUTO : classifica
    PRODUTO ||--o{ ITEM_RECEITA : possui
    INGREDIENTE ||--o{ ITEM_RECEITA : compoe

    INGREDIENTE ||--o{ LOTE_ESTOQUE : possui
    INGREDIENTE ||--o{ MOVIMENTACAO_ESTOQUE : movimenta
    LOTE_ESTOQUE ||--o{ MOVIMENTACAO_ESTOQUE : detalha

    MESA ||--o{ PEDIDO : recebe
    PEDIDO ||--|{ ITEM_PEDIDO : contem
    PRODUTO ||--o{ ITEM_PEDIDO : referencia
    ITEM_PEDIDO ||--o{ ADICIONAL_ITEM : recebe

    CAIXA ||--o{ VENDA : registra
    PEDIDO ||--o| VENDA : origina
    VENDA ||--o{ PAGAMENTO : recebe
    PEDIDO ||--o{ PAGAMENTO : associa
    PEDIDO ||--o{ COBRANCA_PIX : gera
    VENDA ||--o{ COBRANCA_PIX : liquida

    COMPRA ||--|{ ITEM_COMPRA : contem
    INGREDIENTE ||--o{ ITEM_COMPRA : adquirido
```

## Entidades associativas

- `ITEM_RECEITA` resolve a relação N:N entre produto e ingrediente.
- `ITEM_COMPRA` resolve a relação N:N entre compra e ingrediente.
- `ITEM_PEDIDO` registra os produtos de cada pedido e preserva nome e preço
  históricos.

## Regras principais

- Um pedido pode estar ligado a uma mesa ou representar atendimento sem mesa.
- Um pedido contém um ou mais itens; a exclusão do pedido remove seus itens.
- Um produto pode possuir vários ingredientes por meio dos itens de receita.
- Uma venda pode receber vários pagamentos e cobranças PIX.
- Compras pertencem a um fornecedor e contêm um ou mais ingredientes.
- Movimentações registram entrada, saída, ajuste ou perda de ingredientes.
