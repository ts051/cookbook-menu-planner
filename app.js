const config = window.COOKBOOK_APP_CONFIG || {};
const isConfigured = Boolean(
  config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
);

const STORAGE_KEY = "cookbook-menu-planner:v1";
const INTERNAL_EMAIL_DOMAIN = "cookbook.local";
const LEGACY_EMAIL_DOMAIN = "cookbook.example.com";
const USERNAME_PATTERN = /^[a-z0-9._-]{1,40}$/;
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const sampleRecipes = [
  {
    title: "鮭の南蛮漬け",
    source_title: "和食の基本 p.42",
    servings: 2,
    tags: ["和食", "魚", "作り置き"],
    ingredients: [
      parseIngredientLine("鮭 2切れ"),
      parseIngredientLine("玉ねぎ 1/2個"),
      parseIngredientLine("にんじん 1/3本"),
      parseIngredientLine("酢 大さじ3"),
      parseIngredientLine("しょうゆ 大さじ2")
    ],
    steps: ["鮭に塩をふり、水気を拭く", "野菜を薄切りにする", "鮭を焼き、調味液に漬ける"]
  },
  {
    title: "鶏と長ねぎの照り焼き",
    source_title: "毎日の定番 p.18",
    servings: 2,
    tags: ["鶏肉", "主菜", "弁当"],
    ingredients: [
      parseIngredientLine("鶏もも肉 300g"),
      parseIngredientLine("長ねぎ 1本"),
      parseIngredientLine("しょうゆ 大さじ2"),
      parseIngredientLine("みりん 大さじ2"),
      parseIngredientLine("砂糖 小さじ1")
    ],
    steps: ["鶏肉を一口大に切る", "長ねぎと焼く", "調味料を煮絡める"]
  },
  {
    title: "なすとトマトの味噌炒め",
    source_title: "野菜のおかず p.73",
    servings: 2,
    tags: ["野菜", "味噌", "時短"],
    ingredients: [
      parseIngredientLine("なす 3本"),
      parseIngredientLine("トマト 1個"),
      parseIngredientLine("豚こま肉 150g"),
      parseIngredientLine("味噌 大さじ1"),
      parseIngredientLine("酒 大さじ1")
    ],
    steps: ["なすを乱切りにする", "豚肉を炒める", "野菜と調味料を加えて炒める"]
  },
  {
    title: "豆腐ときのこの卵とじ",
    source_title: "軽い夕食 p.29",
    servings: 2,
    tags: ["豆腐", "卵", "節約"],
    ingredients: [
      parseIngredientLine("木綿豆腐 1丁"),
      parseIngredientLine("しめじ 1袋"),
      parseIngredientLine("卵 2個"),
      parseIngredientLine("だし 150ml"),
      parseIngredientLine("しょうゆ 大さじ1")
    ],
    steps: ["豆腐を水切りする", "きのこを煮る", "卵を回し入れる"]
  },
  {
    title: "キャベツと豚肉の蒸し煮",
    source_title: "春野菜 p.11",
    servings: 2,
    tags: ["豚肉", "野菜", "蒸し料理"],
    ingredients: [
      parseIngredientLine("キャベツ 1/4玉"),
      parseIngredientLine("豚バラ肉 180g"),
      parseIngredientLine("しょうが 1かけ"),
      parseIngredientLine("酒 大さじ2"),
      parseIngredientLine("ポン酢 大さじ2")
    ],
    steps: ["材料を重ねる", "酒を加えて蒸す", "ポン酢で仕上げる"]
  }
];

let supabaseClient = null;
let currentUser = null;
let state = {
  recipes: [],
  plan: [],
  checks: {},
  profile: null,
  activeView: "today",
  monthCursor: startOfMonth(new Date()),
  weekCursor: startOfWeek(new Date())
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  bindEvents();
  await setupStorage();
  await loadAll();
  render();
  window.addEventListener("load", loadOptionalLucide, { once: true });
}

