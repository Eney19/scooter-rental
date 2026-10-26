// Проста авторизація адмінки: дві ролі (повний адмін і менеджер),
// визначаються паролем на /admin і зберігаються в sessionStorage.
// Менеджер бачить лише вкладки "Кур'єри" та "Каса" (повний доступ до
// карток курʼєрів з усіма сумами, але без Скутерів/Платежів/Календаря/Черги).

export type AdminRole = "admin" | "manager";

const ROLE_KEY = "admin_role";

export function getAdminRole(): AdminRole | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(ROLE_KEY);
  return v === "admin" || v === "manager" ? v : null;
}

export function setAdminRole(role: AdminRole) {
  sessionStorage.setItem(ROLE_KEY, role);
}

export function clearAdminRole() {
  sessionStorage.removeItem(ROLE_KEY);
  // Прибираємо й старий прапорець — на випадок, якщо він десь ще лишився.
  sessionStorage.removeItem("admin_auth");
}
