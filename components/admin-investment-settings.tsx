"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  Clock3,
  CreditCard,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

const DEF: any = {
  investment_enabled: false,
  strategy_entry_enabled: false,
  strategy_exit_enabled: false,
  vault_profit_lock_days: 30,
  global_min_deposit: 5500,
  global_min_withdrawal: 100,
  deposit_fee_pct: 0,
  deposit_fee_fixed: 0,
  withdrawal_fee_pct: 10,
  withdrawal_fee_fixed: 0,
  deposits_enabled: true,
  withdrawals_enabled: true,
  exit_fee_pct: 0,
  settlement_enabled: true,
  settlement_timezone: "Africa/Lagos",
  settlement_cutoff_time: "23:59",
  require_flat_trading_day: true,
  deposit_page_title: "Fund your wallet",
  deposit_page_subtitle: "",
  deposit_page_notice: "",
  deposit_instructions: "",
  flutterwave_enabled: false,
  flutterwave_title: "Flutterwave",
  flutterwave_account_name: "",
  flutterwave_account_number: "",
  flutterwave_bank_name: "",
  flutterwave_extra: "",
  paystack_enabled: false,
  paystack_title: "Paystack",
  paystack_account_name: "",
  paystack_account_number: "",
  paystack_bank_name: "",
  paystack_extra: "",
  withdrawal_processing_notice: "Withdrawals are reviewed manually.",
  exit_delay_hours: 24,
  exit_minimum_amount: 1000,
  exit_allow_partial: true,
  exit_cancel_window_minutes: 30,
  topup_enabled: true,
  topup_min_amount: 1000,
  exit_processing_notice: "Redemptions are reviewed before funds are released.",
  topup_processing_notice:
    "Your top-up is added to the same strategy position at the current NAV after confirmation.",
};

const groups: any[] = [
  [
    "Platform operations",
    "Master switches and financial thresholds.",
    Settings2,
    [
      ["t", "investment_enabled", "Investment engine", "Master switch for investor positions."],
      ["t", "strategy_entry_enabled", "Strategy entry", "Allow new strategy positions."],
      ["t", "strategy_exit_enabled", "Strategy exit", "Allow investor redemptions."],
      ["t", "deposits_enabled", "Deposits", "Allow wallet funding requests."],
      ["t", "withdrawals_enabled", "Withdrawals", "Allow withdrawal requests."],
      ["n", "global_min_deposit", "Minimum deposit", "NGN"],
      ["n", "global_min_withdrawal", "Minimum withdrawal", "NGN"],
    ],
  ],
  [
    "Transaction fees",
    "Control deposit and withdrawal charges independently.",
    Banknote,
    [
      ["n", "deposit_fee_pct", "Deposit fee percentage", "Percentage added on top of the credited deposit."],
      ["n", "deposit_fee_fixed", "Deposit fixed fee", "NGN added on top of the credited deposit."],
      ["n", "withdrawal_fee_pct", "Withdrawal fee percentage", "Percentage deducted from the gross withdrawal."],
      ["n", "withdrawal_fee_fixed", "Withdrawal fixed fee", "NGN deducted from the gross withdrawal."],
    ],
  ],
  [
    "Investment liquidity",
    "Fine-grained controls for exits and top-ups.",
    LockKeyhole,
    [
      ["n", "exit_fee_pct", "Exit fee", "Percentage deducted from redemption proceeds."],
      ["n", "exit_delay_hours", "Release delay", "Hours between approval and available balance."],
      ["n", "exit_minimum_amount", "Minimum exit", "NGN. Partial/full redemption threshold."],
      ["t", "exit_allow_partial", "Allow partial exits", "Investors can redeem part of a position."],
      ["n", "exit_cancel_window_minutes", "Cancel window", "Minutes after request during which the investor can cancel."],
      ["t", "topup_enabled", "Top-ups", "Allow investors to add to an existing position."],
      ["n", "topup_min_amount", "Minimum top-up", "NGN."],
      ["x", "exit_processing_notice", "Exit notice", "Shown to investors before redemption."],
      ["x", "topup_processing_notice", "Top-up notice", "Shown to investors before top-up."],
    ],
  ],
  [
    "Vault & profit rules",
    "Controls when realized profit becomes withdrawable.",
    LockKeyhole,
    [["n", "vault_profit_lock_days", "Profit lock period", "Days. Existing lots keep their original unlock date."]],
  ],
  [
    "Daily settlement",
    "Controls trader reporting and the daily NAV cutoff.",
    Clock3,
    [
      ["t", "settlement_enabled", "Settlement engine", "Allow reports into the settlement queue."],
      ["x", "settlement_timezone", "Timezone", "Example: Africa/Lagos"],
      ["time", "settlement_cutoff_time", "Daily cutoff", "Local strategy cutoff."],
      ["t", "require_flat_trading_day", "Require flat day", "Require positions to be closed at cutoff."],
    ],
  ],
  [
    "Deposit experience",
    "User-facing funding page content.",
    WalletCards,
    [
      ["x", "deposit_page_title", "Page title", ""],
      ["x", "deposit_page_subtitle", "Subtitle", ""],
      ["x", "deposit_page_notice", "Payment notice", ""],
      ["x", "deposit_instructions", "Payment instructions", ""],
    ],
  ],
  [
    "Payment channels",
    "Operational payment instructions shown to users.",
    CreditCard,
    [
      ["t", "flutterwave_enabled", "Flutterwave enabled", "Show this funding channel."],
      ["x", "flutterwave_title", "Flutterwave display name", ""],
      ["x", "flutterwave_account_name", "Flutterwave account name", ""],
      ["x", "flutterwave_account_number", "Flutterwave account number", ""],
      ["x", "flutterwave_bank_name", "Flutterwave bank name", ""],
      ["x", "flutterwave_extra", "Flutterwave extra instructions", ""],
      ["t", "paystack_enabled", "Paystack enabled", "Show this funding channel."],
      ["x", "paystack_title", "Paystack display name", ""],
      ["x", "paystack_account_name", "Paystack account name", ""],
      ["x", "paystack_account_number", "Paystack account number", ""],
      ["x", "paystack_bank_name", "Paystack bank name", ""],
      ["x", "paystack_extra", "Paystack extra instructions", ""],
    ],
  ],
  [
    "Withdrawal operations",
    "Rules and messaging for manual withdrawal processing.",
    Banknote,
    [["x", "withdrawal_processing_notice", "Processing notice", "Shown to investors during withdrawal."]],
  ],
];

