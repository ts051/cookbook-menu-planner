const config = window.COOKBOOK_APP_CONFIG || {};
const isConfigured = Boolean(
  config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
);

const STORAGE_KEY = "cookbook-menu-planner:v2";
const LEGACY_STORAGE_KEY = "cookbook-menu-planner:v1";
const DEFAULT_RECIPE_SEED_KEY = "cookbook-menu-planner-default-recipes:rakulifemiho-ver1-4";
const INTERNAL_EMAIL_DOMAIN = "cookbook.local";
const LEGACY_EMAIL_DOMAIN = "cookbook.example.com";
const USERNAME_PATTERN = /^[a-z0-9._-]{1,40}$/;
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const mealSlots = [
  { id: "breakfast", label: "朝" },
  { id: "lunch", label: "昼" },
  { id: "dinner", label: "夜" }
];

let supabaseClient = null;
let currentUser = null;
let currentDialogRecipeId = "";
let toastTimer = null;
const selectedRecipeIds = new Set();
const els = {};
const state = {
  recipes: [],
  plan: [],
  checks: {},
  profile: null,
  activeView: "home",
  weekCursor: startOfWeek(new Date())
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  bindEvents();
  await setupStorage();
  await loadAll();
  render();
}

function bindElements() {
  [
    "storageBadge", "menuButton", "menuOverlay", "appMenu", "menuCloseButton", "menuUserName", "menuStatus",
    "profileForm", "displayNameInput", "newPasswordInput", "syncButton", "signOutButton", "authPanel", "authForm",
    "usernameInput", "passwordInput", "authBadge", "appContent", "openWeekButton", "plannedMealCount", "selectionTray",
    "selectedCount", "selectionHint", "clearSelectionButton", "scheduleSelectionButton", "genreContainer", "weekRange",
    "prevWeekButton", "currentWeekButton", "nextWeekButton", "weeklyGrid", "shoppingWeekRange", "shoppingProgress",
    "shoppingList", "prevShoppingWeekButton", "currentShoppingWeekButton", "nextShoppingWeekButton", "recipeDialog", "closeRecipeDialog", "dialogRecipeImage", "dialogRecipeGenre", "dialogRecipeTitle",
    "dialogRecipeMeta", "dialogIngredients", "dialogSteps", "dialogSelectButton", "scheduleDialog", "scheduleForm",
    "closeScheduleDialog", "cancelScheduleButton", "scheduleRows", "scheduleMessage", "toast"
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  els.menuButton.addEventListener("click", toggleMenu);
  els.menuCloseButton.addEventListener("click", closeMenu);
  els.menuOverlay.addEventListener("click", closeMenu);
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.profileForm.addEventListener("submit", handleProfileSave);
  els.signOutButton.addEventListener("click", signOut);
  els.syncButton.addEventListener("click", async () => { await loadAll(); render(); closeMenu(); showToast("最新データを読み込みました"); });
  document.querySelectorAll("[data-view-link]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
  els.openWeekButton.addEventListener("click", () => switchView("week"));
  els.clearSelectionButton.addEventListener("click", clearSelection);
  els.scheduleSelectionButton.addEventListener("click", openScheduleDialog);
  els.prevWeekButton.addEventListener("click", () => moveWeek(-1));
  els.nextWeekButton.addEventListener("click", () => moveWeek(1));
  els.currentWeekButton.addEventListener("click", () => { state.weekCursor = startOfWeek(new Date()); renderWeekViews(); });
  els.prevShoppingWeekButton.addEventListener("click", () => moveWeek(-1));
  els.nextShoppingWeekButton.addEventListener("click", () => moveWeek(1));
  els.currentShoppingWeekButton.addEventListener("click", () => { state.weekCursor = startOfWeek(new Date()); renderWeekViews(); });
  els.closeRecipeDialog.addEventListener("click", () => els.recipeDialog.close());
  els.dialogSelectButton.addEventListener("click", toggleDialogRecipeSelection);
  els.closeScheduleDialog.addEventListener("click", () => els.scheduleDialog.close());
  els.cancelScheduleButton.addEventListener("click", () => els.scheduleDialog.close());
  els.scheduleForm.addEventListener("submit", saveSchedule);
  [els.recipeDialog, els.scheduleDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
}

function render() {
  renderAuth();
  renderAccountMenu();
  renderNavigation();
  renderHome();
  renderWeekViews();
}

function renderNavigation() {
  document.querySelectorAll("[data-view-link]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewLink === state.activeView);
  });
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("hidden", view.dataset.view !== state.activeView));
}

function switchView(view) {
  if (!["home", "week", "shopping"].includes(view)) return;
  state.activeView = view;
  renderNavigation();
  if (view === "week") renderWeek();
  if (view === "shopping") renderShoppingList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const book = window.HOTCOOK_RECIPE_BOOK;
  const genres = [...(book?.genres || [])];
  const knownTitles = new Set((book?.recipes || []).map((recipe) => recipe.title));
  const customRecipes = state.recipes.filter((recipe) => !knownTitles.has(recipe.title));
  if (customRecipes.length) genres.push({ id: "other", title: "その他のメニュー", description: "追加したレシピ", custom: true });

  els.genreContainer.innerHTML = "";
  genres.forEach((genre) => {
    const recipes = state.recipes.filter((recipe) => recipeGenreId(recipe) === genre.id);
    if (!recipes.length) return;
    const section = document.createElement("section");
    section.className = "genre-section";
    section.innerHTML = `
      <div class="genre-heading">
        <div><h2>${escapeHTML(genre.title)}</h2><p>${escapeHTML(genre.description || "")}</p></div>
        <span class="genre-count">${recipes.length}品</span>
      </div>
      <div class="recipe-grid"></div>
    `;
    const grid = section.querySelector(".recipe-grid");
    recipes.forEach((recipe) => grid.append(createRecipeCard(recipe)));
    els.genreContainer.append(section);
  });

  const planned = state.plan.filter((entry) => isDateInWeek(entry.plan_date, state.weekCursor)).length;
  els.plannedMealCount.textContent = String(planned);
  renderSelectionTray();
}

function createRecipeCard(recipe) {
  const card = document.createElement("article");
  card.className = `recipe-card${selectedRecipeIds.has(recipe.id) ? " selected" : ""}`;
  card.innerHTML = `
    <button class="recipe-open" type="button" aria-label="${escapeHTML(recipe.title)}の詳細を見る">
      <img class="recipe-thumb" src="${escapeHTML(recipeImage(recipe))}" alt="${escapeHTML(recipe.title)}" loading="lazy" />
      <div class="recipe-card-body">
        <h3>${escapeHTML(recipe.title)}</h3>
        <div class="recipe-meta"><span>${recipe.servings || 4}人分</span><span>${escapeHTML(recipe.source_title || "")}</span></div>
      </div>
    </button>
    <label class="recipe-check-label" aria-label="${escapeHTML(recipe.title)}を選択">
      <input class="recipe-check" type="checkbox" ${selectedRecipeIds.has(recipe.id) ? "checked" : ""} />
    </label>
  `;
  card.querySelector(".recipe-open").addEventListener("click", () => openRecipeDialog(recipe));
  card.querySelector(".recipe-check").addEventListener("change", (event) => setRecipeSelected(recipe.id, event.target.checked));
  return card;
}

function renderSelectionTray() {
  const count = selectedRecipeIds.size;
  els.selectedCount.textContent = String(count);
  els.scheduleSelectionButton.disabled = count === 0;
  els.clearSelectionButton.classList.toggle("hidden", count === 0);
  els.selectionHint.textContent = count ? "曜日と朝・昼・夜を指定して登録できます" : "料理のチェックボックスを選んでください";
}

function setRecipeSelected(id, selected) {
  if (selected) selectedRecipeIds.add(id);
  else selectedRecipeIds.delete(id);
  renderHome();
  if (currentDialogRecipeId === id && els.recipeDialog.open) updateDialogSelectButton();
}

function clearSelection() {
  selectedRecipeIds.clear();
  renderHome();
}

function openRecipeDialog(recipe) {
  currentDialogRecipeId = recipe.id;
  els.dialogRecipeImage.src = recipeImage(recipe);
  els.dialogRecipeImage.alt = recipe.title;
  els.dialogRecipeGenre.textContent = recipeGenreTitle(recipe);
  els.dialogRecipeTitle.textContent = recipe.title;
  els.dialogRecipeMeta.textContent = [recipe.source_title, `${recipe.servings || 4}人分`].filter(Boolean).join(" ・ ");
  els.dialogIngredients.innerHTML = (recipe.ingredients || []).map((item) => `<div class="ingredient-row"><span>${escapeHTML(item.name)}</span><span>${escapeHTML(formatIngredientAmount(item))}</span></div>`).join("");
  els.dialogSteps.innerHTML = (recipe.steps || []).map((step) => `<li>${escapeHTML(step)}</li>`).join("");
  updateDialogSelectButton();
  els.recipeDialog.showModal();
}

function updateDialogSelectButton() {
  const selected = selectedRecipeIds.has(currentDialogRecipeId);
  els.dialogSelectButton.textContent = selected ? "選択を解除" : "この料理を選択";
  els.dialogSelectButton.classList.toggle("secondary-button", selected);
}

function toggleDialogRecipeSelection() {
  const selected = !selectedRecipeIds.has(currentDialogRecipeId);
  setRecipeSelected(currentDialogRecipeId, selected);
  els.recipeDialog.close();
  if (selected) showToast("料理を選択しました");
}

function openScheduleDialog() {
  const recipes = state.recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
  if (!recipes.length) return;
  els.scheduleRows.innerHTML = "";
  els.scheduleMessage.textContent = "";
  recipes.forEach((recipe, index) => {
    const row = document.createElement("div");
    row.className = "schedule-row";
    row.dataset.recipeId = recipe.id;
    row.innerHTML = `
      <div class="schedule-recipe"><img src="${escapeHTML(recipeImage(recipe))}" alt="" /><strong>${escapeHTML(recipe.title)}</strong></div>
      <select class="schedule-day" aria-label="${escapeHTML(recipe.title)}の曜日">${weekDayOptions(index)}</select>
      <select class="schedule-slot" aria-label="${escapeHTML(recipe.title)}の時間帯">${mealSlots.map((slot) => `<option value="${slot.id}">${slot.label}</option>`).join("")}</select>
    `;
    row.querySelector(".schedule-slot").value = "dinner";
    els.scheduleRows.append(row);
  });
  els.scheduleDialog.showModal();
}

function weekDayOptions(offset) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(state.weekCursor, index);
    const selected = index === offset % 7 ? " selected" : "";
    return `<option value="${toISODate(date)}"${selected}>${weekdays[index]} ${date.getMonth() + 1}/${date.getDate()}</option>`;
  }).join("");
}

