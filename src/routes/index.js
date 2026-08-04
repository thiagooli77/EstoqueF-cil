const express = require('express');
const models = require('../models');
const crudRoutes = require('./crudRoutes');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const abacatePayRoutes = require('./abacatePayRoutes');
const dashboardController = require('../controllers/dashboardController');
const atendimentoRoutes = require('./atendimentoRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Estoque Facil MVC' });
});

router.use('/auth', authRoutes);
router.use('/autenticacao', authRoutes);
router.use('/abacatepay', abacatePayRoutes);
router.get('/dashboard/summary', dashboardController.summary);
router.use('/atendimento', atendimentoRoutes);

router.use('/usuarios', userRoutes);
router.use('/unidades', crudRoutes(models.unidades));
router.use('/categorias', crudRoutes(models.categorias));
router.use('/fornecedores', crudRoutes(models.fornecedores));
router.use('/ingredientes', crudRoutes(models.ingredientes));
router.use('/produtos', crudRoutes(models.produtos));
router.use('/itens-receita', crudRoutes(models.itensReceita));
router.use('/lotes-estoque', crudRoutes(models.lotesEstoque));
router.use('/movimentacoes-estoque', crudRoutes(models.movimentacoesEstoque));
router.use('/mesas', crudRoutes(models.mesas));
router.use('/pedidos', crudRoutes(models.pedidos));
router.use('/itens-pedido', crudRoutes(models.itensPedido));
router.use('/adicionais-item-pedido', crudRoutes(models.adicionaisItemPedido));
router.use('/caixas', crudRoutes(models.caixas));
router.use('/vendas', crudRoutes(models.vendas));
router.use('/pagamentos', crudRoutes(models.pagamentos));
router.use('/cobrancas-pix', crudRoutes(models.cobrancasPix));
router.use('/compras', crudRoutes(models.compras));
router.use('/itens-compra', crudRoutes(models.itensCompra));

// Aliases antigos mantidos para compatibilidade durante a migracao.
router.use('/users', userRoutes);
router.use('/units', crudRoutes(models.unidades));
router.use('/categories', crudRoutes(models.categorias));
router.use('/suppliers', crudRoutes(models.fornecedores));
router.use('/ingredients', crudRoutes(models.ingredientes));
router.use('/products', crudRoutes(models.produtos));
router.use('/recipe-items', crudRoutes(models.itensReceita));
router.use('/stock-batches', crudRoutes(models.lotesEstoque));
router.use('/stock-movements', crudRoutes(models.movimentacoesEstoque));
router.use('/tables', crudRoutes(models.mesas));
router.use('/orders', crudRoutes(models.pedidos));
router.use('/order-items', crudRoutes(models.itensPedido));
router.use('/order-item-extras', crudRoutes(models.adicionaisItemPedido));
router.use('/cash-sessions', crudRoutes(models.caixas));
router.use('/sales', crudRoutes(models.vendas));
router.use('/payments', crudRoutes(models.pagamentos));
router.use('/pix-charges', crudRoutes(models.cobrancasPix));
router.use('/purchase-orders', crudRoutes(models.compras));
router.use('/purchase-order-items', crudRoutes(models.itensCompra));

module.exports = router;
