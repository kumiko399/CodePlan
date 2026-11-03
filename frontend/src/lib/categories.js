import { reactive } from "vue";
// Stable IDs also appear in backend/model/Categories.java and saved backups.
const palettes = {
  blue: ["#385b91", "#eaf1fc", "#afcbff", "#25354e"],
  green: ["#326548", "#e8f4ec", "#a5ddba", "#263d30"],
  orange: ["#91551d", "#fff1e2", "#f4c393", "#453425"],
  purple: ["#714698", "#f3eafa", "#d8b5fa", "#3d2f4b"],
  rose: ["#9c415b", "#fcebf0", "#f7b2c6", "#482d38"],
  teal: ["#23676d", "#e5f4f4", "#9ddde0", "#243d40"],
};
export const categories = reactive(
  [
    ["study", "📚", "blue"],
    ["life", "🏠", "orange"],
    ["sport", "🏃", "green"],
    ["algorithm", "🧩", "purple"],
    ["course", "🎓", "blue"],
    ["assignment", "📝", "orange"],
    ["exam", "🎯", "rose"],
    ["reading", "📖", "teal"],
    ["project", "💻", "purple"],
    ["club", "🎨", "orange"],
    ["social", "🤝", "rose"],
    ["meal", "🍱", "green"],
    ["rest", "🌙", "blue"],
    ["career", "💼", "teal"],
  ].map(([id, emoji, palette]) => {
    const [color, background, darkColor, darkBackground] = palettes[palette];
    return {
      id,
      active: true,
      emoji,
      style: {
        "--category-color": color,
        "--category-bg": background,
        "--category-dark-color": darkColor,
        "--category-dark-bg": darkBackground,
      },
    };
  }),
);
const byId = Object.fromEntries(
  categories.map((category) => [category.id, category]),
);
export function setCustomCategories(rows) {
  for (const id of Object.keys(byId)) if (id.startsWith("c_")) delete byId[id];
  categories.splice(14);
  for (const row of rows) {
    const c = { id: row.recordId, ...JSON.parse(row.payload) };
    const [color, background, darkColor, darkBackground] =
      palettes[c.color] || palettes.blue;
    c.style = {
      "--category-color": color,
      "--category-bg": background,
      "--category-dark-color": darkColor,
      "--category-dark-bg": darkBackground,
    };
    categories.push(c);
    byId[c.id] = c;
  }
}
export const categoryEmoji = (id) => byId[id]?.emoji || "📌";
export const taskEmoji = (task) =>
  task.details?.emoji || categoryEmoji(task.category);
export const categoryStyle = (id) => byId[id]?.style || byId.life.style;
export const categoryLabel = (id, t) =>
  `${categoryEmoji(id)} ${byId[id]?.name || t(id)}`;
