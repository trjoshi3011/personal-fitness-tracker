import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { generateAiInsights } from "@/lib/gemini-insights";

export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await generateAiInsights(userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