async function saveSchedule(event) {
  event.preventDefault();
  const rows = Array.from(els.scheduleRows.querySelectorAll(".schedule-row"));
  const entries = rows.map((row) => ({
    id: crypto.randomUUID(),
    plan_date: row.querySelector(".schedule-day").value,
    meal_slot: row.querySelector(".schedule-slot").value,
    recipe_id: row.dataset.recipeId
  }));
  const keys = entries.map((entry) => `${entry.plan_date}:${entry.meal_slot}`);
  if (new Set(keys).size !== keys.length) {
    els.scheduleMessage.textContent = "同じ曜日・時間には1品だけ登録できます。選択を変更してください。";
    return;
  }

  if (canUseRemote()) {
    const payload = entries.map((entry) => ({ ...entry, user_id: currentUser.id }));
    const { error } = await supabaseClient.from("meal_plan_entries").upsert(payload, { onConflict: "user_id,plan_date,meal_slot" });
    if (error) {
      console.error(error);
      els.scheduleMessage.textContent = "登録できませんでした。もう一度お試しください。";
      return;
    }
    await loadRemote();
  } else {
    const entryKeys = new Set(keys);
    state.plan = state.plan.filter((entry) => !entryKeys.has(`${entry.plan_date}:${entry.meal_slot}`));
    state.plan.push(...entries);
    saveLocal();
  }

  selectedRecipeIds.clear();
  els.scheduleDialog.close();
  render();
  switchView("week");
  showToast(`${entries.length}件を1週間メニューに登録しました`);
}