function bindElements() {
  [
    "storageBadge",
    "authBadge",
    "authPanel",
    "authForm",
    "menuButton",
    "menuCloseButton",
    "menuOverlay",
    "appMenu",
    "menuUserName",
    "menuStatus",
    "todayDateLabel",
    "todayMealTitle",
    "todayMealMeta",
    "todayIngredients",
    "todayShopping",
    "todayOpenShopping",
    "todayOpenPlan",
    "mobileNav",
    "usernameInput",
    "passwordInput",
    "profileForm",
    "displayNameInput",
    "newPasswordInput",
    "signOutButton",
    "seedButton",
    "syncButton",
    "recipeCount",
    "recipeForm",
    "recipeId",
    "titleInput",
    "sourceInput",
    "servingsInput",
    "tagsInput",
    "ingredientsInput",
    "stepsInput",
    "clearFormButton",
    "deleteRecipeButton",
    "ebookInput",
    "pdfInput",
    "pdfImportButton",
    "parseButton",
    "parseResult",
    "monthLabel",
    "prevMonthButton",
    "nextMonthButton",
    "suggestMonthButton",
    "recipeSelect",
    "calendarGrid",
    "weekLabel",
    "prevWeekButton",
    "nextWeekButton",
    "shoppingList",
    "searchInput",
    "recipeList"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.menuButton.addEventListener("click", toggleMenu);
  els.menuCloseButton.addEventListener("click", closeMenu);
  els.menuOverlay.addEventListener("click", closeMenu);
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.profileForm.addEventListener("submit", handleProfileSave);
  els.signOutButton.addEventListener("click", signOut);
  els.seedButton.addEventListener("click", seedSamples);
  els.syncButton.addEventListener("click", async () => {
    await loadAll();
    render();
  });
  els.recipeForm.addEventListener("submit", handleRecipeSave);
  els.clearFormButton.addEventListener("click", clearRecipeForm);
  els.deleteRecipeButton.addEventListener("click", deleteSelectedRecipe);
  els.parseButton.addEventListener("click", parseEbookText);
  els.pdfImportButton.addEventListener("click", importPdfFile);
  els.prevMonthButton.addEventListener("click", () => moveMonth(-1));
  els.nextMonthButton.addEventListener("click", () => moveMonth(1));
  els.suggestMonthButton.addEventListener("click", suggestMonthPlan);
  els.prevWeekButton.addEventListener("click", () => moveWeek(-1));
  els.nextWeekButton.addEventListener("click", () => moveWeek(1));
  els.searchInput.addEventListener("input", renderRecipeList);
  els.todayOpenShopping.addEventListener("click", () => switchView("shopping"));
  els.todayOpenPlan.addEventListener("click", () => switchView("plan"));
  els.mobileNav.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.tab));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function toggleMenu() {
  if (els.appMenu.classList.contains("hidden")) openMenu();
  else closeMenu();
}

function openMenu() {
  els.appMenu.classList.remove("hidden");
  els.menuOverlay.classList.remove("hidden");
  els.appMenu.setAttribute("aria-hidden", "false");
  els.menuButton.setAttribute("aria-expanded", "true");
  renderAccountMenu();
}

function closeMenu() {
  if (!els.appMenu || !els.menuOverlay) return;
  els.appMenu.classList.add("hidden");
  els.menuOverlay.classList.add("hidden");
  els.appMenu.setAttribute("aria-hidden", "true");
  els.menuButton.setAttribute("aria-expanded", "false");
}

function setupIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function setupStorage() {
  if (!isConfigured) {
    els.storageBadge.textContent = "Local";
    els.authBadge.textContent = "Supabase未設定";
    els.authPanel.classList.add("hidden");
    return;
  }

  try {
    await loadScript("https://unpkg.com/@supabase/supabase-js@2", "supabase-js");
  } catch (error) {
    console.error(error);
    els.storageBadge.textContent = "Local";
    els.authBadge.textContent = "Supabase読込失敗";
    els.authPanel.classList.add("hidden");
    return;
  }

  supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  els.storageBadge.textContent = "Supabase";

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await loadAll();
    render();
  });
}

