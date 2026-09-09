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
const MEAL_TYPE_TAG_PREFIX = "__meal_type:";
const INTERNAL_EMAIL_DOMAIN = "cookbook.local";
const LEGACY_EMAIL_DOMAIN = "cookbook.example.com";
const USERNAME_PATTERN = /^[a-z0-9._-]{1,40}$/;
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const mealSlots = [
  { id: "main", label: "主菜" },
  { id: "side", label: "副菜" },
  { id: "staple", label: "主食" },
  { id: "soup", label: "汁物" }
];
const mealTypes = mealSlots;
const vegetableUnitRules = [
  { names: ["玉ねぎ"], unit: "玉", grams: 200 },
  { names: ["じゃがいも"], unit: "個", grams: 150 },
  { names: ["にんじん", "人参"], unit: "本", grams: 150 },
  { names: ["大根"], unit: "本", grams: 1000 },
  { names: ["キャベツ"], unit: "玉", grams: 1400 },
  { names: ["白菜"], unit: "玉", grams: 2000 },
  { names: ["ピーマン"], unit: "個", grams: 35 },
  { names: ["パプリカ"], unit: "個", grams: 150 },
  { names: ["ズッキーニ"], unit: "本", grams: 200 },
  { names: ["なす", "ナス"], unit: "本", grams: 100 },
  { names: ["ごぼう"], unit: "本", grams: 280 },
  { names: ["れんこん"], unit: "節", grams: 200 },
  { names: ["かぼちゃ"], unit: "玉", grams: 1200 },
  { names: ["たけのこ"], unit: "袋", grams: 170 },
  { names: ["さつまいも"], unit: "本", grams: 250 },
  { names: ["里芋"], unit: "個", grams: 50 },
  { names: ["ブロッコリー"], unit: "株", grams: 250 },
  { names: ["ほうれん草", "小松菜"], unit: "束", grams: 200 },
  { names: ["長ねぎ", "長ネギ"], unit: "本", grams: 100 }
];

let supabaseClient = null;
let currentUser = null;
let currentDialogRecipeId = "";
let datePickerRecipeId = "";
let datePickerCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let datePickerSelectedDate = "";
let toastTimer = null;
const recipeSelections = new Map();
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
    "usernameInput", "passwordInput", "authBadge", "appContent", "genreContainer", "weekRange",
    "prevWeekButton", "currentWeekButton", "nextWeekButton", "weeklyGrid", "shoppingWeekRange", "shoppingProgress",
    "shoppingList", "prevShoppingWeekButton", "currentShoppingWeekButton", "nextShoppingWeekButton", "recipeDialog", "closeRecipeDialog", "dialogRecipeImage", "dialogRecipeGenre", "dialogRecipeTitle",
    "dialogRecipeMeta", "dialogIngredients", "dialogSteps", "dialogSelectButton", "datePickerDialog", "datePickerPrev",
    "datePickerNext", "datePickerMonth", "datePickerGrid", "datePickerMessage", "datePickerReset", "datePickerCancel",
    "datePickerConfirm", "toast"
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
  els.prevWeekButton.addEventListener("click", () => moveWeek(-1));
  els.nextWeekButton.addEventListener("click", () => moveWeek(1));
  els.currentWeekButton.addEventListener("click", () => { recipeSelections.clear(); state.weekCursor = startOfWeek(new Date()); renderWeekViews(); });
  els.prevShoppingWeekButton.addEventListener("click", () => moveWeek(-1));
  els.nextShoppingWeekButton.addEventListener("click", () => moveWeek(1));
  els.currentShoppingWeekButton.addEventListener("click", () => { recipeSelections.clear(); state.weekCursor = startOfWeek(new Date()); renderWeekViews(); });
  els.closeRecipeDialog.addEventListener("click", () => els.recipeDialog.close());
  els.dialogSelectButton.addEventListener("click", toggleDialogRecipeSelection);
  els.recipeDialog.addEventListener("click", (event) => { if (event.target === els.recipeDialog) els.recipeDialog.close(); });
  els.datePickerPrev.addEventListener("click", () => moveDatePickerMonth(-1));
  els.datePickerNext.addEventListener("click", () => moveDatePickerMonth(1));
  els.datePickerReset.addEventListener("click", resetDatePicker);
  els.datePickerCancel.addEventListener("click", () => els.datePickerDialog.close());
  els.datePickerConfirm.addEventListener("click", confirmDatePicker);
  els.datePickerDialog.addEventListener("click", (event) => { if (event.target === els.datePickerDialog) els.datePickerDialog.close(); });
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
  if (view === "home") renderHome();
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

}