function renderWeekViews() {
  renderWeek();
  renderShoppingList();
  if (els.plannedMealCount) {
    els.plannedMealCount.textContent = String(state.plan.filter((entry) => isDateInWeek(entry.plan_date, state.weekCursor)).length);
  }
}

function renderWeek() {
  const end = addDays(state.weekCursor, 6);
  els.weekRange.textContent = formatWeekRange(state.weekCursor, end);
  els.weeklyGrid.innerHTML = "";
  const today = toISODate(new Date());
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(state.weekCursor, index);
    const iso = toISODate(date);
    const column = document.createElement("article");
    column.className = `day-column${iso === today ? " today" : ""}`;
    column.innerHTML = `<div class="day-heading"><strong>${weekdays[index]}</strong><span>${date.getMonth() + 1}/${date.getDate()}</span></div><div class="meal-slots"></div>`;
    const slots = column.querySelector(".meal-slots");
    mealSlots.forEach((slot) => {
      const entry = state.plan.find((item) => item.plan_date === iso && item.meal_slot === slot.id);
      const recipe = entry ? state.recipes.find((item) => item.id === entry.recipe_id) : null;
      const container = document.createElement("div");
      container.className = "meal-slot";
      container.innerHTML = `<span class="meal-slot-label">${slot.label}</span>`;
      if (recipe) {
        const card = document.createElement("div");
        card.className = "meal-card";
        card.innerHTML = `<img src="${escapeHTML(recipeImage(recipe))}" alt="" /><strong>${escapeHTML(recipe.title)}</strong><button class="remove-meal" type="button">削除</button>`;
        card.querySelector("img").addEventListener("click", () => openRecipeDialog(recipe));
        card.querySelector("strong").addEventListener("click", () => openRecipeDialog(recipe));
        card.querySelector(".remove-meal").addEventListener("click", () => removePlanEntry(entry));
        container.append(card);
      } else {
        const empty = document.createElement("span");
        empty.className = "empty-slot";
        empty.textContent = "未登録";
        container.append(empty);
      }
      slots.append(container);
    });
    els.weeklyGrid.append(column);
  }
}

