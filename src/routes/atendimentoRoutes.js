const express = require('express');
const controller = require('../controllers/atendimentoController');

const router = express.Router();

router.get('/pedidos-abertos', controller.listOpen);
router.get('/mesas/:numero/pedido', controller.showByTable);
router.put('/mesas/:numero/pedido', controller.syncByTable);
router.post('/mesas/:numero/finalizar', controller.closeByTable);

module.exports = router;