function createRecipeCard(recipe) {
  const selection = recipeSelections.get(recipe.id) || { date: "", mealType: savedRecipeMealType(recipe) };
  const card = document.createElement("article");
  card.dataset.recipeId = recipe.id;
  card.className = `recipe-card${selection.date && selection.mealType ? " selected" : ""}`;
  card.innerHTML = `
    <button class="recipe-thumb-button" type="button" aria-label="${escapeHTML(recipe.title)}の詳細を見る">
      <img class="recipe-thumb" src="${escapeHTML(recipeImage(recipe))}" alt="${escapeHTML(recipe.title)}" loading="lazy" />
    </button>
    <div class="recipe-card-body">
      <button class="recipe-title-button" type="button"><h3>${escapeHTML(recipe.title)}</h3></button>
      <div class="recipe-card-controls">
        <button class="recipe-date-button secondary-button" type="button">日付選択</button>
        <label><span>食種選択</span><select class="recipe-meal-type" aria-label="${escapeHTML(recipe.title)}の食種">${mealTypeOptions(selection.mealType)}</select></label>
      </div>
    </div>
  `;
  card.querySelector(".recipe-thumb-button").addEventListener("click", () => openRecipeDialog(recipe));
  card.querySelector(".recipe-title-button").addEventListener("click", () => openRecipeDialog(recipe));
  card.querySelector(".recipe-date-button").addEventListener("click", () => openDatePicker(recipe.id));
  card.querySelector(".recipe-meal-type").addEventListener("change", (event) => { void updateRecipeSelection(recipe.id, "mealType", event.target.value, card); });
  return card;
}

function mealTypeOptions(selectedType = "") {
  return `<option value="">-</option>` + mealTypes.map((type) => `<option value="${type.id}"${type.id === selectedType ? " selected" : ""}>${type.label}</option>`).join("");
}

function savedRecipeMealType(recipe) {
  const tag = (Array.isArray(recipe?.tags) ? recipe.tags : []).find((item) => String(item).startsWith(MEAL_TYPE_TAG_PREFIX));
  const typeId = String(tag || "").slice(MEAL_TYPE_TAG_PREFIX.length);
  return mealTypes.some((type) => type.id === typeId) ? typeId : "";
}

async function updateRecipeSelection(id, field, value, card) {
  const recipe = state.recipes.find((item) => item.id === id);
  const selection = { ...(recipeSelections.get(id) || { date: "", mealType: savedRecipeMealType(recipe) }), [field]: value };
  if (!selection.date && !selection.mealType) recipeSelections.delete(id);
  else recipeSelections.set(id, selection);
  card.classList.toggle("selected", Boolean(selection.date && selection.mealType));
  if (field === "mealType" && recipe) {
    const saved = await saveRecipeMealType(recipe, value);
    if (!saved) return;
  }
}

async function saveRecipeMealType(recipe, mealType) {
  const previousTags = Array.isArray(recipe.tags) ? [...recipe.tags] : [];
  const nextTags = previousTags.filter((tag) => !String(tag).startsWith(MEAL_TYPE_TAG_PREFIX));
  if (mealTypes.some((type) => type.id === mealType)) nextTags.push(`${MEAL_TYPE_TAG_PREFIX}${mealType}`);
  recipe.tags = nextTags;
  if (canUseRemote()) {
    const { error } = await supabaseClient.from("recipes").update({ tags: nextTags }).eq("id", recipe.id);
    if (error) {
      console.error(error);
      recipe.tags = previousTags;
      const previousType = savedRecipeMealType(recipe);
      const selection = { ...(recipeSelections.get(recipe.id) || { date: "", mealType: previousType }), mealType: previousType };
      if (!selection.date && !selection.mealType) recipeSelections.delete(recipe.id);
      else recipeSelections.set(recipe.id, selection);
      renderHome();
      showToast("食種を保存できませんでした");
      return false;
    }
  } else {
    saveLocal();
  }
  return true;
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
  const recipe = state.recipes.find((item) => item.id === currentDialogRecipeId);
  els.dialogSelectButton.textContent = "このメニューの日付を選ぶ";
  els.dialogSelectButton.disabled = !recipe;
}

function toggleDialogRecipeSelection() {
  const recipeId = currentDialogRecipeId;
  els.recipeDialog.close();
  openDatePicker(recipeId);
}