async function removePlanEntry(entry) {
  if (canUseRemote()) {
    const { error } = await supabaseClient.from("meal_plan_entries").delete().eq("id", entry.id);
    if (error) { console.error(error); showToast("削除できませんでした"); return; }
    await loadRemote();
  } else {
    state.plan = state.plan.filter((item) => item.id !== entry.id);
    saveLocal();
  }
  renderWeekViews();
  showToast("1週間メニューから削除しました");
}

function moveWeek(delta) {
  state.weekCursor = addDays(state.weekCursor, delta * 7);
  renderWeekViews();
}

function renderShoppingList() {
  const end = addDays(state.weekCursor, 6);
  els.shoppingWeekRange.textContent = formatWeekRange(state.weekCursor, end);
  const items = getShoppingItems();
  els.shoppingList.innerHTML = "";
  if (!items.length) {
    els.shoppingList.innerHTML = `<div class="empty-state">1週間メニューを登録すると、必要な食材がここにまとまります。</div>`;
    els.shoppingProgress.textContent = "0 / 0";
    return;
  }
  let checkedCount = 0;
  items.forEach((item) => {
    const checked = Boolean(state.checks[item.key]);
    if (checked) checkedCount += 1;
    const label = document.createElement("label");
    label.className = `shopping-item${checked ? " checked" : ""}`;
    label.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} /><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.amount)}</span>`;
    label.querySelector("input").addEventListener("change", (event) => toggleShoppingCheck(item.key, event.target.checked));
    els.shoppingList.append(label);
  });
  els.shoppingProgress.textContent = `${checkedCount} / ${items.length}`;
}

function getShoppingItems() {
  const entries = state.plan.filter((entry) => isDateInWeek(entry.plan_date, state.weekCursor));
  const bucket = new Map();
  entries.forEach((entry) => {
    const recipe = state.recipes.find((item) => item.id === entry.recipe_id);
    (recipe?.ingredients || []).forEach((ingredient) => {
      const name = normalizeIngredientName(ingredient.name);
      if (!name) return;
      const unit = ingredient.unit || "";
      const key = `${toISODate(state.weekCursor)}:${name}:${unit}`;
      const current = bucket.get(key) || { key, name, unit, quantity: 0, raw: [] };
      if (typeof ingredient.quantity === "number" && Number.isFinite(ingredient.quantity)) current.quantity += ingredient.quantity;
      else current.raw.push(formatIngredient(ingredient));
      bucket.set(key, current);
    });
  });
  return Array.from(bucket.values()).map((item) => ({
    key: item.key,
    name: item.name,
    amount: item.quantity ? `${roundQuantity(item.quantity)}${item.unit}` : [...new Set(item.raw)].join(" / ")
  })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

async function toggleShoppingCheck(key, checked) {
  state.checks[key] = checked;
  if (canUseRemote()) {
    const { error } = await supabaseClient.from("shopping_checks").upsert({
      user_id: currentUser.id,
      week_start: toISODate(state.weekCursor),
      item_key: key,
      checked
    }, { onConflict: "user_id,week_start,item_key" });
    if (error) console.error(error);
  } else saveLocal();
  renderShoppingList();
}

function recipeBookEntry(recipe) {
  return (window.HOTCOOK_RECIPE_BOOK?.recipes || []).find((item) => item.title === recipe.title);
}

function recipeImage(recipe) {
  return recipeBookEntry(recipe)?.thumbnail || "./assets/cookbook-worktop.png";
}

function recipeGenreId(recipe) {
  return recipeBookEntry(recipe)?.genre || "other";
}

function recipeGenreTitle(recipe) {
  const id = recipeGenreId(recipe);
  return window.HOTCOOK_RECIPE_BOOK?.genres?.find((genre) => genre.id === id)?.title || "その他のメニュー";
}

async function setupStorage() {
  if (!isConfigured) {
    els.storageBadge.textContent = "Local";
    return;
  }
  try {
    await loadScript("https://unpkg.com/@supabase/supabase-js@2", "supabase-js");
    supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    els.storageBadge.textContent = "Cloud";
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data.session?.user || null;
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      await loadAll();
      render();
    });
  } catch (error) {
    console.error(error);
    supabaseClient = null;
    els.storageBadge.textContent = "Local";
  }
}

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    const timeout = window.setTimeout(() => reject(new Error(`Script load timed out: ${src}`)), 7000);
    script.onload = () => { window.clearTimeout(timeout); resolve(); };
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Script load failed: ${src}`)); };
    document.head.append(script);
  });
}

