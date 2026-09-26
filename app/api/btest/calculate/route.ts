import { NextResponse } from "next/server";
import { calculateStrategyNav, performanceFee, valueUnits } from "@/lib/zynth/accounting";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const previousNav = Number(body.previousNav);
    const previousBalance = Number(body.previousBalance);
    const currentBalance = Number(body.currentBalance);
    const currentEquity = Number(body.currentEquity);
    const units = Number(body.units || 0);
    const entryNav = Number(body.entryNav || previousNav);
    const feePct = Number(body.feePct || 0);

    if (![previousNav, previousBalance, currentBalance, currentEquity].every(Number.isFinite)) {
      return NextResponse.json({ error: "Valid account and NAV values are required." }, { status: 400 });
    }

    const result = calculateStrategyNav(previousNav, previousBalance, currentBalance, currentEquity);
    const fee = performanceFee(entryNav, result.nav, units, feePct);

    return NextResponse.json({
      ...result,
      investorValueBeforeFee: valueUnits(units, result.nav),
      performanceFee: fee,
      investorValueAfterFee: Math.max(0, valueUnits(units, result.nav) - fee)
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Calculation failed"
    }, { status: 400 });
  }
}
