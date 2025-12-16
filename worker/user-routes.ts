import { Hono } from "hono";
import type { Context } from 'hono';
import type { Env } from './core-utils';
import { SupplierEntity, InventoryLedgerEntity, TransactionEntity, UserEntity } from "./entities";
import { ok, bad, notFound } from './core-utils';
import type { InventoryLedgerEntry, Supplier, Transaction, User, ConfigUserUpdate } from "@shared/types";
import { HTTPException } from "hono/http-exception";
const unauthorized = () => new HTTPException(401, { message: 'Unauthorized' });
const forbidden = () => new HTTPException(403, { message: 'Forbidden' });
type HonoApp = Hono<{ Bindings: Env; Variables: { user?: User } }>;
const getEprStream = (materialType: string): string => {
  const lowerMat = materialType.toLowerCase();
  if (lowerMat.includes('plastic') || lowerMat.includes('pet')) return 'Plastic';
  if (lowerMat.includes('paper') || lowerMat.includes('cardboard')) return 'Paper & Packaging';
  if (lowerMat.includes('glass')) return 'Glass';
  if (lowerMat.includes('copper') || lowerMat.includes('aluminum') || lowerMat.includes('steel') || lowerMat.includes('metal')) return 'Metals';
  if (lowerMat.includes('electronic') || lowerMat.includes('weee') || lowerMat.includes('battery')) return 'Electrical & Electronic';
  return 'Other';
};
export function userRoutes(app: HonoApp) {
  // --- AUTH MIDDLEWARE ---
  app.use('/api/*', async (c, next) => {
    const path = c.req.path;
    if (['/api/auth/init', '/api/auth/login', '/api/health'].some(p => path.startsWith(p))) {
      return next();
    }
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw unauthorized();
    const token = authHeader.split(' ')[1];
    const user = await new UserEntity(c.env, token).getState();
    if (!user || !user.id || !user.active) throw unauthorized();
    c.set('user', user);
    await next();
  });
  // --- ROLE-BASED MIDDLEWARE ---
  const requireRole = (roles: User['role'][]) => async (c: Context, next: () => Promise<void>) => {
    const user = c.get('user') as User;
    if (!user || !roles.includes(user.role)) throw forbidden();
    await next();
  };
  // --- AUTH ROUTES ---
  app.get('/api/auth/init', async (c) => {
    const allUsers = (await UserEntity.list(c.env, null, 1)).items;
    if (allUsers.length === 0) {
      await UserEntity.ensureSeed(c.env);
      return ok(c, { seeded: true, message: "Initial users seeded." });
    }
    return ok(c, { seeded: false, message: "Users already exist." });
  });
  app.post('/api/auth/login', async (c) => {
    const allUsersCheck = (await UserEntity.list(c.env, null, 1)).items;
    if (allUsersCheck.length === 0) await UserEntity.ensureSeed(c.env);
    const { username, password } = await c.req.json<{ username?: string; password?: string }>();
    if (!username || !password) return bad(c, 'Username and password are required');
    const allUsers = (await UserEntity.list(c.env, null, 100)).items;
    const user = allUsers.find(u => u.username === username && u.password_hash === password);
    if (!user || !user.active) return notFound(c, 'Invalid credentials or inactive user');
    const { password_hash, ...userWithoutPassword } = user;
    return ok(c, { user: userWithoutPassword, token: user.id });
  });
  app.get('/api/auth/me', async (c) => {
    const user = c.get('user');
    if (!user) throw unauthorized();
    const { password_hash, ...userWithoutPassword } = user;
    return ok(c, userWithoutPassword);
  });
  // --- DASHBOARD ---
  app.get('/api/dashboard', async (c) => {
    const user = c.get('user');
    if (!user) throw unauthorized();
    const [suppliersPage, ledgerPage, transactionsPage] = await Promise.all([
      SupplierEntity.list(c.env, null, 500),
      InventoryLedgerEntity.list(c.env, null, 500),
      TransactionEntity.list(c.env, null, 500),
    ]);
    const recentSuppliers = suppliersPage.items.sort((a, b) => b.created_at - a.created_at).slice(0, 5);
    const recentLedger = ledgerPage.items.sort((a, b) => b.capture_timestamp - a.capture_timestamp).slice(0, 5);
    const recentTransactions = transactionsPage.items.sort((a, b) => b.transaction_timestamp - a.transaction_timestamp).slice(0, 5);
    const totalWeight = ledgerPage.items.reduce((sum, item) => sum + item.weight_kg, 0);
    const totalValue = transactionsPage.items.reduce((sum, item) => sum + item.amount, 0);
    const totalEPR = transactionsPage.items.reduce((sum, item) => sum + item.epr_fee, 0);
    const weeeCompliantCount = suppliersPage.items.filter(s => s.is_weee_compliant).length;
    const weeePct = suppliersPage.items.length > 0 ? (weeeCompliantCount / suppliersPage.items.length) * 100 : 0;
    const data = {
      operator: { recentTransactions, recentLedger },
      manager: { totalWeight, totalValue, totalEPR, recentSuppliers, recentLedger },
      admin: { totalWeight, totalValue, totalEPR, weeePct, recentSuppliers, userCount: (await UserEntity.list(c.env, null, 100)).items.length },
      auditor: { totalWeight, totalEPR, weeePct, recentLedger, recentTransactions },
    };
    return ok(c, {
      summary: data[user.role as keyof typeof data] || data.operator,
      hardwareStatus: { scale: 'connected', camera: 'healthy' },
      pendingSyncCount: Math.floor(Math.random() * 5),
    });
  });
  // --- EPR REPORTING (Admin/Auditor) ---
  app.get('/api/epr-report', requireRole(['admin', 'auditor']), async (c) => {
    const [suppliers, ledger, transactions] = await Promise.all([
      SupplierEntity.list(c.env, null, 1000),
      InventoryLedgerEntity.list(c.env, null, 1000),
      TransactionEntity.list(c.env, null, 1000),
    ]);
    const compliance_pct = suppliers.items.length > 0 ? (suppliers.items.filter(s => s.is_weee_compliant).length / suppliers.items.length) * 100 : 0;
    const total_fees = transactions.items.reduce((sum, t) => sum + t.epr_fee, 0);
    const streams: { [key: string]: { weight: number; fees: number } } = {};
    const ledgerMap = new Map(ledger.items.map(l => [l.id, l]));
    transactions.items.forEach(t => {
      const ledgerEntry = ledgerMap.get(t.ledger_entry_id);
      if (ledgerEntry) {
        const streamName = getEprStream(ledgerEntry.material_type);
        if (!streams[streamName]) streams[streamName] = { weight: 0, fees: 0 };
        streams[streamName].weight += ledgerEntry.weight_kg;
        streams[streamName].fees += t.epr_fee;
      }
    });
    return ok(c, {
      compliance_pct,
      total_fees,
      pro_xml_mock_hash: 'mock-xml-cert-hash-for-r2-download.xml',
      streams,
    });
  });
  // --- CONFIGURATION (Admin) ---
  app.get('/api/config/users', requireRole(['admin']), async (c) => {
    const users = (await UserEntity.list(c.env, null, 200)).items;
    const usersWithoutPasswords = users.map(({ password_hash, ...rest }) => rest);
    return ok(c, usersWithoutPasswords);
  });
  app.post('/api/config/users', requireRole(['admin']), async (c) => {
    const updates = await c.req.json<ConfigUserUpdate[]>();
    if (!Array.isArray(updates)) return bad(c, 'Request body must be an array of user updates.');
    const results = await Promise.all(updates.map(async (update) => {
      try {
        const userEntity = new UserEntity(c.env, update.id);
        await userEntity.mutate(currentUser => ({
          ...currentUser,
          role: update.role,
          active: update.active ?? currentUser.active,
          features: update.features ?? currentUser.features ?? [],
        }));
        return { id: update.id, success: true };
      } catch (e) {
        return { id: update.id, success: false, error: e instanceof Error ? e.message : 'Update failed' };
      }
    }));
    return ok(c, results);
  });
  // --- Standard CRUD Routes ---
  app.get('/api/suppliers', async (c) => { await SupplierEntity.ensureSeed(c.env); return ok(c, (await SupplierEntity.list(c.env, null, 100)).items); });
  app.post('/api/suppliers', requireRole(['admin', 'manager']), async (c) => {
    const body = await c.req.json<Partial<Supplier>>();
    if (!body.name?.trim()) return bad(c, 'Supplier name is required');
    const newSupplier: Supplier = { id: crypto.randomUUID(), name: body.name.trim(), contact_person: body.contact_person, phone_number: body.phone_number, email: body.email, address: body.address, epr_number: body.epr_number, is_weee_compliant: body.is_weee_compliant ?? false, created_at: Date.now(), updated_at: Date.now() };
    return ok(c, await SupplierEntity.create(c.env, newSupplier));
  });
  app.delete('/api/suppliers/:id', requireRole(['admin', 'manager']), async (c) => ok(c, { id: c.req.param('id'), deleted: await SupplierEntity.delete(c.env, c.req.param('id')) }));
  app.get('/api/ledger', async (c) => { await InventoryLedgerEntity.ensureSeed(c.env); return ok(c, (await InventoryLedgerEntity.list(c.env, null, 200)).items); });
  app.post('/api/ledger', async (c) => {
    const body = await c.req.json<Partial<InventoryLedgerEntry>>();
    if (!body.supplier_id || !body.material_type || !body.weight_kg) return bad(c, 'supplier_id, material_type, and weight_kg are required');
    const newEntry: InventoryLedgerEntry = { id: body.id || crypto.randomUUID(), supplier_id: body.supplier_id, material_type: body.material_type, weight_kg: body.weight_kg, capture_timestamp: body.capture_timestamp || Date.now(), is_synced: true, created_at: Date.now(), notes: body.notes };
    return ok(c, await InventoryLedgerEntity.create(c.env, newEntry));
  });
  app.get('/api/transactions', async (c) => { await TransactionEntity.ensureSeed(c.env); return ok(c, (await TransactionEntity.list(c.env, null, 200)).items); });
  app.post('/api/transactions', async (c) => {
    const body = await c.req.json<Partial<Transaction>>();
    if (!body.ledger_entry_id || body.amount == null) return bad(c, 'ledger_entry_id and amount are required');
    const newTransaction: Transaction = { id: body.id || crypto.randomUUID(), ledger_entry_id: body.ledger_entry_id, amount: body.amount, currency: body.currency || 'ZAR', payment_method: body.payment_method, transaction_timestamp: body.transaction_timestamp || Date.now(), epr_fee: body.epr_fee || 0, is_synced: true, created_at: Date.now() };
    return ok(c, await TransactionEntity.create(c.env, newTransaction));
  });
  // --- OFFLINE SYNC ---
  app.post('/api/sync/ledger', async (c) => {
    const { pendingEntries } = await c.req.json<{ pendingEntries: InventoryLedgerEntry[] }>();
    if (!Array.isArray(pendingEntries) || pendingEntries.length === 0) return bad(c, 'pendingEntries must be a non-empty array');
    const results = await Promise.all(pendingEntries.map(async entry => {
      try { await InventoryLedgerEntity.create(c.env, { ...entry, is_synced: true }); return { id: entry.id, success: true }; }
      catch (e) { return { id: entry.id, success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }));
    return ok(c, { syncedIds: results.filter(r => r.success).map(r => r.id), errors: results.filter(r => !r.success) });
  });
  app.post('/api/sync/transactions', async (c) => {
    const { pendingTransactions } = await c.req.json<{ pendingTransactions: Transaction[] }>();
    if (!Array.isArray(pendingTransactions) || pendingTransactions.length === 0) return bad(c, 'pendingTransactions must be a non-empty array');
    const results = await Promise.all(pendingTransactions.map(async tx => {
      try { await TransactionEntity.create(c.env, { ...tx, is_synced: true }); return { id: tx.id, success: true }; }
      catch (e) { return { id: tx.id, success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }));
    return ok(c, { syncedIds: results.filter(r => r.success).map(r => r.id), errors: results.filter(r => !r.success) });
  });
  // --- HARDWARE MOCKS ---
  app.get('/api/camera/snapshot', async (c) => {
    const randomId = Math.floor(Math.random() * 1000);
    const imageUrl = `https://images.unsplash.com/photo-1581092919546-23c1c35a828d?q=80&w=800&auto=format&fit=crop&ixid=${randomId}`;
    return ok(c, { imageUrl });
  });
}