function canUseRemote() {
  return Boolean(supabaseClient && (!config.REQUIRE_AUTH || currentUser));
}

async function loadAll() {
  if (canUseRemote()) {
    const loaded = await loadRemote();
    if (loaded) await seedDefaultRecipesIfNeeded();
  } else {
    loadLocal();
    await seedDefaultRecipesIfNeeded();
  }
}

async function loadRemote() {
  const [recipesResult, planResult, checksResult, profileResult] = await Promise.all([
    supabaseClient.from("recipes").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("meal_plan_entries").select("*").order("plan_date", { ascending: true }),
    supabaseClient.from("shopping_checks").select("*"),
    supabaseClient.from("profiles").select("id, username").eq("id", currentUser.id).maybeSingle()
  ]);
  const error = recipesResult.error || planResult.error || checksResult.error || profileResult.error;
  if (error) { console.error(error); loadLocal(); return false; }
  state.recipes = recipesResult.data || [];
  state.plan = planResult.data || [];
  state.checks = Object.fromEntries((checksResult.data || []).map((item) => [item.item_key, item.checked]));
  state.profile = profileResult.data || await ensureProfile(currentUser, emailLocalPart(currentUser.email));
  if (state.profile?.username) await replaceLoginId(currentUser, state.profile.username, false);
  return true;
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) { state.recipes = []; state.plan = []; state.checks = {}; state.profile = null; return; }
  try {
    const saved = JSON.parse(raw);
    state.recipes = saved.recipes || [];
    state.plan = saved.plan || [];
    state.checks = saved.checks || {};
    state.profile = saved.profile || null;
  } catch {
    state.recipes = []; state.plan = []; state.checks = {}; state.profile = null;
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ recipes: state.recipes, plan: state.plan, checks: state.checks, profile: state.profile }));
}

