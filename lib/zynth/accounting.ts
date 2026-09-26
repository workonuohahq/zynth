export type NavResult = {
  previousNav: number;
  nav: number;
  returnPct: number;
  grossPerformance: number;
};

export function calculateStrategyNav(
  previousNav: number,
  previousBalance: number,
  currentBalance: number,
  currentEquity: number
): NavResult {
  if (previousNav <= 0 || previousBalance <= 0) {
    return {
      previousNav,
      nav: previousNav,
      returnPct: 0,
      grossPerformance: 0
    };
  }

  // MT5 balance captures realized P/L; equity captures realized + floating P/L.
  // Use the change in account equity relative to the previous balance as the
  // source performance for the strategy's daily mark.
  const grossPerformance = currentEquity - previousBalance;
  const returnPct = grossPerformance / previousBalance;
  const nav = previousNav * (1 + returnPct);

  return { previousNav, nav, returnPct, grossPerformance };
}

export function issueUnits(amount: number, nav: number) {
  if (amount <= 0 || nav <= 0) throw new Error("Investment amount and NAV must be positive.");
  return amount / nav;
}

export function valueUnits(units: number, nav: number) {
  return Math.max(0, units) * Math.max(0, nav);
}

export function performanceFee(
  entryNav: number,
  currentNav: number,
  units: number,
  feePct: number
) {
  if (feePct <= 0 || currentNav <= entryNav) return 0;
  return (currentNav - entryNav) * units * (feePct / 100);
}