function Field({ f, s, update }: { f: any; s: any; update: (key: string, value: any) => void }) {
  const [kind, key, label, help] = f;

  if (kind === "t") {
    return (
      <label className="zst">
        <span>
          <b>{label}</b>
          <small>{help}</small>
        </span>
        <input type="checkbox" checked={!!s[key]} onChange={(e) => update(key, e.target.checked)} />
      </label>
    );
  }

  const numeric = kind === "n";
  const pct = /fee_pct$/.test(key);

  return (
    <label className="zsf">
      <span>{label}</span>
      <input
        type={numeric ? "number" : kind === "time" ? "time" : "text"}
        min={numeric ? 0 : undefined}
        max={numeric && pct ? 100 : undefined}
        step={numeric ? 0.01 : undefined}
        value={s[key] ?? ""}
        onChange={(e) => update(key, numeric ? Number(e.target.value) : e.target.value)}
      />
      <small>{help}</small>
    </label>
  );
}

export default function AdminInvestmentSettings({ refreshKey }: { refreshKey?: number }) {
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const [crypto, setCrypto] = useState<any>(null);
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [cryptoKey, setCryptoKey] = useState("");
  const [cryptoSecret, setCryptoSecret] = useState("");
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [cryptoMessage, setCryptoMessage] = useState("");
  const [cryptoError, setCryptoError] = useState("");
  const [cryptoCurrencies, setCryptoCurrencies] = useState<any[]>([]);
  const [cryptoSearch, setCryptoSearch] = useState("");
  const [cryptoSyncing, setCryptoSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/admin/payment-provider", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load NOWPayments settings.");
        setCrypto(data.settings || null);
        setCryptoCurrencies(Array.isArray(data.currencies) ? data.currencies : []);
      })
      .catch((e) => setCryptoError(e.message));
  }, []);

  useEffect(() => {
    fetch("/api/admin/investment-settings", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load settings.");
        setSettings({ ...DEF, ...data.settings });
      })
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  const update = (key: string, value: any) => {
    setSettings((current: any) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage("");
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((current) => ({ ...current, [title]: !current[title] }));
  };

  async function saveSettings() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/investment-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed.");
      setSettings({ ...DEF, ...data.settings });
      setDirty(false);
      setMessage("All settings saved and audited.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function testCrypto() {
    setCryptoBusy(true);
    setCryptoSyncing(true);
    setCryptoMessage("");
    setCryptoError("");
    try {
      const r = await fetch("/api/admin/payment-provider", { method: "POST" });
      const data = await r.json();
      if (Array.isArray(data.available)) {
        setCryptoCurrencies(data.available.map((code: string) => ({
          currency_code: String(code).toLowerCase(),
          symbol: String(code).toUpperCase(),
          provider_available: true,
          zynth_enabled: Array.isArray(data.selected) && data.selected.includes(String(code).toLowerCase())
        })));
      }
      if (!r.ok) throw new Error(data.error || data.message || "NOWPayments synchronization failed.");
      setCryptoMessage(data.message || "NOWPayments catalog synchronized.");
      const refresh = await fetch("/api/admin/payment-provider", { cache: "no-store" });
      const refreshed = await refresh.json();
      if (refresh.ok) {
        setCrypto(refreshed.settings || crypto);
        setCryptoCurrencies(Array.isArray(refreshed.currencies) ? refreshed.currencies : []);
      }
    } catch (e: any) {
      setCryptoError(e.message);
    } finally {
      setCryptoBusy(false);
      setCryptoSyncing(false);
    }
  }

  async function saveCrypto() {
    setCryptoBusy(true);
    setCryptoMessage("");
    setCryptoError("");
    try {
      const selected = cryptoCurrencies.filter((x: any) => x.provider_available && x.zynth_enabled).map((x: any) => String(x.currency_code).toLowerCase());
      if (crypto?.enabled && !selected.length) throw new Error("Select at least one currently available asset before enabling crypto deposits.");
      const r = await fetch("/api/admin/payment-provider", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...crypto,
          zynth_enabled_currencies: selected,
          api_key: cryptoKey,
          ipn_secret: cryptoSecret
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to save crypto settings.");
      setCrypto(data.settings || crypto);
      setCryptoCurrencies(Array.isArray(data.currencies) ? data.currencies : cryptoCurrencies);
      setCryptoKey("");
      setCryptoSecret("");
      setCryptoMessage("NOWPayments settings saved securely.");
    } catch (e: any) {
      setCryptoError(e.message);
    } finally {
      setCryptoBusy(false);
    }
  }

  if (error) {
    return (
      <div className="zse">
        <AlertTriangle />
        <div>
          <b>Settings unavailable</b>
          <p>{error}</p>
          <button className="ghost" onClick={() => { setError(""); setSettings(null); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="admin-empty">
        <ShieldCheck size={20} />
        <p>Loading system controls…</p>
      </div>
    );
  }

  return (
    <div className="zsw">
      <div className="zstatus">
        <span>● Investment {settings.investment_enabled ? "LIVE" : "OFF"}</span>
        <span>● Deposits {settings.deposits_enabled ? "OPEN" : "PAUSED"}</span>
        <span>● Withdrawals {settings.withdrawals_enabled ? "OPEN" : "PAUSED"}</span>
      </div>

      <div className="zintro">
        <span>SETTINGS CENTER</span>
        <p>Open a section only when you need to review or change its controls.</p>
      </div>

      {groups.map(([title, description, Icon, fields], index) => (
        <section className={"zss" + (openGroups[title] ? " is-open" : "")} key={title}>
          <button
            type="button"
            className="ztrigger"
            aria-expanded={!!openGroups[title]}
            aria-controls={"settings-group-" + index}
            onClick={() => toggleGroup(title)}
          >
            <span className="ztrigger-copy">
              <i><Icon size={17} /></i>
              <span>
                <h3>{title}</h3>
                <p>{description}</p>
              </span>
            </span>
            <ChevronDown size={18} className="zchevron" />
          </button>

          <div
            id={"settings-group-" + index}
            className={"zpanel" + (openGroups[title] ? " is-open" : "")}
            aria-hidden={!openGroups[title]}
          >
            <div className="zsb">
              <div className="zg">
                {fields.map((field: any) => (
                  <Field key={field[1]} f={field} s={settings} update={update} />
                ))}
              </div>

              {title === "Vault & profit rules" && (
                <div className="zcall">
                  <LockKeyhole size={15} />
                  Principal is separate from Vault profit; eligible profit is capped by current realized portfolio profit.
                </div>
              )}

              {title === "Withdrawal operations" && (
                <div className="zcall">
                  <ShieldCheck size={15} />
                  Withdrawal approval remains admin-controlled money movement.
                </div>
              )}

              {title === "Payment channels" && (
                <div className="zcall">Do not store payment API secrets in these fields.</div>
              )}
            </div>
          </div>
        </section>
      ))}

      <section className={"zss" + (cryptoOpen ? " is-open" : "")}>
        <button type="button" className="ztrigger" aria-expanded={cryptoOpen} onClick={() => setCryptoOpen((v) => !v)}>
          <span className="ztrigger-copy">
            <i><KeyRound size={17} /></i>
            <span>
              <h3>NOWPayments crypto rail</h3>
              <p>Secure cryptocurrency funding for investor deposits and top-ups.</p>
            </span>
          </span>
          <ChevronDown size={18} className="zchevron" />
        </button>

        <div className={"zpanel" + (cryptoOpen ? " is-open" : "")}>
          <div className="zsb">
            {cryptoError && (
              <div className="zcall warning">
                <AlertTriangle size={15} />
                <span>{cryptoError}</span>
                <button className="ghost" onClick={() => window.location.reload()}>
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            )}

            {!crypto && !cryptoError && (
              <div className="admin-empty">
                <ShieldCheck size={20} />
                <p>Loading NOWPayments configuration…</p>
              </div>
            )}

            {crypto && (
              <div className="zg">
                <label className="zst">
                  <span>
                    <b>Enable crypto deposits</b>
                    <small>Allow investors to choose cryptocurrency funding.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!crypto.enabled}
                    onChange={(e) => setCrypto({ ...crypto, enabled: e.target.checked })}
                  />
                </label>

                <div className="zcall">
                  <ShieldCheck size={15} />
                  <span>Provider credentials are encrypted server-side and never returned to the browser.</span>
                </div>

                <label className="zsf">
                  <span>NOWPAYMENTS_API_KEY</span>
                  <small>{crypto.api_key_configured ? "Configured · enter a new key only to rotate it." : "Not configured."}</small>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={cryptoKey}
                    onChange={(e) => setCryptoKey(e.target.value)}
                    placeholder={crypto.api_key_configured ? "••••••••••••" : "Paste API key"}
                  />
                </label>

                <label className="zsf">
                  <span>NOWPAYMENTS_IPN_SECRET</span>
                  <small>{crypto.ipn_secret_configured ? "Configured · enter a new secret only to rotate it." : "Not configured."}</small>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={cryptoSecret}
                    onChange={(e) => setCryptoSecret(e.target.value)}
                    placeholder={crypto.ipn_secret_configured ? "••••••••••••" : "Paste IPN secret"}
                  />
                </label>

                <div className="zsf">
                  <span>NOWPayments merchant assets</span>
                  <small>
                    ZYNTH only shows assets currently enabled for this merchant by NOWPayments. New assets remain off until you enable them.
                  </small>
                  <div className="crypto-catalog-toolbar">
                    <input
                      value={cryptoSearch}
                      onChange={(e) => setCryptoSearch(e.target.value)}
                      placeholder="Search asset or network"
                      aria-label="Search NOWPayments assets"
                    />
                    <span>{cryptoCurrencies.filter((x: any) => x.provider_available).length} available</span>
                  </div>
                  {cryptoCurrencies.length ? (
                    <div className="crypto-catalog">
                      {cryptoCurrencies
                        .filter((asset: any) => {
                          const q = cryptoSearch.trim().toLowerCase();
                          return !q || [asset.currency_code, asset.symbol, asset.name, asset.network].some((v: any) => String(v || "").toLowerCase().includes(q));
                        })
                        .map((asset: any) => (
                          <label key={asset.currency_code} className={"crypto-option"+(!asset.provider_available ? " unavailable" : "")}>
                            <span className="crypto-option-copy">
                              <b>{asset.name || asset.currency_code?.toUpperCase()}</b>
                              <small>{asset.network || "Network"} · {String(asset.currency_code).toUpperCase()}</small>
                            </span>
                            <span className="crypto-option-state">
                              {asset.provider_available ? "AVAILABLE" : "UNAVAILABLE"}
                              <input
                                type="checkbox"
                                disabled={!asset.provider_available}
                                checked={!!asset.zynth_enabled}
                                onChange={(e) =>
                                  setCryptoCurrencies((current: any[]) =>
                                    current.map((item) =>
                                      item.currency_code === asset.currency_code
                                        ? { ...item, zynth_enabled: e.target.checked }
                                        : item
                                    )
                                  )
                                }
                              />
                            </span>
                          </label>
                        ))}
                    </div>
                  ) : (
                    <div className="notice crypto-empty">
                      No NOWPayments merchant assets have been synchronized yet. Click <b>Sync NOWPayments assets</b> below.
                    </div>
                  )}
                </div>

                <div className="crypto-actions">
                  <button className="ghost" disabled={cryptoBusy} onClick={testCrypto}>
                    <RefreshCw size={13} /> {cryptoSyncing ? "Syncing…" : "Sync NOWPayments assets"}
                  </button>
                  <button className="primary" disabled={cryptoBusy} onClick={saveCrypto}>
                    {cryptoBusy ? "Saving…" : "Save crypto settings"}
                  </button>
                </div>

                {cryptoMessage && <div className="notice">{cryptoMessage}</div>}

                {crypto.last_test_status && (
                  <div className="zro">
                    <small>Last connection test</small>
                    <b>
                      {crypto.last_test_status === "success" ? "Verified" : "Needs attention"}
                      {crypto.last_test_message ? " · " + crypto.last_test_message : ""}
                    </b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={"zss" + (openGroups["Operational safeguards"] ? " is-open" : "")}>
        <button
          type="button"
          className="ztrigger"
          aria-expanded={!!openGroups["Operational safeguards"]}
          aria-controls="settings-group-safeguards"
          onClick={() => toggleGroup("Operational safeguards")}
        >
          <span className="ztrigger-copy">
            <i><ShieldCheck size={17} /></i>
            <span>
              <h3>Operational safeguards</h3>
              <p>Important rules for the manual-settlement model.</p>
            </span>
          </span>
          <ChevronDown size={18} className="zchevron" />
        </button>

        <div
          id="settings-group-safeguards"
          className={"zpanel" + (openGroups["Operational safeguards"] ? " is-open" : "")}
          aria-hidden={!openGroups["Operational safeguards"]}
        >
          <div className="zsb">
            <div className="zcall warning">
              <AlertTriangle size={15} />
              Keep the Investment engine OFF until KYC/AML, custody, legal and operational controls are ready. These switches control software behavior; they do not establish regulatory approval.
            </div>
            <div className="zg">
              <div className="zro"><small>Settlement model</small><b>Trader report → admin verification → NAV settlement</b></div>
              <div className="zro"><small>Investor accounting</small><b>NAV + units + profit lots</b></div>
            </div>
          </div>
        </div>
      </section>

      <div className="zfooter">
        <span>{dirty ? "Unsaved changes" : "All changes saved"}{message ? " · " + message : ""}</span>
        <button className="primary" disabled={busy || !dirty} onClick={saveSettings}>
          {busy ? <><Save size={15} /> Saving…</> : <><Save size={15} /> Save all settings</>}
        </button>
      </div>

      <style jsx global>{`
        .zsw{display:grid;gap:14px}
        .zintro{padding:2px 2px 1px}
        .zintro span{font-size:9px;font-weight:900;letter-spacing:.12em;color:#777168}
        .zintro p{margin:4px 0 0;color:#817b72;font-size:10px}
        .zstatus{display:flex;gap:8px;flex-wrap:wrap}
        .zstatus span{padding:7px 10px;border:1px solid #453721;border-radius:99px;background:#18140e;color:#d7c59e;font-size:9px;font-weight:800}
        .zss{background:#10100f;border:1px solid #2d2922;border-radius:16px;overflow:hidden}
        .ztrigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;background:transparent;border:0;color:inherit;text-align:left;cursor:pointer}
        .ztrigger-copy{display:flex;align-items:center;gap:12px;min-width:0}
        .ztrigger i{width:34px;height:34px;display:grid;place-items:center;background:#211a10;border:1px solid #493a25;border-radius:10px;color:#ead5a0;flex:none}
        .zss h3{margin:1px 0 4px;font-size:15px}
        .ztrigger p{margin:0;color:#817b72;font-size:11px}
        .zchevron{color:#817b72;transition:transform .2s ease}
        .zss.is-open .zchevron{transform:rotate(180deg)}
        .zpanel{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease}
        .zpanel>div{min-height:0;overflow:hidden}
        .zpanel.is-open{grid-template-rows:1fr}
        .zpanel.is-open>div{overflow:visible}
        .zsb{padding:0 20px 20px;display:grid;gap:15px}
        .zg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .zsf{display:grid;gap:7px}
        .zsf>span{font-size:11px;font-weight:800;color:#d8d0c3}
        .zsf small,.zst small{font-size:9px;color:#746f67}
        .zsf input{width:100%;background:#0b0b0a;color:#f4efe7;border:1px solid #332e26;border-radius:9px;padding:11px 12px}
        .zst{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 14px;min-height:65px;border:1px solid #302b23;background:#0d0d0c;border-radius:11px}
        .zst b,.zst small{display:block}
        .zst b{font-size:11px}
        .zst small{margin-top:3px;line-height:1.5}
        .zst input{appearance:none;width:42px;height:23px;border-radius:99px;background:#39342c;border:1px solid #4c453a;position:relative;flex:none}
        .zst input:before{content:"";position:absolute;width:17px;height:17px;left:2px;top:2px;border-radius:50%;background:#999}
        .zst input:checked{background:#7f6332}
        .zst input:checked:before{left:21px;background:#fff3d2}
        .zcall{display:flex;gap:8px;padding:11px 12px;border:1px solid #4c3f2b;background:#1a160f;color:#bba477;border-radius:10px;font-size:10px;line-height:1.5}
        .zcall.warning{border-color:#59452b}
        .zro{padding:13px;border:1px dashed #383229;border-radius:10px}
        .zro small{display:block;color:#777168;font-size:9px}
        .zro b{display:block;margin-top:5px;font-size:11px}
.crypto-catalog-toolbar{display:flex;gap:10px;align-items:center;margin-top:10px}
        .crypto-catalog-toolbar input{flex:1;background:#0b0b0a;color:#f4efe7;border:1px solid #332e26;border-radius:9px;padding:10px 12px}
        .crypto-catalog-toolbar span{font-size:10px;color:#8f877b;white-space:nowrap}
        .crypto-catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;max-height:430px;overflow:auto;padding-right:2px}
        .crypto-option{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--border,#2b2b2b);border-radius:10px;padding:11px 12px;font-size:12px;background:#0d0d0c}
        .crypto-option.unavailable{opacity:.55}
        .crypto-option-copy b{display:block;font-size:11px}
        .crypto-option-copy small{display:block;margin-top:3px;color:#777168;font-size:9px}
        .crypto-option-state{display:flex;align-items:center;gap:7px;font-size:8px;color:#9b8b6b;white-space:nowrap}
        .crypto-option-state input{width:16px;height:16px;accent-color:#9a7836}
        .crypto-empty{margin-top:10px}
        .crypto-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
        .zfooter{position:sticky;bottom:10px;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#11110ff2;border:1px solid #393125;border-radius:12px;color:#9c9487;font-size:10px}
        .zfooter .primary{margin:0}
        html[data-theme="light"] .zss{background:#fffdf8;border-color:#ddd6c8}
        html[data-theme="light"] .ztrigger p{color:#716b62}
        html[data-theme="light"] .ztrigger i{background:#f2e9d8;border-color:#dccaa5;color:#8e692d}
        html[data-theme="light"] .zintro p{color:#716b62}
        html[data-theme="light"] .zsf>span{color:#38342e}
        html[data-theme="light"] .zsf small,html[data-theme="light"] .zst small{color:#777168}
        html[data-theme="light"] .zsf input{background:#fffdf8;color:#1d1b17;border-color:#d5cec0}
        html[data-theme="light"] .zst{background:#faf8f3;border-color:#ddd6c8}
        html[data-theme="light"] .zst input{background:#d6d0c5;border-color:#c5beb1}
        html[data-theme="light"] .zcall{background:#faf4e7;border-color:#dfc98f;color:#80652f}
        html[data-theme="light"] .zfooter{background:#fffdf8f2;border-color:#d8d1c5;color:#706a61}
        @media(max-width:700px){.zg{grid-template-columns:1fr}.zsb{padding:16px}.crypto-catalog{grid-template-columns:1fr}.crypto-catalog-toolbar{align-items:stretch;flex-direction:column}.crypto-catalog-toolbar span{align-self:flex-start}}
      `}
      </style>
    </div>
  );
}
