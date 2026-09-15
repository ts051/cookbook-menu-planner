const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');

function app() {
  const ctx = vm.createContext({
    window: {}, console: { error() {} },
    document: { addEventListener() {}, querySelector() { return null; }, hidden: false },
    crypto: require('node:crypto').webcrypto,
  });
  vm.runInContext(source, ctx);
  vm.runInContext(`
    currentUser = { id: 'account-b' };
    renderShoppingList = () => {};
    showToast = () => {};
  `, ctx);
  return { ctx, run: code => vm.runInContext(code, ctx) };
}

test('shopping checks use a shared key and roll back failed saves', async () => {
  const { run } = app();
  run(`
    let observed;
    supabaseClient = { from: () => ({ upsert: (row, options) => {
      observed = { row, options }; return Promise.resolve({ error: new Error('offline') });
    } }) };
    state.checks.test = false;
  `);
  await run(`toggleShoppingCheck('test', true)`);
  assert.equal(run('observed.options.onConflict'), 'week_start,item_key');
  assert.equal(run('state.checks.test'), false);
  assert.equal(run('sharedWrites'), 0);
});

test('failed network writes release refresh guard', async () => {
  const { run } = app();
  await assert.rejects(run(`writeShared(Promise.reject(new Error('offline')))`));
  assert.equal(run('sharedWrites'), 0);
  assert.equal(run('sharedRevision'), 2);
});

test('a stale refresh cannot overwrite a later edit or account switch', async () => {
  for (const change of ['sharedRevision += 1', `currentUser = { id: 'account-c' }`]) {
    const { ctx, run } = app();
    let release;
    ctx.response = new Promise(resolve => { release = resolve; });
    run(`supabaseClient = { from: () => ({ select: () => ({
      order: () => response, then: (yes, no) => response.then(yes, no)
    }) }) }; state.recipes = [{ title: 'keep local edit' }];`);
    const loading = run('loadRemote(false)');
    run(change);
    release({ data: [] });
    assert.equal(await loading, false);
    assert.equal(run('state.recipes[0].title'), 'keep local edit');
  }
});

test('refresh reads all shared data without profile writes', async () => {
  const { ctx, run } = app();
  ctx.tables = [];
  run(`supabaseClient = { from: name => {
    tables.push(name);
    const result = { data: name === 'recipes' ? [{ id:'shared', tags:['__meal_type:side'] }] : [] };
    return { select: () => ({ order: () => Promise.resolve(result), then: yes => Promise.resolve(result).then(yes) }) };
  } };`);
  assert.equal(await run('loadRemote(false)'), true);
  assert.deepEqual(ctx.tables, ['recipes', 'meal_plan_entries', 'shopping_checks']);
  assert.equal(run('savedRecipeMealType(state.recipes[0])'), 'side');
});

test('shared recipe loading does not run client-side deduplication', async () => {
  const { run } = app();
  run(`supabaseClient = {}; loadRemote = async () => true; seedDefaultRecipesIfNeeded = async () => {};
    removeDuplicateRecipes = async () => { throw Error('must not delete shared recipes'); };`);
  await run('loadAll()');
});

test('automatic refresh waits for a save or open dialog', async () => {
  const { run } = app();
  run(`supabaseClient = {}; loadRemote = async () => { throw Error('must not refresh'); }; sharedWrites = 1;`);
  await run('refreshSharedViews()');
  assert.equal(run('sharedRefreshPending'), false);
  run(`sharedWrites = 0; document.querySelector = () => ({});`);
  await run('refreshSharedViews()');
  assert.equal(run('sharedRefreshPending'), false);
});
