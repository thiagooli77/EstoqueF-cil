const database = require('../config/database');

const OPEN_STATUSES = ['aberto', 'preparo', 'pronto'];

async function findOpenOrder(connection, tableNumber) {
  const [orders] = await connection.execute(
    `SELECT p.*, m.numero AS mesa_numero
       FROM pedidos p
       JOIN mesas m ON m.id = p.mesa_id
      WHERE m.numero = ? AND p.status IN (?, ?, ?)
      ORDER BY p.id DESC LIMIT 1`,
    [tableNumber, ...OPEN_STATUSES]
  );
  return orders[0];
}

async function attachItems(connection, order) {
  if (!order) return null;
  const [items] = await connection.execute(
    'SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY id',
    [order.id]
  );
  return { ...order, items };
}

exports.listOpen = async (req, res, next) => {
  try {
    const connection = database.getPool();
    const [orders] = await connection.execute(
      `SELECT p.*, m.numero AS mesa_numero
         FROM pedidos p
         JOIN mesas m ON m.id = p.mesa_id
        WHERE p.status IN (?, ?, ?)
        ORDER BY p.criado_em`,
      OPEN_STATUSES
    );
    const result = await Promise.all(orders.map(order => attachItems(connection, order)));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.showByTable = async (req, res, next) => {
  try {
    const connection = database.getPool();
    const order = await findOpenOrder(connection, req.params.numero);
    res.json(await attachItems(connection, order));
  } catch (error) {
    next(error);
  }
};

exports.syncByTable = async (req, res, next) => {
  const connection = await database.getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [tables] = await connection.execute('SELECT id FROM mesas WHERE numero = ? FOR UPDATE', [req.params.numero]);
    if (!tables[0]) {
      const error = new Error('Mesa não encontrada.');
      error.status = 404;
      throw error;
    }

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price ?? item.preco_unitario) * Number(item.quantity ?? item.quantidade)), 0);
    const serviceCharge = subtotal * 0.10;
    const total = subtotal + serviceCharge;
    let order = await findOpenOrder(connection, req.params.numero);

    if (!order) {
      const [created] = await connection.execute(
        `INSERT INTO pedidos (mesa_id, status, subtotal, taxa_atendimento, total)
         VALUES (?, 'aberto', ?, ?, ?)`,
        [tables[0].id, subtotal, serviceCharge, total]
      );
      const [rows] = await connection.execute('SELECT * FROM pedidos WHERE id = ?', [created.insertId]);
      order = { ...rows[0], mesa_numero: req.params.numero };
    } else {
      await connection.execute(
        'UPDATE pedidos SET subtotal = ?, taxa_atendimento = ?, total = ? WHERE id = ?',
        [subtotal, serviceCharge, total, order.id]
      );
      await connection.execute('DELETE FROM itens_pedido WHERE pedido_id = ?', [order.id]);
    }

    for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity ?? item.quantidade) || 1);
      const price = Number(item.price ?? item.preco_unitario) || 0;
      await connection.execute(
        `INSERT INTO itens_pedido
          (pedido_id, produto_id, nome, quantidade, preco_unitario, total, observacoes, status_cozinha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.id, item.productId ?? item.produto_id ?? null, item.name ?? item.nome, quantity, price,
          price * quantity, item.observacoes ?? null, item.status_cozinha ?? 'recebido']
      );
    }

    await connection.execute("UPDATE mesas SET status = 'atendimento' WHERE id = ?", [tables[0].id]);
    await connection.commit();
    res.json(await attachItems(connection, await findOpenOrder(connection, req.params.numero)));
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

exports.closeByTable = async (req, res, next) => {
  const connection = await database.getPool().getConnection();
  try {
    await connection.beginTransaction();
    const order = await findOpenOrder(connection, req.params.numero);
    if (!order) {
      const error = new Error('Pedido aberto não encontrado para esta mesa.');
      error.status = 404;
      throw error;
    }
    await connection.execute("UPDATE pedidos SET status = 'fechado', fechado_em = NOW() WHERE id = ?", [order.id]);
    await connection.execute("UPDATE mesas SET status = 'disponivel' WHERE id = ?", [order.mesa_id]);
    await connection.commit();
    res.json({ id: order.id, status: 'fechado', mesa_numero: req.params.numero });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};