function loadOptionalLucide() {
  loadScript("https://unpkg.com/lucide@latest", "lucide-icons")
    .then(setupIcons)
    .catch(() => {
      document.documentElement.classList.add("no-icons");
    });
}

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    const timeout = window.setTimeout(() => {
      reject(new Error(`Script load timed out: ${src}`));
    }, 7000);
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Script load failed: ${src}`));
    };
    document.head.append(script);
  });
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function isValidUsername(value) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

function usernameToEmail(username) {
  return `${normalizeUsername(username) || "user"}@${INTERNAL_EMAIL_DOMAIN}`;
}

function usernameToLegacyEmail(username) {
  return `${normalizeUsername(username) || "user"}@${LEGACY_EMAIL_DOMAIN}`;
}

function emailLocalPart(email) {
  return normalizeUsername(String(email || "").split("@")[0]);
}

function isMissingLoginIdsTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes('relation "public.login_ids" does not exist') ||
    (message.includes("schema cache") && message.includes("login_ids")) ||
    (message.includes("could not find") && message.includes("login_ids"))
  );
}

async function lookupLoginId(username) {
  try {
    const { data, error } = await supabaseClient
      .from("login_ids")
      .select("auth_email, is_active, user_id")
      .eq("login_id", normalizeUsername(username))
      .maybeSingle();
    if (error) throw error;
    if (!data) return { email: null, blocked: false, currentLoginId: "" };
    if (data.is_active) return { email: data.auth_email, blocked: false, currentLoginId: "" };

    const { data: activeRows, error: activeError } = await supabaseClient
      .from("login_ids")
      .select("login_id")
      .eq("user_id", data.user_id)
      .eq("is_active", true)
      .limit(1);
    if (activeError) throw activeError;
    return {
      email: null,
      blocked: true,
      currentLoginId: activeRows?.[0]?.login_id || ""
    };
  } catch (error) {
    if (!isMissingLoginIdsTable(error)) console.warn("Login ID lookup failed:", error);
    return { email: null, blocked: false, currentLoginId: "" };
  }
}

async function signInWithUsername(username, password) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) return { error: new Error("Invalid username.") };

  const loginId = await lookupLoginId(normalized);
  if (loginId.blocked) {
    const message = loginId.currentLoginId
      ? `現在のユーザー名: ${loginId.currentLoginId}`
      : "ユーザー名が変更済み";
    return { error: new Error(message) };
  }

  const emails = [loginId.email, usernameToEmail(normalized), usernameToLegacyEmail(normalized)].filter(Boolean);
  let lastError = null;
  for (const email of [...new Set(emails)]) {
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    if (!result.error) return result;
    lastError = result.error;
  }
  return { error: lastError || new Error("Login failed.") };
}

async function getProfile(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureProfile(user, username) {
  const profile = await getProfile(user);
  if (profile) return profile;

  const nextUsername = normalizeUsername(username) || emailLocalPart(user.email) || "user";
  const { data, error } = await supabaseClient
    .from("profiles")
    .insert({ id: user.id, username: nextUsername })
    .select("id, username")
    .single();
  if (error) throw error;
  return data;
}

async function replaceLoginId(user, loginId, required) {
  const normalized = normalizeUsername(loginId);
  if (!normalized) return;

  const row = {
    login_id: normalized,
    user_id: user.id,
    auth_email: user.email || usernameToEmail(normalized),
    is_active: true
  };

  const { error: upsertError } = await supabaseClient
    .from("login_ids")
    .upsert(row, { onConflict: "login_id" });
  if (upsertError) {
    if (required && isMissingLoginIdsTable(upsertError)) {
      throw new Error("ログインID管理テーブルが未設定です。supabase-schema.sql を Supabase に適用してください。");
    }
    if (required || !isMissingLoginIdsTable(upsertError)) throw upsertError;
    return;
  }

  const { error: retireError } = await supabaseClient
    .from("login_ids")
    .update({ auth_email: null, is_active: false })
    .eq("user_id", user.id)
    .neq("login_id", normalized);
  if (retireError) {
    if (required && isMissingLoginIdsTable(retireError)) {
      throw new Error("ログインID管理テーブルが未設定です。supabase-schema.sql を Supabase に適用してください。");
    }
    if (required || !isMissingLoginIdsTable(retireError)) throw retireError;
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;
  const username = normalizeUsername(els.usernameInput.value);
  const password = els.passwordInput.value;
  if (!isValidUsername(username) || !password) {
    els.authBadge.textContent = "ユーザー名またはパスワード未入力";
    return;
  }

  const result = await signInWithUsername(username, password);
  if (result.error) {
    els.authBadge.textContent = result.error.message || "ログイン失敗";
    return;
  }

  currentUser = result.data.user || result.data.session?.user || currentUser;
  if (currentUser) {
    const profile = await ensureProfile(currentUser, username);
    await replaceLoginId(currentUser, profile.username, false);
    state.profile = profile;
  }

  els.authBadge.textContent = "ログイン済み";
  els.authForm.reset();
  await loadAll();
  render();
}

async function handleProfileSave(event) {
  event.preventDefault();
  if (!canUseRemote()) return;

  const username = normalizeUsername(els.displayNameInput.value);
  const password = els.newPasswordInput.value;
  if (!isValidUsername(username)) {
    els.menuStatus.textContent = "ユーザー名は英数字40文字以内";
    return;
  }
  if (password && password.length < 6) {
    els.menuStatus.textContent = "パスワードは6文字以上";
    return;
  }

  try {
    const profile = await ensureProfile(currentUser, username);
    if (password) {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
    }
    await replaceLoginId(currentUser, username, true);
    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ username })
      .eq("id", currentUser.id)
      .select("id, username")
      .single();
    if (error) throw error;
    state.profile = data || { ...profile, username };
    els.newPasswordInput.value = "";
    renderAuth();
    els.menuStatus.textContent = "保存しました。";
  } catch (error) {
    console.error(error);
    els.menuStatus.textContent = "保存失敗";
  }
}

async function signOut() {
  if (!supabaseClient) return;
  state.profile = null;
  closeMenu();
  await supabaseClient.auth.signOut();
}

function canUseRemote() {
  return Boolean(supabaseClient && (!config.REQUIRE_AUTH || currentUser));
}

async function loadAll() {
  if (canUseRemote()) {
    await loadRemote();
    return;
  }
  loadLocal();
}

async function loadRemote() {
  const [
    { data: recipes, error: recipesError },
    { data: plan, error: planError },
    { data: checks, error: checksError },
    { data: profile, error: profileError }
  ] =
    await Promise.all([
      supabaseClient.from("recipes").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("meal_plan_entries").select("*").order("plan_date", { ascending: true }),
      supabaseClient.from("shopping_checks").select("*"),
      supabaseClient.from("profiles").select("id, username").eq("id", currentUser.id).maybeSingle()
    ]);

  if (recipesError || planError || checksError || profileError) {
    console.error(recipesError || planError || checksError || profileError);
    loadLocal();
    return;
  }

  state.recipes = recipes || [];
  state.plan = plan || [];
  state.checks = Object.fromEntries((checks || []).map((item) => [item.item_key, item.checked]));
  state.profile = profile || (currentUser ? await ensureProfile(currentUser, emailLocalPart(currentUser.email)) : null);
  if (currentUser && state.profile?.username) {
    await replaceLoginId(currentUser, state.profile.username, false);
  }
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.recipes = [];
    state.plan = [];
    state.checks = {};
    state.profile = null;
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.recipes = saved.recipes || [];
    state.plan = saved.plan || [];
    state.checks = saved.checks || {};
    state.profile = saved.profile || null;
  } catch {
    state.recipes = [];
    state.plan = [];
    state.checks = {};
    state.profile = null;
  }
}

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      recipes: state.recipes,
      plan: state.plan,
      checks: state.checks,
      profile: state.profile
    })
  );
}

function render() {
  renderAuth();
  renderToday();
  renderMobileNav();
  renderRecipeFormState();
  renderRecipeSelect();
  renderCalendar();
  renderShoppingList();
  renderRecipeList();
  setupIcons();
}

function switchView(view) {
  if (!["today", "shopping", "plan", "recipe"].includes(view)) return;
  state.activeView = view;
  renderMobileNav();
  document.body.dataset.activeView = view;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMobileNav() {
  document.body.dataset.activeView = state.activeView;
  if (!els.mobileNav) return;
  els.mobileNav.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.activeView);
  });
}

function renderAuth() {
  if (!supabaseClient) {
    els.authPanel.classList.add("hidden");
    renderAccountMenu();
    return;
  }

  els.authPanel.classList.toggle("hidden", !config.REQUIRE_AUTH || Boolean(currentUser));
  els.signOutButton.classList.toggle("hidden", !currentUser);
  els.profileForm.classList.toggle("hidden", !currentUser);
  els.displayNameInput.value = state.profile?.username || emailLocalPart(currentUser?.email) || "";
  els.authBadge.textContent = currentUser ? "" : "未ログイン";
  renderAccountMenu();
}

function displayUsername() {
  return state.profile?.username || emailLocalPart(currentUser?.email) || "ログイン済み";
}

function renderAccountMenu() {
  if (!els.menuUserName) return;
  els.menuUserName.textContent = currentUser ? displayUsername() : "未ログイン";
  els.menuStatus.textContent = currentUser
    ? "ユーザー名とパスワードを変更できます。"
    : "ログイン後にアカウント設定を使えます。";
  els.profileForm.classList.toggle("hidden", !currentUser);
  els.signOutButton.classList.toggle("hidden", !currentUser);
  if (currentUser) {
    els.displayNameInput.value = state.profile?.username || emailLocalPart(currentUser.email) || "";
  }
}

function renderToday() {
  const today = new Date();
  const todayISO = toISODate(today);
  const weekStart = startOfWeek(today);
  const todayEntry = state.plan.find((item) => item.plan_date === todayISO && item.meal_slot === "dinner");
  const recipe = todayEntry ? state.recipes.find((item) => item.id === todayEntry.recipe_id) : null;

  els.todayDateLabel.textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  els.todayMealTitle.textContent = recipe?.title || "未定";
  els.todayMealMeta.textContent = recipe
    ? [recipe.source_title, `${recipe.servings || 2}人分`].filter(Boolean).join(" / ")
    : "献立タブで今日の料理を選べます。";

  const ingredients = recipe?.ingredients || [];
  renderQuickList(
    els.todayIngredients,
    ingredients.slice(0, 6).map((item) => ({
      name: item.name,
      amount: formatIngredientAmount(item)
    })),
    "材料はまだありません。",
    ingredients.length > 6 ? `ほか${ingredients.length - 6}件` : ""
  );

  const shopping = getShoppingItemsForDates(weekStart, new Set([todayISO]))
    .filter((item) => !state.checks[item.key])
    .slice(0, 6)
    .map((item) => ({ name: item.name, amount: item.amount }));
  renderQuickList(els.todayShopping, shopping, "買うものはまだありません。");
}

function renderQuickList(container, items, emptyText, footerText = "") {
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHTML(emptyText)}</div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "quick-list-item";
    row.innerHTML = `
      <span>${escapeHTML(item.name)}</span>
      <span>${escapeHTML(item.amount || "")}</span>
    `;
    container.append(row);
  });

  if (footerText) {
    const footer = document.createElement("div");
    footer.className = "quick-list-more";
    footer.textContent = footerText;
    container.append(footer);
  }
}

function renderRecipeFormState() {
  els.recipeCount.textContent = `${state.recipes.length}件`;
}

function renderRecipeSelect() {
  const selected = els.recipeSelect.value;
  els.recipeSelect.innerHTML = "";

  if (!state.recipes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "レシピ未登録";
    els.recipeSelect.append(option);
    return;
  }

  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.title;
    els.recipeSelect.append(option);
  });

  if (selected) els.recipeSelect.value = selected;
}

function renderCalendar() {
  const month = state.monthCursor;
  els.monthLabel.textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  els.calendarGrid.innerHTML = "";

  weekdays.forEach((day) => {
    const header = document.createElement("div");
    header.className = "weekday";
    header.textContent = day;
    els.calendarGrid.append(header);
  });

  const first = startOfWeek(startOfMonth(month));
  const last = endOfWeek(endOfMonth(month));
  for (let cursor = new Date(first); cursor <= last; cursor = addDays(cursor, 1)) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    if (cursor.getMonth() !== month.getMonth()) cell.classList.add("outside");

    const iso = toISODate(cursor);
    const entry = state.plan.find((item) => item.plan_date === iso && item.meal_slot === "dinner");
    const recipe = entry ? state.recipes.find((item) => item.id === entry.recipe_id) : null;

    cell.innerHTML = `
      <span class="day-number">${cursor.getDate()}</span>
      ${
        recipe
          ? `<span class="meal-chip">${escapeHTML(recipe.title)}</span>`
          : `<span class="meal-empty">追加</span>`
      }
    `;
    cell.addEventListener("click", () => setPlanForDate(iso));
    els.calendarGrid.append(cell);
  }
}

function renderShoppingList() {
  const weekStart = state.weekCursor;
  const weekEnd = addDays(weekStart, 6);
  els.weekLabel.textContent = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
  els.shoppingList.innerHTML = "";

  const items = getShoppingItems(weekStart);
  if (!items.length) {
    els.shoppingList.innerHTML = `<div class="empty-state">この週の献立は未登録です。</div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("label");
    row.className = `shopping-item ${state.checks[item.key] ? "checked" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${state.checks[item.key] ? "checked" : ""} />
      <span class="item-name">${escapeHTML(item.name)}</span>
      <span class="item-amount">${escapeHTML(item.amount)}</span>
    `;
    row.querySelector("input").addEventListener("change", (event) => {
      toggleShoppingCheck(item.key, event.target.checked);
    });
    els.shoppingList.append(row);
  });
}

