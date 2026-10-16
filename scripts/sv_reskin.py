"""Spring Valley re-skin: build-time tenant flag VITE_TENANT=springvalley.
Idempotent. HVAC build is unchanged when the flag is unset."""
import re, pathlib, shutil, sys
R = pathlib.Path(__file__).resolve().parent.parent
def rd(p): return (R / p).read_text()
def wr(p, s): (R / p).write_text(s)
def sub1(s, old, new, label):
    if new in s: return s
    if old not in s: sys.exit(f"MISSING anchor: {label}")
    return s.replace(old, new, 1)

# 1. tenant flag
wr("src/tenant.ts", 'export const SV_MODE = (import.meta as any).env?.VITE_TENANT === "springvalley";\n'
   'export const SV_BRAND = "Spring Valley Roofing";\n')
IMP = 'import { SV_MODE } from "../tenant.ts";\n'

# 2. Simulator
p = "src/components/Simulator.tsx"; s = rd(p)
if IMP not in s: s = IMP + s
s = sub1(s, 'useState<IndustryType>("hvac")', 'useState<IndustryType>(SV_MODE ? "roofing_siding" : "hvac")', "sim initial industry")
s = sub1(s, '    const sanitizeRoofing = (cfg: any) => {\n      if (cfg && cfg.industry === "roofing_siding") {',
            '    const sanitizeRoofing = (cfg: any) => {\n      if (SV_MODE && cfg) cfg.industry = "roofing_siding";\n      if (cfg && cfg.industry === "roofing_siding") {', "sim sanitize")
a = s.find("{/* Quick 1-Click Trade Switcher */}")
if a != -1 and "{!SV_MODE && (\n            <div className=\"inline-flex items-center gap-1 p-1" not in s:
    b = s.find("Roofing Mode\n              </button>\n            </div>", a)
    if b == -1: sys.exit("MISSING trade switcher end")
    b = b + len("Roofing Mode\n              </button>\n            </div>")
    block = s[a:b].replace("{/* Quick 1-Click Trade Switcher */}\n", "")
    s = s[:a] + "{/* Quick 1-Click Trade Switcher (hidden in Spring Valley build) */}\n            {!SV_MODE && (\n" + block + "\n            )}" + s[b:]
s = s.replace("diagnoseHvacSound, transferCall, saveLead", "transferCall, saveLead, bookEstimate")
wr(p, s)

# 3. Settings
p = "src/components/Settings.tsx"; s = rd(p)
if IMP not in s: s = IMP + s
s = sub1(s, '  industry: "hvac",\n  office_name: "Blueprint AI Business",',
            '  industry: SV_MODE ? "roofing_siding" : "hvac",\n  office_name: SV_MODE ? "Spring Valley Roofing" : "Blueprint AI Business",', "settings defaults")
s = sub1(s, '    const sanitizeRoofing = (cfg: any) => {\n      if (cfg && cfg.industry === "roofing_siding") {',
            '    const sanitizeRoofing = (cfg: any) => {\n      if (SV_MODE && cfg) cfg.industry = "roofing_siding";\n      if (cfg && cfg.industry === "roofing_siding") {', "settings sanitize")
s = s.replace('"https://api.blueprint.ai/webhooks/hvac-emergency"', '""', 1)
s = s.replace('placeholder="https://api.blueprint.ai/webhooks/hvac-emergency"', 'placeholder="https://your-crm.example/webhooks/emergency"')
s = s.replace("'HVAC Office Settings'", "(SV_MODE ? 'Spring Valley Roofing Office Settings' : 'HVAC Office Settings')")
a = s.find('        <section id="section-trade"')
if a != -1 and "{!SV_MODE && (\n        <section id=\"section-trade\"" not in s:
    b = s.find("        </section>", a) + len("        </section>")
    s = s[:a] + "        {!SV_MODE && (\n" + s[a:b] + "\n        )}" + s[b:]
wr(p, s)

# 4. Dashboard: roofing-only demo leads in SV build
p = "src/components/Dashboard.tsx"; s = rd(p)
if IMP not in s: s = IMP + s
s = sub1(s, "useState<Lead[]>(SAMPLE_DEMO_LEADS)", "useState<Lead[]>(DEMO_LEADS)", "dash state")
s = s.replace("? leadsData : SAMPLE_DEMO_LEADS", "? leadsData : DEMO_LEADS").replace("setLeads(SAMPLE_DEMO_LEADS)", "setLeads(DEMO_LEADS)")
if "const DEMO_LEADS" not in s:
    i = s.find("export default function") if "export default function" in s else s.find("export function")
    s = s[:i] + 'const DEMO_LEADS: Lead[] = SV_MODE ? SAMPLE_DEMO_LEADS.filter((l: any) => String(l.id || "").startsWith("lead_roof")) : SAMPLE_DEMO_LEADS;\n\n' + s[i:]
s = s.replace("884 High Ridge Rd, Red Lion, PA", "884 High Ridge Rd, Gilbertsville, PA")
s = s.replace("Scheduled comprehensive 21-point roof & attic inspection for Tuesday morning.", "Free written estimate booked for Tuesday morning.")
s = s.replace("Spring Valley Roofing can certainly help. Our 21-point roof and attic inspection includes high-resolution drone imaging. Let's get that scheduled for you!",
              "Spring Valley Roofing can certainly help. Estimates are free and in writing. Let's get one scheduled for you.")
