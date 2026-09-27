export default function AdminRoleStyles(){
 return <style jsx global>{`
.role-management{margin-top:24px;padding-top:22px;border-top:1px solid var(--border,#2a2f38)}
.role-management-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.role-management-head h3{margin:5px 0 4px;font-size:18px}.role-management-head p{margin:0;color:var(--muted,#8d96a6);font-size:13px}
.role-count{padding:6px 10px;border:1px solid var(--border,#2a2f38);border-radius:999px;font-size:12px;color:var(--muted,#8d96a6)}
.role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.role-option{display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px;border:1px solid var(--border,#2a2f38);background:var(--card,#11151b);color:inherit;border-radius:12px;cursor:pointer;transition:.18s}
.role-option:hover{border-color:rgba(120,140,170,.55);transform:translateY(-1px)}
.role-option.selected{border-color:rgba(72,150,255,.75);background:rgba(72,150,255,.08)}
.role-option-check{width:20px;height:20px;display:grid;place-items:center;flex:0 0 20px;border:1px solid var(--border,#2a2f38);border-radius:6px}
.role-option.selected .role-option-check{color:#6ea8ff;border-color:#6ea8ff}
.role-option b{display:block;font-size:14px}.role-option small{display:block;margin-top:4px;color:var(--muted,#8d96a6);line-height:1.4}
.role-selected,.role-chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.role-chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;border:1px solid var(--border,#2a2f38);background:rgba(255,255,255,.04)}
.role-chip.role-admin{border-color:rgba(200,120,255,.4)}.role-chip.role-trader{border-color:rgba(80,170,255,.4)}.role-chip.role-investor{border-color:rgba(80,190,140,.4)}.role-chip.role-zpa{border-color:rgba(245,180,70,.4)}
@media(max-width:720px){.role-grid{grid-template-columns:1fr}.role-management-head{flex-direction:column}}
`}</style>
}