function createBookRecipes(book, existingTitles = new Set()) {
  return book.recipes.filter((recipe) => !existingTitles.has(recipe.title)).map((recipe) => ({
    id: crypto.randomUUID(),
    title: recipe.title,
    source_title: `${book.title} p.${recipe.page}`,
    servings: recipe.servings || 4,
    tags: recipe.tags || [],
    label: "",
    ingredients: (recipe.ingredients || []).map(parseIngredientLine),
    steps: recipe.steps || [],
    notes: ""
  }));
}

function defaultRecipeSeedStorageKey() {
  return `${DEFAULT_RECIPE_SEED_KEY}:${currentUser?.id || "local"}`;
}

async function seedDefaultRecipesIfNeeded() {
  const book = window.HOTCOOK_RECIPE_BOOK;
  const markerKey = defaultRecipeSeedStorageKey();
  if (!book || localStorage.getItem(markerKey)) return;
  const recipes = createBookRecipes(book, new Set(state.recipes.map((recipe) => recipe.title)));
  if (canUseRemote()) {
    if (recipes.length) {
      const payload = recipes.map((recipe) => ({ ...recipe, user_id: currentUser.id }));
      const { data, error } = await supabaseClient.from("recipes").insert(payload).select("*");
      if (error) { console.error(error); return; }
      state.recipes = [...(data || recipes), ...state.recipes];
    }
  } else if (recipes.length) {
    state.recipes = [...recipes, ...state.recipes];
    saveLocal();
  }
  localStorage.setItem(markerKey, "1");
}

function renderAuth() {
  const requiresLogin = Boolean(supabaseClient && config.REQUIRE_AUTH && !currentUser);
  els.authPanel.classList.toggle("hidden", !requiresLogin);
  els.appContent.classList.toggle("hidden", requiresLogin);
  els.authBadge.textContent = requiresLogin ? "" : currentUser ? "ログイン済み" : "";
}

function toggleMenu() {
  if (els.appMenu.classList.contains("hidden")) openMenu(); else closeMenu();
}

function openMenu() {
  els.appMenu.classList.remove("hidden");
  els.menuOverlay.classList.remove("hidden");
  els.appMenu.setAttribute("aria-hidden", "false");
  els.menuButton.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  els.appMenu.classList.add("hidden");
  els.menuOverlay.classList.add("hidden");
  els.appMenu.setAttribute("aria-hidden", "true");
  els.menuButton.setAttribute("aria-expanded", "false");
}

function renderAccountMenu() {
  els.menuUserName.textContent = currentUser ? displayUsername() : "未ログイン";
  els.menuStatus.textContent = currentUser ? "ユーザー名とパスワードを変更できます。" : supabaseClient ? "ログインしてください。" : "この端末にデータを保存しています。";
  els.profileForm.classList.toggle("hidden", !currentUser);
  els.signOutButton.classList.toggle("hidden", !currentUser);
  if (currentUser) els.displayNameInput.value = state.profile?.username || emailLocalPart(currentUser.email) || "";
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._-]/g, "");
}