function renderRecipeList() {
  const query = els.searchInput.value.trim().toLowerCase();
  const recipes = state.recipes.filter((recipe) => {
    const haystack = [recipe.title, recipe.source_title, ...(recipe.tags || [])].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  els.recipeList.innerHTML = "";
  if (!recipes.length) {
    els.recipeList.innerHTML = `<div class="empty-state">登録済みレシピはありません。</div>`;
    return;
  }

  recipes.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    card.innerHTML = `
      <div>
        <h3>${escapeHTML(recipe.title)}</h3>
        <div class="recipe-meta">
          <span>${recipe.servings || 2}人分</span>
          ${recipe.source_title ? `<span>${escapeHTML(recipe.source_title)}</span>` : ""}
        </div>
      </div>
      <div class="tag-row">
        ${(recipe.tags || []).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}
      </div>
      <button class="secondary-button" type="button">
        <i data-lucide="pencil"></i>
        編集
      </button>
    `;
    card.querySelector("button").addEventListener("click", () => fillRecipeForm(recipe));
    els.recipeList.append(card);
  });
}

async function handleRecipeSave(event) {
  event.preventDefault();

  const recipe = {
    id: els.recipeId.value || crypto.randomUUID(),
    title: els.titleInput.value.trim(),
    source_title: els.sourceInput.value.trim(),
    servings: Number(els.servingsInput.value) || 2,
    tags: splitLinesOrComma(els.tagsInput.value),
    ingredients: splitLines(els.ingredientsInput.value).map(parseIngredientLine),
    steps: splitLines(els.stepsInput.value).map((step) => step.replace(/^\d+[.)、]\s*/, "")),
    notes: ""
  };

  if (!recipe.title) return;

  if (canUseRemote()) {
    const payload = { ...recipe, user_id: currentUser?.id };
    const { error } = await supabaseClient.from("recipes").upsert(payload);
    if (error) {
      console.error(error);
      return;
    }
    await loadRemote();
  } else {
    const index = state.recipes.findIndex((item) => item.id === recipe.id);
    if (index >= 0) state.recipes[index] = recipe;
    else state.recipes.unshift(recipe);
    saveLocal();
  }

  clearRecipeForm();
  render();
}