function openDatePicker(recipeId) {
  datePickerRecipeId = recipeId;
  datePickerSelectedDate = "";
  const today = new Date();
  datePickerCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  els.datePickerMessage.textContent = "";
  renderDatePicker();
  els.datePickerDialog.showModal();
}

function moveDatePickerMonth(delta) {
  datePickerCursor = new Date(datePickerCursor.getFullYear(), datePickerCursor.getMonth() + delta, 1);
  datePickerSelectedDate = "";
  els.datePickerMessage.textContent = "";
  renderDatePicker();
}

function resetDatePicker() {
  datePickerSelectedDate = "";
  els.datePickerMessage.textContent = "";
  renderDatePicker();
}

function renderDatePicker() {
  const year = datePickerCursor.getFullYear();
  const month = datePickerCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  els.datePickerMonth.textContent = `${year}年${month + 1}月`;
  els.datePickerGrid.innerHTML = "";
  for (let index = 0; index < firstWeekday; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "date-picker-spacer";
    els.datePickerGrid.append(spacer);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const iso = toISODate(date);
    const button = document.createElement("button");
    button.className = `date-picker-day${iso === datePickerSelectedDate ? " selected" : ""}${iso === toISODate(new Date()) ? " today" : ""}`;
    button.type = "button";
    button.textContent = String(day);
    button.setAttribute("aria-label", `${year}年${month + 1}月${day}日`);
    button.setAttribute("aria-selected", String(iso === datePickerSelectedDate));
    button.addEventListener("click", () => {
      datePickerSelectedDate = iso;
      els.datePickerMessage.textContent = `${month + 1}/${day}を選択中`;
      renderDatePicker();
    });
    els.datePickerGrid.append(button);
  }
  els.datePickerConfirm.disabled = !datePickerSelectedDate;
}

async function confirmDatePicker() {
  if (!datePickerSelectedDate) return;
  const recipe = state.recipes.find((item) => item.id === datePickerRecipeId);
  const card = document.querySelector(`.recipe-card[data-recipe-id="${CSS.escape(datePickerRecipeId)}"]`);
  const mealType = card?.querySelector(".recipe-meal-type")?.value || savedRecipeMealType(recipe);
  if (!recipe || !card) return;
  if (!mealType) {
    els.datePickerMessage.textContent = "先に食種を選択してください。";
    return;
  }
  const selectedDate = datePickerSelectedDate;
  els.datePickerConfirm.disabled = true;
  els.datePickerDialog.close();
  await addRecipeToWeek(recipe, { date: selectedDate, mealType }, card);
}

async function addRecipeToWeek(recipe, selection, card) {
  const currentEntries = getDayDisplayEntries(selection.date);
  const slotIndex = mealSlots.findIndex((slot) => slot.id === selection.mealType);
  const existing = currentEntries[slotIndex] || null;
  const entry = {
    id: existing?.id || crypto.randomUUID(),
    plan_date: selection.date,
    meal_slot: existing?.meal_slot || selection.mealType,
    recipe_id: recipe.id
  };
  card.classList.add("saving");

  if (canUseRemote()) {
    const { error } = await supabaseClient.from("meal_plan_entries").upsert({ ...entry, user_id: currentUser.id }, { onConflict: "user_id,plan_date,meal_slot" });
    if (error) {
      console.error(error);
      showToast("登録できませんでした");
      card.classList.remove("saving");
      return;
    }
    await loadRemote();
  } else {
    state.plan = state.plan.filter((item) => item.id !== entry.id);
    state.plan.push(entry);
    saveLocal();
  }

  recipeSelections.delete(recipe.id);
  card.classList.remove("selected", "saving");
  state.weekCursor = startOfWeek(new Date(`${selection.date}T00:00:00`));
  renderWeekViews();
  showToast(`${formatShortDate(selection.date)}の${mealTypes[slotIndex].label}に登録しました`);
}

function renderWeekViews() {
  renderWeek();
  renderShoppingList();
}

function getDayDisplayEntries(iso) {
  const dayEntries = state.plan.filter((entry) => entry.plan_date === iso);
  const untypedEntries = dayEntries.filter((entry) => !entryMealTypeId(entry));
  let untypedIndex = 0;
  return mealSlots.map((slot) => {
    const current = dayEntries.find((entry) => entryMealTypeId(entry) === slot.id);
    if (current) return current;
    const untyped = untypedEntries[untypedIndex] || null;
    untypedIndex += untyped ? 1 : 0;
    return untyped;
  });
}

