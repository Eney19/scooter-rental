"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAdminRole, clearAdminRole } from "@/lib/admin-auth";

type Purchase = {
  id: string;
  item_name: string;
  city: string | null;
  quantity: number;
  location: string | null;
  price: number | null;
  status: "pending" | "ordered" | "delivered";
  created_at: string;
  deleted_at: string | null;
};

const CITY_OPTIONS = ["Луцьк", "Рівне", "Львів"] as const;

const STATUS_LABELS: Record<Purchase["status"], string> = {
  pending: "Очікує",
  ordered: "Замовлено",
  delivered: "Доставлено",
};

const STATUS_STYLES: Record<Purchase["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  ordered: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_ORDER: Purchase["status"][] = ["pending", "ordered", "delivered"];

export default function AdminPurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Purchase["status"]>("all");
  const [showDeleted, setShowDeleted] = useState(false);

  // Форма додавання нового запису
  const [itemName, setItemName] = useState("");
  const [city, setCity] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Редагування існуючого запису
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPrice, setEditPrice] = useState("");

  async function loadPurchases() {
    setLoading(true);
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error("loadPurchases failed", error);
    setPurchases(data || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const r = getAdminRole();
      if (!r) {
        router.push("/admin");
        return;
      }
      if (r !== "admin") {
        router.push("/admin/couriers");
        return;
      }
      await loadPurchases();
    }
    init();
  }, []);

  async function addPurchase() {
    const name = itemName.trim();
    if (!name) {
      alert("Вкажіть назву товару");
      return;
    }
    const qtyNum = Number(quantity) || 1;
    const priceNum = price.trim() === "" ? null : Number(price);
    setSubmitting(true);
    const { data, error } = await supabase
      .from("purchases")
      .insert({
        item_name: name,
        city: city || null,
        quantity: qtyNum,
        location: location.trim() || null,
        price: priceNum,
        status: "pending",
      })
      .select()
      .single();
    if (error) {
      console.error("addPurchase failed", error);
      alert(`Не вдалося зберегти: ${error.message}`);
    } else if (data) {
      setPurchases(prev => [data as Purchase, ...prev]);
      setItemName("");
      setCity("");
      setQuantity("1");
      setLocation("");
      setPrice("");
    }
    setSubmitting(false);
  }

  function startEdit(p: Purchase) {
    setEditingId(p.id);
    setEditItemName(p.item_name);
    setEditCity(p.city || "");
    setEditQuantity(String(p.quantity));
    setEditLocation(p.location || "");
    setEditPrice(p.price !== null ? String(p.price) : "");
  }

  async function saveEdit(p: Purchase) {
    const name = editItemName.trim();
    if (!name) {
      alert("Вкажіть назву товару");
      return;
    }
    const qtyNum = Number(editQuantity) || 1;
    const priceNum = editPrice.trim() === "" ? null : Number(editPrice);
    const locationVal = editLocation.trim() || null;
    const cityVal = editCity || null;
    const { error } = await supabase
      .from("purchases")
      .update({ item_name: name, city: cityVal, quantity: qtyNum, location: locationVal, price: priceNum })
      .eq("id", p.id);
    if (error) {
      console.error("saveEdit failed", error);
      alert(`Не вдалося зберегти: ${error.message}`);
      return;
    }
    setPurchases(prev =>
      prev.map(x => (x.id === p.id ? { ...x, item_name: name, city: cityVal, quantity: qtyNum, location: locationVal, price: priceNum } : x))
    );
    setEditingId(null);
  }

  async function setStatus(p: Purchase, status: Purchase["status"]) {
    if (status === p.status) return;
    const { error } = await supabase.from("purchases").update({ status }).eq("id", p.id);
    if (error) {
      console.error("setStatus failed", error);
      alert(`Не вдалося зберегти: ${error.message}`);
      return;
    }
    setPurchases(prev => prev.map(x => (x.id === p.id ? { ...x, status } : x)));
  }

  async function deletePurchase(p: Purchase) {
    if (!confirm(`Видалити "${p.item_name}" зі списку закупівель?`)) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("purchases").update({ deleted_at: nowIso }).eq("id", p.id);
    if (error) {
      console.error("deletePurchase failed", error);
      alert(`Не вдалося видалити: ${error.message}`);
      return;
    }
    setPurchases(prev => prev.map(x => (x.id === p.id ? { ...x, deleted_at: nowIso } : x)));
  }

  async function restorePurchase(p: Purchase) {
    const { error } = await supabase.from("purchases").update({ deleted_at: null }).eq("id", p.id);
    if (error) {
      console.error("restorePurchase failed", error);
      alert(`Не вдалося відновити: ${error.message}`);
      return;
    }
    setPurchases(prev => prev.map(x => (x.id === p.id ? { ...x, deleted_at: null } : x)));
  }

  const activePurchases = purchases.filter(p => !p.deleted_at);
  const deletedPurchases = purchases.filter(p => p.deleted_at);
  const visiblePurchases = activePurchases.filter(p => statusFilter === "all" || p.status === statusFilter);

  const pendingTotal = activePurchases
    .filter(p => p.status !== "delivered")
    .reduce((sum, p) => sum + (p.price || 0) * p.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-sm">⚡</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">PowerDrive Admin</h1>
          </div>
          <button
            onClick={() => { clearAdminRole(); router.push("/admin"); }}
            className="text-sm text-slate-400 hover:text-slate-600 shrink-0"
          >
            Вийти
          </button>
        </div>
        <nav className="flex gap-4 text-sm mt-3 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
          <a href="/admin/couriers" className="text-slate-500 hover:text-slate-700 shrink-0">Кур&apos;єри</a>
          <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700 shrink-0">Скутери</a>
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700 shrink-0">Платежі</a>
          <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700 shrink-0">Календар</a>
          <a href="/admin/queue" className="text-slate-500 hover:text-slate-700 shrink-0">Черга</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1 shrink-0">Закупити</span>
          <a href="/admin/cash" className="text-slate-500 hover:text-slate-700 shrink-0">Каса</a>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <p className="text-xs text-slate-400 mb-3">Додати товар для закупівлі</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_6rem_10rem_8rem] gap-3 mb-3">
            <input
              type="text"
              placeholder="Назва товару"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-slate-700"
            >
              <option value="">Місто</option>
              {CITY_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="К-сть"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Де купити (магазин або сайт)"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              placeholder="Ціна, грн"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={addPurchase}
            disabled={submitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
          >
            + Додати до списку
          </button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                statusFilter === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
              }`}
            >
              Всі ({activePurchases.length})
            </button>
            {STATUS_ORDER.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  statusFilter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
                }`}
              >
                {STATUS_LABELS[s]} ({activePurchases.filter(p => p.status === s).length})
              </button>
            ))}
          </div>
          {pendingTotal > 0 && (
            <div className="text-sm text-slate-500">
              Орієнтовно потрібно: <span className="font-semibold text-slate-800">{pendingTotal.toLocaleString("uk-UA")} грн</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Завантаження...</div>
          ) : visiblePurchases.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {statusFilter === "all" ? "Список закупівель порожній" : "Немає товарів з таким статусом"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-400 text-xs">
                    <th className="px-4 py-3 font-medium">Товар</th>
                    <th className="px-4 py-3 font-medium">Місто</th>
                    <th className="px-4 py-3 font-medium">К-сть</th>
                    <th className="px-4 py-3 font-medium">Де купити</th>
                    <th className="px-4 py-3 font-medium">Ціна</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visiblePurchases.map(p => (
                    <tr key={p.id}>
                      {editingId === p.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editItemName}
                              onChange={e => setEditItemName(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={editCity}
                              onChange={e => setEditCity(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700"
                            >
                              <option value="">Місто</option>
                              {CITY_OPTIONS.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min={1}
                              value={editQuantity}
                              onChange={e => setEditQuantity(e.target.value)}
                              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editLocation}
                              onChange={e => setEditLocation(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value)}
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{STATUS_LABELS[p.status]}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <button onClick={() => saveEdit(p)} className="text-xs text-blue-600 hover:underline mr-3">Зберегти</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:underline">Скасувати</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-slate-800">{p.item_name}</td>
                          <td className="px-4 py-3 text-slate-600">{p.city || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600">{p.quantity}</td>
                          <td className="px-4 py-3 text-slate-600">{p.location || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {p.price !== null ? `${(p.price * p.quantity).toLocaleString("uk-UA")} грн` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={p.status}
                              onChange={e => setStatus(p, e.target.value as Purchase["status"])}
                              className={`rounded-full border px-2 py-1 text-xs font-medium focus:outline-none ${STATUS_STYLES[p.status]}`}
                            >
                              {STATUS_ORDER.map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <button onClick={() => startEdit(p)} className="text-xs text-slate-400 hover:text-slate-700 mr-3">Редагувати</button>
                            <button onClick={() => deletePurchase(p)} className="text-xs text-slate-400 hover:text-red-600">Видалити</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {deletedPurchases.length > 0 && (
          <div>
            <button onClick={() => setShowDeleted(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 mb-2">
              {showDeleted ? "Сховати" : "Показати"} видалені ({deletedPurchases.length})
            </button>
            {showDeleted && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {deletedPurchases.map(p => (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                      <div className="flex-1 min-w-0 text-sm text-slate-500 line-through truncate">
                        {p.item_name} · {p.quantity} шт.{p.city ? ` · ${p.city}` : ""}{p.location ? ` · ${p.location}` : ""}
                      </div>
                      <button onClick={() => restorePurchase(p)} className="text-xs text-blue-500 hover:underline shrink-0">Відновити</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