function fillRecipeForm(recipe) {
  els.recipeId.value = recipe.id;
  els.titleInput.value = recipe.title || "";
  els.sourceInput.value = recipe.source_title || "";
  els.servingsInput.value = recipe.servings || 2;
  els.tagsInput.value = (recipe.tags || []).join(", ");
  els.ingredientsInput.value = (recipe.ingredients || []).map(formatIngredient).join("\n");
  els.stepsInput.value = (recipe.steps || []).map((step, index) => `${index + 1}. ${step}`).join("\n");
  els.deleteRecipeButton.classList.remove("hidden");
}

function clearRecipeForm() {
  els.recipeForm.reset();
  els.recipeId.value = "";
  els.servingsInput.value = 2;
  els.deleteRecipeButton.classList.add("hidden");
}

async function deleteSelectedRecipe() {
  const id = els.recipeId.value;
  if (!id) return;

  if (canUseRemote()) {
    await supabaseClient.from("recipes").delete().eq("id", id);
    await loadRemote();
  } else {
    state.recipes = state.recipes.filter((recipe) => recipe.id !== id);
    state.plan = state.plan.filter((entry) => entry.recipe_id !== id);
    saveLocal();
  }

  clearRecipeForm();
  render();
}

function parseEbookText() {
  const parsed = parseRecipeText(els.ebookInput.value);
  if (!parsed.title) {
    els.parseResult.textContent = "料理名を抽出できませんでした。";
    return;
  }

  els.titleInput.value = parsed.title;
  els.sourceInput.value = parsed.source_title || "";
  els.servingsInput.value = parsed.servings || 2;
  els.ingredientsInput.value = parsed.ingredients.map(formatIngredient).join("\n");
  els.stepsInput.value = parsed.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  els.parseResult.textContent = `${parsed.ingredients.length}材料、${parsed.steps.length}行程を抽出しました。`;
}