function entryMealTypeId(entry) {
  const parts = String(entry?.meal_slot || "").split(":");
  const candidate = parts[1] || parts[0];
  return mealTypes.some((type) => type.id === candidate) ? candidate : "";
}

function getWeekDisplayEntries() {
  return Array.from({ length: 7 }, (_, index) => getDayDisplayEntries(toISODate(addDays(state.weekCursor, index)))).flat().filter(Boolean);
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
    const displayEntries = getDayDisplayEntries(iso);
    mealSlots.forEach((slot, slotIndex) => {
      const entry = displayEntries[slotIndex];
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
  recipeSelections.clear();
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
  const entries = getWeekDisplayEntries();
  const bucket = new Map();
  entries.forEach((entry) => {
    const recipe = state.recipes.find((item) => item.id === entry.recipe_id);
    (recipe?.ingredients || []).forEach((ingredient) => {
      const shoppingIngredient = convertVegetableUnit(ingredient);
      const name = normalizeIngredientName(shoppingIngredient.name);
      if (!name) return;
      const unit = shoppingIngredient.unit || "";
      const key = `${toISODate(state.weekCursor)}:${name}:${unit}`;
      const current = bucket.get(key) || { key, name, unit, quantity: 0, raw: [] };
      if (typeof shoppingIngredient.quantity === "number" && Number.isFinite(shoppingIngredient.quantity)) current.quantity += shoppingIngredient.quantity;
      else current.raw.push(formatIngredient(shoppingIngredient));
      bucket.set(key, current);
    });
  });
  return Array.from(bucket.values()).map((item) => ({
    key: item.key,
    name: item.name,
    amount: item.quantity ? `${roundQuantity(item.quantity)}${item.unit}` : [...new Set(item.raw)].join(" / ")
  })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function convertVegetableUnit(ingredient) {
  if (ingredient?.unit !== "g" || typeof ingredient.quantity !== "number") return ingredient;
  const name = normalizeIngredientName(ingredient.name);
  const rule = vegetableUnitRules.find((item) => item.names.some((candidate) => name.includes(candidate)));
  if (!rule) return ingredient;
  const note = String(ingredient.note || "").normalize("NFKC");
  const notedCount = note.match(/(?:約)?([0-9]+(?:\/[0-9]+)?)\s*(?:本|個|玉|株|袋|パック|束|節)/);
  const quantity = notedCount ? parseJapaneseNumber(notedCount[1]) : ingredient.quantity / rule.grams;
  return { ...ingredient, quantity, unit: rule.unit, note: "" };
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
    if (loaded) {
      await seedDefaultRecipesIfNeeded();
      await removeDuplicateRecipes();
    }
  } else {
    loadLocal();
    await seedDefaultRecipesIfNeeded();
    await removeDuplicateRecipes();
  }
}

function normalizedRecipeTitle(title) {
  return String(title || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja");
}

async function removeDuplicateRecipes() {
  const grouped = new Map();
  state.recipes.forEach((recipe) => {
    const key = normalizedRecipeTitle(recipe.title);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(recipe);
  });
  const replacements = new Map();
  grouped.forEach((recipes) => {
    if (recipes.length < 2) return;
    const keeper = recipes.find((recipe) => String(recipe.source_title || "").startsWith(window.HOTCOOK_RECIPE_BOOK?.title || "")) || recipes[0];
    recipes.filter((recipe) => recipe.id !== keeper.id).forEach((recipe) => replacements.set(recipe.id, keeper.id));
  });
  if (!replacements.size) return;

  if (canUseRemote()) {
    for (const [duplicateId, keeperId] of replacements) {
      const { error } = await supabaseClient.from("meal_plan_entries").update({ recipe_id: keeperId }).eq("recipe_id", duplicateId);
      if (error) { console.error(error); return; }
    }
    const duplicateIds = [...replacements.keys()];
    const { error } = await supabaseClient.from("recipes").delete().in("id", duplicateIds);
    if (error) { console.error(error); return; }
  }

  state.plan = state.plan.map((entry) => ({ ...entry, recipe_id: replacements.get(entry.recipe_id) || entry.recipe_id }));
  state.recipes = state.recipes.filter((recipe) => !replacements.has(recipe.id));
  if (!canUseRemote()) saveLocal();
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
function formatWeekRange(start, end) { return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日（日）〜 ${end.getMonth() + 1}月${end.getDate()}日（土）`; }
function formatShortDate(iso) { const [, month, day] = String(iso).split("-"); return `${Number(month)}/${Number(day)}`; }

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