function isValidUsername(value) { return USERNAME_PATTERN.test(normalizeUsername(value)); }
function usernameToEmail(username) { return `${normalizeUsername(username) || "user"}@${INTERNAL_EMAIL_DOMAIN}`; }
function usernameToLegacyEmail(username) { return `${normalizeUsername(username) || "user"}@${LEGACY_EMAIL_DOMAIN}`; }
function emailLocalPart(email) { return normalizeUsername(String(email || "").split("@")[0]); }
function displayUsername() { return state.profile?.username || emailLocalPart(currentUser?.email) || "ログイン済み"; }

function isMissingLoginIdsTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("login_ids");
}

async function lookupLoginId(username) {
  try {
    const { data, error } = await supabaseClient.from("login_ids").select("auth_email, is_active, user_id").eq("login_id", normalizeUsername(username)).maybeSingle();
    if (error) throw error;
    if (!data) return { email: null, blocked: false, currentLoginId: "" };
    if (data.is_active) return { email: data.auth_email, blocked: false, currentLoginId: "" };
    const { data: activeRows, error: activeError } = await supabaseClient.from("login_ids").select("login_id").eq("user_id", data.user_id).eq("is_active", true).limit(1);
    if (activeError) throw activeError;
    return { email: null, blocked: true, currentLoginId: activeRows?.[0]?.login_id || "" };
  } catch (error) {
    if (!isMissingLoginIdsTable(error)) console.warn(error);
    return { email: null, blocked: false, currentLoginId: "" };
  }
}

async function signInWithUsername(username, password) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) return { error: new Error("ユーザー名の形式が正しくありません。") };
  const loginId = await lookupLoginId(normalized);
  if (loginId.blocked) return { error: new Error(loginId.currentLoginId ? `現在のユーザー名: ${loginId.currentLoginId}` : "ユーザー名が変更済みです。") };
  const emails = [loginId.email, usernameToEmail(normalized), usernameToLegacyEmail(normalized)].filter(Boolean);
  let lastError = null;
  for (const email of [...new Set(emails)]) {
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    if (!result.error) return result;
    lastError = result.error;
  }
  return { error: lastError || new Error("ログインできませんでした。") };
}