async function importPdfFile() {
  const file = els.pdfInput.files?.[0];
  if (!file) {
    els.parseResult.textContent = "PDFファイルを選択してください。";
    return;
  }
  if (file.type && file.type !== "application/pdf") {
    els.parseResult.textContent = "PDFファイルを選択してください。";
    return;
  }

  els.parseResult.textContent = "PDFを読み込んでいます。";
  try {
    const text = await extractPdfText(file);
    if (!text.trim()) {
      els.parseResult.textContent = "PDFからテキストを抽出できませんでした。";
      return;
    }
    els.ebookInput.value = text;
    parseEbookText();
  } catch (error) {
    console.error(error);
    els.parseResult.textContent = "PDF読込に失敗しました。";
  }
}

async function extractPdfText(file) {
  await loadPdfLibrary();
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = groupPdfTextItems(content.items || []);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n").trim();
}

async function loadPdfLibrary() {
  if (window.pdfjsLib) return;
  const version = "3.11.174";
  await loadScript(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.min.js`, "pdfjs-lib");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
}

function groupPdfTextItems(items) {
  const rows = [];
  items.forEach((item) => {
    const value = String(item.str || "").trim();
    if (!value) return;
    const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
    let row = rows.find((entry) => Math.abs(entry.y - y) < 2);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: item.transform?.[4] || 0, value });
  });

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.value)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

async function seedSamples() {
  const existingTitles = new Set(state.recipes.map((recipe) => recipe.title));
  const inserts = sampleRecipes
    .filter((recipe) => !existingTitles.has(recipe.title))
    .map((recipe) => ({ ...recipe, id: crypto.randomUUID() }));

  if (!inserts.length) return;

  if (canUseRemote()) {
    const payload = inserts.map((recipe) => ({ ...recipe, user_id: currentUser?.id }));
    const { error } = await supabaseClient.from("recipes").insert(payload);
    if (error) {
      console.error(error);
      return;
    }
    await loadRemote();
  } else {
    state.recipes = [...inserts, ...state.recipes];
    saveLocal();
  }

  render();
}

async function setPlanForDate(isoDate) {
  const recipeId = els.recipeSelect.value;
  if (!recipeId) return;

  const entry = {
    id: crypto.randomUUID(),
    plan_date: isoDate,
    meal_slot: "dinner",
    recipe_id: recipeId
  };

  if (canUseRemote()) {
    const { error } = await supabaseClient
      .from("meal_plan_entries")
      .upsert({ ...entry, user_id: currentUser?.id }, { onConflict: "user_id,plan_date,meal_slot" });
    if (error) {
      console.error(error);
      return;
    }
    await loadRemote();
  } else {
    state.plan = state.plan.filter((item) => !(item.plan_date === isoDate && item.meal_slot === "dinner"));
    state.plan.push(entry);
    saveLocal();
  }

  render();
}

async function suggestMonthPlan() {
  if (!state.recipes.length) return;

  const start = startOfMonth(state.monthCursor);
  const end = endOfMonth(state.monthCursor);
  const entries = [];
  let index = 0;

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const recipe = state.recipes[index % state.recipes.length];
    entries.push({
      id: crypto.randomUUID(),
      plan_date: toISODate(cursor),
      meal_slot: "dinner",
      recipe_id: recipe.id
    });
    index += cursor.getDay() === 0 ? 2 : 1;
  }

  if (canUseRemote()) {
    await supabaseClient
      .from("meal_plan_entries")
      .delete()
      .gte("plan_date", toISODate(start))
      .lte("plan_date", toISODate(end))
      .eq("meal_slot", "dinner");
    const { error } = await supabaseClient
      .from("meal_plan_entries")
      .insert(entries.map((entry) => ({ ...entry, user_id: currentUser?.id })));
    if (error) {
      console.error(error);
      return;
    }
    await loadRemote();
  } else {
    state.plan = state.plan.filter((item) => item.plan_date < toISODate(start) || item.plan_date > toISODate(end));
    state.plan.push(...entries);
    saveLocal();
  }

  render();
}

async function toggleShoppingCheck(key, checked) {
  state.checks[key] = checked;

  if (canUseRemote()) {
    const { error } = await supabaseClient.from("shopping_checks").upsert(
      {
        user_id: currentUser?.id,
        week_start: toISODate(state.weekCursor),
        item_key: key,
        checked
      },
      { onConflict: "user_id,week_start,item_key" }
    );
    if (error) console.error(error);
  } else {
    saveLocal();
  }

  renderShoppingList();
  renderToday();
}

function getShoppingItems(weekStart) {
  const weekDates = new Set(Array.from({ length: 7 }, (_, index) => toISODate(addDays(weekStart, index))));
  return getShoppingItemsForDates(weekStart, weekDates);
}

function getShoppingItemsForDates(weekStart, dates) {
  const entries = state.plan.filter((entry) => dates.has(entry.plan_date));
  const bucket = new Map();

  entries.forEach((entry) => {
    const recipe = state.recipes.find((item) => item.id === entry.recipe_id);
    if (!recipe) return;

    (recipe.ingredients || []).forEach((ingredient) => {
      const name = normalizeIngredientName(ingredient.name);
      if (!name) return;
      const unit = ingredient.unit || "";
      const key = `${toISODate(weekStart)}:${name}:${unit}`;
      const current = bucket.get(key) || { key, name, unit, quantity: 0, raw: [] };
      if (typeof ingredient.quantity === "number" && Number.isFinite(ingredient.quantity)) {
        current.quantity += ingredient.quantity;
      } else {
        current.raw.push(formatIngredient(ingredient));
      }
      bucket.set(key, current);
    });
  });

  return Array.from(bucket.values())
    .map((item) => ({
      key: item.key,
      name: item.name,
      amount: item.quantity ? `${roundQuantity(item.quantity)}${item.unit}` : item.raw.join(" / ")
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function formatIngredientAmount(ingredient) {
  if (!ingredient) return "";
  const quantity = typeof ingredient.quantity === "number" ? roundQuantity(ingredient.quantity) : "";
  return [quantity ? `${quantity}${ingredient.unit || ""}` : "", ingredient.note].filter(Boolean).join(" ");
}

function parseRecipeText(text) {
  const lines = splitLines(text);
  const title = lines[0] || "";
  const servingsMatch = text.match(/(\d+)\s*人分/);
  const ingredientsIndex = lines.findIndex((line) => /材料|ingredients/i.test(line));
  const stepsIndex = lines.findIndex((line) => /作り方|手順|行程|作法|steps/i.test(line));
  const ingredientLines = lines.slice(
    ingredientsIndex >= 0 ? ingredientsIndex + 1 : 1,
    stepsIndex >= 0 ? stepsIndex : lines.length
  );
  const stepLines = stepsIndex >= 0 ? lines.slice(stepsIndex + 1) : [];

  return {
    title: title.replace(/^[#\s]+/, ""),
    source_title: "",
    servings: servingsMatch ? Number(servingsMatch[1]) : 2,
    tags: [],
    ingredients: ingredientLines
      .filter((line) => !/^\(?\d+\s*人分\)?$/.test(line))
      .map(parseIngredientLine)
      .filter((item) => item.name),
    steps: stepLines.map((line) => line.replace(/^\d+[.)、]\s*/, "")).filter(Boolean)
  };
}

function parseIngredientLine(line) {
  const normalized = String(line || "").trim().replace(/\s+/g, " ");
  if (!normalized) return { name: "", quantity: null, unit: "", note: "" };

  const match = normalized.match(/^(.+?)\s+([0-9０-９./]+(?:\s*\/\s*[0-9０-９.]+)?)(g|kg|ml|l|L|cc|個|本|枚|切れ|袋|丁|束|大さじ|小さじ|カップ)?(?:\s*(.*))?$/);
  if (!match) {
    const spoonMatch = normalized.match(/^(.+?)\s+(大さじ|小さじ|カップ)([0-9０-９./]+)(.*)$/);
    if (spoonMatch) {
      return {
        name: spoonMatch[1].trim(),
        quantity: parseJapaneseNumber(spoonMatch[3]),
        unit: spoonMatch[2],
        note: spoonMatch[4].trim()
      };
    }
    return { name: normalized, quantity: null, unit: "", note: "" };
  }

  return {
    name: match[1].trim(),
    quantity: parseJapaneseNumber(match[2]),
    unit: match[3] || "",
    note: (match[4] || "").trim()
  };
}

function parseJapaneseNumber(value) {
  const half = String(value || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (half.includes("/")) {
    const parts = half.split("/").map(Number);
    if (parts.length === 2 && parts[1]) return parts[0] / parts[1];
  }
  const num = Number(half);
  return Number.isFinite(num) ? num : null;
}

function formatIngredient(ingredient) {
  if (!ingredient) return "";
  const quantity = typeof ingredient.quantity === "number" ? roundQuantity(ingredient.quantity) : "";
  return [ingredient.name, `${quantity}${ingredient.unit || ""}`, ingredient.note].filter(Boolean).join(" ");
}

function normalizeIngredientName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitLinesOrComma(value) {
  return String(value || "")
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function moveMonth(delta) {
  state.monthCursor = startOfMonth(new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + delta, 1));
  renderCalendar();
}

function moveWeek(delta) {
  state.weekCursor = addDays(state.weekCursor, delta * 7);
  renderShoppingList();
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function roundQuantity(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
