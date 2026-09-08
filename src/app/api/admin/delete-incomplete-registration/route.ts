import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Видаляє лише незавершені реєстрації (кур'єр ще не підписав договір) —
// не займає жодних платежів чи підписок, тож безпечно для очищення дублів
// зі спроб реєстрації, які курʼєр не довів до кінця.
export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier, error: courierErr } = await supabaseAdmin
      .from("couriers")
      .select("id, status, registration_step, contract_signed_at")
      .eq("id", courierId)
      .single();

    if (courierErr || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    const step = courier.registration_step ?? 3;
    if (step >= 3 || courier.contract_signed_at) {
      return NextResponse.json(
        { success: false, error: "Цей кур'єр уже підписав договір — таку реєстрацію видаляти не можна" },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("couriers")
      .delete()
      .eq("id", courierId);

    if (deleteErr) {
      return NextResponse.json({ success: false, error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("admin delete-incomplete-registration error", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