async function getProfile(user) {
  const { data, error } = await supabaseClient.from("profiles").select("id, username").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureProfile(user, username) {
  const profile = await getProfile(user);
  if (profile) return profile;
  const nextUsername = normalizeUsername(username) || emailLocalPart(user.email) || "user";
  const { data, error } = await supabaseClient.from("profiles").insert({ id: user.id, username: nextUsername }).select("id, username").single();
  if (error) throw error;
  return data;
}

async function replaceLoginId(user, loginId, required) {
  const normalized = normalizeUsername(loginId);
  if (!normalized) return;
  const row = { login_id: normalized, user_id: user.id, auth_email: user.email || usernameToEmail(normalized), is_active: true };
  const { error: upsertError } = await supabaseClient.from("login_ids").upsert(row, { onConflict: "login_id" });
  if (upsertError) {
    if (required && isMissingLoginIdsTable(upsertError)) throw new Error("ログインID管理テーブルが未設定です。");
    if (required || !isMissingLoginIdsTable(upsertError)) throw upsertError;
    return;
  }
  const { error: retireError } = await supabaseClient.from("login_ids").update({ auth_email: null, is_active: false }).eq("user_id", user.id).neq("login_id", normalized);
  if (retireError && (required || !isMissingLoginIdsTable(retireError))) throw retireError;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const username = normalizeUsername(els.usernameInput.value);
  const password = els.passwordInput.value;
  if (!username || !password) { els.authBadge.textContent = "ユーザー名とパスワードを入力してください。"; return; }
  els.authBadge.textContent = "ログインしています…";
  const result = await signInWithUsername(username, password);
  if (result.error) { els.authBadge.textContent = result.error.message || "ログインできませんでした。"; return; }
  currentUser = result.data.user || result.data.session?.user || currentUser;
  if (currentUser) {
    const profile = await ensureProfile(currentUser, username);
    await replaceLoginId(currentUser, profile.username, false);
    state.profile = profile;
  }
  els.authForm.reset();
  await loadAll();
  render();
}

async function handleProfileSave(event) {
  event.preventDefault();
  if (!canUseRemote()) return;
  const username = normalizeUsername(els.displayNameInput.value);
  const password = els.newPasswordInput.value;
  if (!isValidUsername(username)) { els.menuStatus.textContent = "ユーザー名は英数字40文字以内です。"; return; }
  if (password && password.length < 6) { els.menuStatus.textContent = "パスワードは6文字以上です。"; return; }
  try {
    if (password) {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
    }
    await replaceLoginId(currentUser, username, true);
    const { data, error } = await supabaseClient.from("profiles").update({ username }).eq("id", currentUser.id).select("id, username").single();
    if (error) throw error;
    state.profile = data;
    els.newPasswordInput.value = "";
    renderAccountMenu();
    els.menuStatus.textContent = "保存しました。";
  } catch (error) {
    console.error(error);
    els.menuStatus.textContent = "保存できませんでした。";
  }
}

async function signOut() {
  closeMenu();
  if (supabaseClient) await supabaseClient.auth.signOut();
}

function parseIngredientLine(line) {
  const normalized = String(line || "").trim().replace(/\s+/g, " ");
  if (!normalized) return { name: "", quantity: null, unit: "", note: "" };
  const match = normalized.match(/^(.+?)\s+([0-9０-９./]+(?:\s*\/\s*[0-9０-９.]+)?)(g|kg|ml|l|L|cc|個|本|枚|切れ|袋|丁|束|パック|株|缶|箱|かけ|合|玉|大さじ|小さじ|カップ)?(?:\s*(.*))?$/);
  if (!match) {
    const spoonMatch = normalized.match(/^(.+?)\s+(大さじ|小さじ|カップ)([0-9０-９./]+)(.*)$/);
    if (spoonMatch) return { name: spoonMatch[1].trim(), quantity: parseJapaneseNumber(spoonMatch[3]), unit: spoonMatch[2], note: spoonMatch[4].trim() };
    return { name: normalized, quantity: null, unit: "", note: "" };
  }
  return { name: match[1].trim(), quantity: parseJapaneseNumber(match[2]), unit: match[3] || "", note: (match[4] || "").trim() };
}

function parseJapaneseNumber(value) {
  const half = String(value || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (half.includes("/")) { const parts = half.split("/").map(Number); if (parts.length === 2 && parts[1]) return parts[0] / parts[1]; }
  const number = Number(half);
  return Number.isFinite(number) ? number : null;
}

function formatIngredientAmount(ingredient) {
  const quantity = typeof ingredient?.quantity === "number" ? roundQuantity(ingredient.quantity) : "";
  return [quantity !== "" ? `${quantity}${ingredient.unit || ""}` : "", ingredient?.note].filter(Boolean).join(" ");
}

function formatIngredient(ingredient) {
  return [ingredient?.name, formatIngredientAmount(ingredient)].filter(Boolean).join(" ");
}

function normalizeIngredientName(name) { return String(name || "").trim().replace(/\s+/g, " "); }
function roundQuantity(value) { return Math.round(value * 100) / 100; }
function startOfWeek(date) { const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate()); copy.setDate(copy.getDate() - copy.getDay()); return copy; }
function addDays(date, days) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
function toISODate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function isDateInWeek(iso, start) { return iso >= toISODate(start) && iso <= toISODate(addDays(start, 6)); }
function formatWeekRange(start, end) { return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日（日）〜 ${end.getMonth() + 1}月${end.getDate()}日（土）`; }

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
