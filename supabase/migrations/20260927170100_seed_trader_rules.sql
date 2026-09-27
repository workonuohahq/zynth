insert into public.zynth_trader_rule_documents(version,title,content,requires_reacknowledgement,status,published_at)
select 1,'ZYNTH Trader Rules & Standards',$rules$
# ZYNTH Trader Rules & Standards

**Effective immediately**

These standards govern every trader entrusted with ZYNTH capital. Capital assigned to a trader remains ZYNTH capital and may include investor capital. Traders are expected to protect capital, follow the assigned mandate, report accurately and maintain professional discipline.

## 1. Capital Protection & Risk

- Treat all assigned capital as entrusted capital; never treat it as personal funds.
- Trade only within the capital, instruments, leverage and risk limits assigned by ZYNTH.
- Never increase risk, leverage or position size for the purpose of recovering losses without explicit authorization.
- Do not revenge trade, martingale, deliberately average into losses, or otherwise attempt unauthorized loss recovery.
- Immediately report any material execution, broker, account or risk incident to Operations.
- ZYNTH may reduce, suspend or reallocate a trader's capital mandate at any time for risk-management reasons.

## 2. Trading Conduct

- Trade only the strategy and instruments approved for the assigned mandate.
- Do not trade another person's ZYNTH account or allow another person to trade yours.
- Do not share MT5 credentials, passwords or access tokens.
- Do not disable, bypass or interfere with ZYNTH monitoring or control systems.
- Do not use unauthorized automated systems, signal services or external execution arrangements.
- Do not place trades for personal, undisclosed or conflicting interests through a ZYNTH account.

## 3. Daily Reporting

- A complete trading/valuation report is required every required reporting day.
- Reports must be submitted within the reporting window shown on the Trader Desk.
- Reports must accurately disclose realised P&L, current unrealised P&L, external capital movements and material notes.
- Never falsify, conceal, backdate or deliberately omit trading information.
- Technical problems that may prevent timely reporting must be reported to Operations as soon as possible.
- **Three missed required daily reports within one calendar month may result in termination.**
- Repeated late, incomplete or inaccurate reporting may result in disciplinary action even when no report is completely missed.

## 4. Account & System Security

- Keep the verified MT5 account details accurate and current.
- Immediately report suspected credential compromise or unauthorized access.
- Do not attempt to bypass Trader Desk, PWA, MT5 verification or role controls.
- Use only your own ZYNTH credentials.
- Do not access another trader's workspace or information.

## 5. Investor Capital & Confidentiality

- Investor information, balances, identities and portfolio information are confidential.
- Do not disclose ZYNTH trading activity, investor information or internal controls without authorization.
- Never contact investors privately to solicit funds, personal investments or side arrangements using your position at ZYNTH.
- Do not represent personal opinions or performance claims as official ZYNTH statements.

## 6. Professional Standards

- Maintain accurate and professional records.
- Respond to reasonable Operations requests within the required timeframe.
- Declare actual or potential conflicts of interest.
- Cooperate with performance, risk and compliance reviews.
- Do not manipulate reports, records or supporting evidence.
- A profitable result does not excuse a policy or risk violation.

## 7. Discipline & Consequences

### Three-warning framework

Ordinary disciplinary breaches may follow this progression:

**Warning 1 — Formal Warning:** the violation is recorded and corrective action is required.

**Warning 2 — Final Warning:** the trader enters heightened management review and may have trading privileges or capital allocation reduced.

**Warning 3 — Termination:** three active formal warnings trigger termination and removal of Trader Desk access.

### Immediate suspension or termination

Certain conduct may bypass the three-warning sequence, including suspected fraud, theft or misappropriation, deliberate falsification or concealment of losses, unauthorized transfer of funds, credential sharing, deliberate circumvention of risk controls, material unauthorized trading, serious confidentiality breaches, or other intentional conduct that exposes ZYNTH or investor capital to material unauthorized risk.

Trading access may be suspended while an incident is investigated.

## 8. Capital Allocation & Performance

- Performance is evaluated together with risk discipline, consistency and mandate compliance.
- Strong returns do not grant permission to violate risk controls.
- ZYNTH may increase, maintain, reduce or withdraw a trader's capital allocation based on internal review.
- Trader compensation is governed by the applicable employment or contractor agreement and is not a direct commission on investor profits.

## 9. Rule Updates

ZYNTH may update these standards when operational, risk, regulatory or business requirements change. Material updates may require traders to review and acknowledge a new version before continuing normal trading activity.

**Trader acknowledgement means the trader confirms that they have read and understood the current version and agree to operate under it.**
$rules$
,true,'published',now()
where not exists (select 1 from public.zynth_trader_rule_documents where status='published');