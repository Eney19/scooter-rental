"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAdminRole, clearAdminRole, type AdminRole } from "@/lib/admin-auth";

type CashEntry = {
  id: string;
  city: string;
  amount: number;
  comment: string | null;
  created_at: string;
  deleted_at: string | null;
};

type CashEntryEdit = {
  id: string;
  entry_id: string;
  old_amount: number;
  old_comment: string | null;
  new_amount: number;
  new_comment: string | null;
  edited_at: string;
};

const CITIES = ["Луцьк", "Рівне", "Львів"];

export default function AdminCashPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState<string>(CITIES[0]);
  const [amountInput, setAmountInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editSign, setEditSign] = useState<1 | -1>(1);
  const [showDeleted, setShowDeleted] = useState(false);
  const [edits, setEdits] = useState<CashEntryEdit[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    async function init() {
      const r = getAdminRole();
      if (!r) {
        router.push("/admin");
        return;
      }
      setRole(r);
      await loadEntries();
    }
    init();
  }, []);

  async function loadEntries() {
    setLoading(true);
    const [entriesRes, editsRes] = await Promise.all([
      supabase.from("cash_entries").select("*").order("created_at", { ascending: false }),
      supabase.from("cash_entry_edits").select("*").order("edited_at", { ascending: false }),
    ]);
    if (entriesRes.error) console.error("loadEntries failed", entriesRes.error);
    if (editsRes.error) console.error("loadEdits failed", editsRes.error);
    setEntries(entriesRes.data || []);
    setEdits(editsRes.data || []);
    setLoading(false);
  }

  async function addEntry(sign: 1 | -1) {
    const num = Number(amountInput);
    if (!num || num <= 0) {
      alert("Вкажіть суму більше нуля");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("cash_entries")
      .insert({ city, amount: sign * num, comment: commentInput.trim() || null })
      .select()
      .single();
    if (error) {
      console.error("addEntry failed", error);
      alert(`Не вдалося зберегти: ${error.message}`);
    } else if (data) {
      setEntries(prev => [data as CashEntry, ...prev]);
      setAmountInput("");
      setCommentInput("");
    }
    setSubmitting(false);
  }

  function startEdit(e: CashEntry) {
    setEditingId(e.id);
    setEditAmount(String(Math.abs(e.amount)));
    setEditComment(e.comment || "");
    setEditSign(e.amount < 0 ? -1 : 1);
  }

  async function saveEdit(e: CashEntry) {
    const num = Number(editAmount);
    if (!num || num <= 0) {
      alert("Вкажіть суму більше нуля");
      return;
    }
    const newAmount = editSign * num;
    const newComment = editComment.trim() || null;
    if (newAmount === e.amount && newComment === e.comment) {
      setEditingId(null);
      return;
    }
    // Зберігаємо попереднє значення в історію редагувань ПЕРЕД перезаписом,
    // щоб завжди було видно, що саме й коли змінили.
    const { data: editRow, error: editError } = await supabase
      .from("cash_entry_edits")
      .insert({
        entry_id: e.id,
        old_amount: e.amount,
        old_comment: e.comment,
        new_amount: newAmount,
        new_comment: newComment,
      })
      .select()
      .single();
    if (editError) {
      console.error("saveEdit history insert failed", editError);
      alert(`Не вдалося зберегти історію редагування: ${editError.message}`);
      return;
    }
    const { error } = await supabase
      .from("cash_entries")
      .update({ amount: newAmount, comment: newComment })
      .eq("id", e.id);
    if (error) {
      console.error("saveEdit failed", error);
      alert(`Не вдалося зберегти: ${error.message}`);
      return;
    }
    setEntries(prev => prev.map(x => (x.id === e.id ? { ...x, amount: newAmount, comment: newComment } : x)));
    if (editRow) setEdits(prev => [editRow as CashEntryEdit, ...prev]);
    setEditingId(null);
  }

  async function deleteEntry(e: CashEntry) {
    const label = `${e.amount > 0 ? "+" : ""}${e.amount.toLocaleString("uk-UA")} грн${e.comment ? ` (${e.comment})` : ""}`;
    if (!confirm(`Видалити запис ${label}?\n\nЗапис залишиться у "Видалених" для історії, але перестане враховуватись у касі.`)) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("cash_entries").update({ deleted_at: nowIso }).eq("id", e.id);
    if (error) {
      console.error("deleteEntry failed", error);
      alert(`Не вдалося видалити: ${error.message}`);
      return;
    }
    setEntries(prev => prev.map(x => (x.id === e.id ? { ...x, deleted_at: nowIso } : x)));
  }

  const cityEntries = entries.filter(e => e.city === city);
  const activeEntries = cityEntries.filter(e => !e.deleted_at);
  const deletedEntries = cityEntries.filter(e => e.deleted_at);
  const balance = activeEntries.reduce((sum, e) => sum + e.amount, 0);

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
          <a href="/admin/couriers" className="text-slate-500 hover:text-slate-700 shrink-0">Кур'єри</a>
          {role === "admin" && (
            <>
              <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700 shrink-0">Скутери</a>
              <a href="/admin/payments" className="text-slate-500 hover:text-slate-700 shrink-0">Платежі</a>
              <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700 shrink-0">Календар</a>
              <a href="/admin/queue" className="text-slate-500 hover:text-slate-700 shrink-0">Черга</a>
            </>
          )}
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1 shrink-0">Каса</span>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-2 mb-6 flex-wrap">
          {CITIES.map(c => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                city === c
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 text-center">
          <div className="text-xs text-slate-400 mb-1">У касі зараз · {city}</div>
          <div className={`text-4xl font-bold ${balance < 0 ? "text-red-600" : "text-slate-900"}`}>
            {balance.toLocaleString("uk-UA")} грн
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <input
            type="number"
            inputMode="decimal"
            placeholder="Сума, грн"
            value={amountInput}
            onChange={e => setAmountInput(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Коментар (необов'язково) — запчастини, завдаток, оплата..."
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => addEntry(1)}
              disabled={submitting}
              className="py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-2xl font-bold disabled:opacity-50"
            >
              + Прихід
            </button>
            <button
              onClick={() => addEntry(-1)}
              disabled={submitting}
              className="py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-2xl font-bold disabled:opacity-50"
            >
              − Розхід
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Завантаження...</div>
          ) : activeEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Записів ще немає</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {activeEntries.map(e => {
                const history = edits.filter(h => h.entry_id === e.id);
                return (
                <div key={e.id}>
                  <div className="px-4 py-3 flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                    {editingId === e.id ? (
                      <>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => setEditSign(1)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium ${editSign === 1 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}
                          >
                            +
                          </button>
                          <button
                            onClick={() => setEditSign(-1)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium ${editSign === -1 ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500"}`}
                          >
                            −
                          </button>
                        </div>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={ev => setEditAmount(ev.target.value)}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                        <input
                          type="text"
                          value={editComment}
                          onChange={ev => setEditComment(ev.target.value)}
                          placeholder="Коментар"
                          className="flex-1 min-w-[8rem] rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                        <button onClick={() => saveEdit(e)} className="text-xs text-blue-600 hover:underline shrink-0">Зберегти</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:underline shrink-0">Скасувати</button>
                      </>
                    ) : (
                      <>
                        <div className="w-24 shrink-0">
                          <span className={`font-semibold ${e.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {e.amount >= 0 ? "+" : ""}
                            {e.amount.toLocaleString("uk-UA")} грн
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 text-sm text-slate-600 truncate">
                          {e.comment || <span className="text-slate-300">без коментаря</span>}
                        </div>
                        <div className="text-xs text-slate-400 shrink-0">{new Date(e.created_at).toLocaleString("uk-UA")}</div>
                        {history.length > 0 && (
                          <button
                            onClick={() => setExpandedHistoryId(id => (id === e.id ? null : e.id))}
                            className="text-xs text-amber-600 hover:underline shrink-0"
                          >
                            {expandedHistoryId === e.id ? "Сховати історію" : `Змінено (${history.length})`}
                          </button>
                        )}
                        <button onClick={() => startEdit(e)} className="text-xs text-slate-400 hover:text-slate-700 shrink-0">Редагувати</button>
                        <button onClick={() => deleteEntry(e)} className="text-xs text-slate-400 hover:text-red-600 shrink-0">Видалити</button>
                      </>
                    )}
                  </div>
                  {expandedHistoryId === e.id && history.length > 0 && (
                    <div className="px-4 pb-3 -mt-1">
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs space-y-1.5">
                        <p className="text-amber-700 font-medium">Історія редагувань (незмінна)</p>
                        {history.map(h => (
                          <p key={h.id} className="text-slate-600">
                            {new Date(h.edited_at).toLocaleString("uk-UA")}:{" "}
                            <span className={h.old_amount >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {h.old_amount >= 0 ? "+" : ""}
                              {h.old_amount.toLocaleString("uk-UA")} грн{h.old_comment ? ` (${h.old_comment})` : ""}
                            </span>
                            {" → "}
                            <span className={h.new_amount >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {h.new_amount >= 0 ? "+" : ""}
                              {h.new_amount.toLocaleString("uk-UA")} грн{h.new_comment ? ` (${h.new_comment})` : ""}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {deletedEntries.length > 0 && (
          <div>
            <button onClick={() => setShowDeleted(v => !v)} className="text-xs text-slate-400 hover:text-slate-600 mb-2">
              {showDeleted ? "Сховати" : "Показати"} видалені записи ({deletedEntries.length})
            </button>
            {showDeleted && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {deletedEntries.map(e => (
                    <div key={e.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                      <div className="w-24 shrink-0 line-through">
                        <span className={`font-semibold ${e.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {e.amount >= 0 ? "+" : ""}
                          {e.amount.toLocaleString("uk-UA")} грн
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-500 truncate line-through">
                        {e.comment || "без коментаря"}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0">
                        {new Date(e.created_at).toLocaleString("uk-UA")}
                        {e.deleted_at ? ` · видалено ${new Date(e.deleted_at).toLocaleString("uk-UA")}` : ""}
                      </div>
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