wr(p, s)

# 5. App header brand + logo
p = "src/App.tsx"; s = rd(p)
if 'from "./tenant.ts"' not in s:
    s = s.replace('import logoImg from "./assets/logo.jpg";',
                  'import blueprintLogo from "./assets/logo.jpg";\nimport svLogo from "./assets/sv-logo.png";\nimport { SV_MODE, SV_BRAND } from "./tenant.ts";\nconst logoImg = SV_MODE ? svLogo : blueprintLogo;', 1)
s = s.replace('alt="Blueprint AI Consulting Co. Logo"', 'alt={SV_MODE ? "Spring Valley Roofing logo" : "Blueprint AI Consulting Co. Logo"}')
s = s.replace('tracking-wide">Blueprint AI</span>', 'tracking-wide">{SV_MODE ? SV_BRAND : "Blueprint AI"}</span>')
s = s.replace('leading-none">Blueprint AI</span>', 'leading-none">{SV_MODE ? SV_BRAND : "Blueprint AI"}</span>')
wr(p, s)
crm_logo = pathlib.Path.home() / "Sites/spring-valley-command-os/assets/logo.png"
if not (R / "src/assets/sv-logo.png").exists(): shutil.copy(crm_logo, R / "src/assets/sv-logo.png")

# 6. Tab title
p = "src/main.tsx"; s = rd(p)
if "tenant.ts" not in s:
    s = 'import { SV_MODE } from "./tenant.ts";\nif (SV_MODE) document.title = "Spring Valley Roofing | AI Receptionist";\n' + s
wr(p, s)

# 7. Roofing preset: only facts that are on springvalleyroofing.com
p = "src/services/industryPresets.ts"; s = rd(p)
rep = [
 ("defaultOwnerTitle: 'Master Roofing Specialist & Owner'", "defaultOwnerTitle: 'Owner, CertainTeed Master Craftsman'"),
 ("['Architectural Shingle', 'Metal Roof', 'Flat EPDM Rubber', 'Tile', 'Slate', 'Vinyl Siding', 'Fiber Cement / Hardie', 'Seamless Gutters']",
  "['CertainTeed Landmark Architectural Shingle', 'CertainTeed Vinyl Siding', 'Insulated Siding', 'Cedar Impressions Shake', 'Attic / Ridge Ventilation']"),
 ("{ key: 'siding_estimate', label: 'Siding Replacement Quote', description: 'Vinyl, Hardie, or board & batten quote' }",
  "{ key: 'siding_estimate', label: 'Siding Replacement Quote', description: 'CertainTeed vinyl, insulated, or Cedar Impressions quote' }"),
 ("{ key: 'gutter_soffit_repair', label: 'Gutters & Fascia', description: 'Seamless gutters, downspouts, soffit' }",
  "{ key: 'gutter_soffit_repair', label: 'Attic Ventilation', description: 'Ridge and intake ventilation, ice dams' }"),
 ("dispatched to the on-call tarp crew.", "flagged urgent so the office calls back right away for emergency tarping."),
 ("serviceCall: '$99 Roof Leak Diagnostic & Inspection'", "serviceCall: 'Free written estimates; exact pricing is given in writing after an in-person inspection'"),
 ("afterHours: '$249 Emergency Roof Tarping Dispatch'", "afterHours: 'Emergency tarping and leak containment available; the office confirms timing and cost'"),
 ("maintenancePlanName: 'Spring Valley RoofGuard Protection Plan'", "maintenancePlanName: ''"),
 ("maintenancePlanPrice: '$299/year'", "maintenancePlanPrice: ''"),
 ("maintenancePlanBenefits: 'Annual 21-point roof inspection, gutter cleaning, resealing pipe boots/flashing, emergency priority tarping, and 10% discount on future repairs.'",
  "maintenancePlanBenefits: 'No maintenance plan is offered. Do not mention one.'"),
 ("answer: 'Yes! We offer 100% free, comprehensive in-person roof replacement and siding estimates with satellite 3D roof reports.'",
  "answer: 'Yes. Estimates are free and written, and we get back to you within one business day. We are family owned and operated out of Pottstown and serve Montgomery and Chester Counties. Office hours are Monday to Friday 8am to 7pm and Saturday 8am to 4pm. Phone (610) 948-5207.'"),
 ("answer: 'Absolutely. We inspect your roof for hail or wind damage, document all evidence for your adjuster, and walk you through the insurance claim process.'",
  "answer: 'Yes. We document the damage with photos, meet your adjuster on site, and handle supplements for hail and wind claims. We never promise a claim will be approved.'"),
 ("answer: 'We offer 24/7 emergency tarping services. During active storms, our emergency response crew arrives promptly to secure your roof and prevent interior water damage.'",
  "answer: 'We do emergency tarping and leak containment. I will flag your call as urgent so the office calls you right back to confirm timing.'"),
 ('"Hello, we are remodeling our home exterior and want an estimate for James Hardie fiber cement siding installation."',
  '"Hello, we are redoing our home exterior and want an estimate for new CertainTeed vinyl siding."'),
 ("title: 'Hardie Board Siding Quote'", "title: 'CertainTeed Siding Quote'"),
]
for o, n in rep:
    if n in s: continue
    if o not in s: print("WARN preset anchor not found:", o[:70]); continue
    s = s.replace(o, n, 1)
wr(p, s)
print("OK")
