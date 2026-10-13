// Scoped styles for the #Y2K multi-step booking wizard (ported from the
// approved booking-form reference; every selector lives under .ywz so nothing
// leaks into the rest of the page).
export const WIZARD_CSS = `
.ywz{--cream:#F4EEE4;--paper:#FBF8F2;--card:#fff;--ink:#2B2620;--body:#5A5145;--label:#6B5A3E;--stone:#8A8172;--line:#E0D5C2;--line-2:#EDE5D6;--forest:#2A3329;--forest-2:#24291F;--on-dark:#F4EEE4;--gold:#C8A96E;--gold-2:#B08D57;--sand:#E8CE9A;--sand-2:#F1DFB6;--bride:#B08D57;--groom:#7A3B2E;--err:#C0392B;
  --display:'Cormorant Garamond',var(--font-cormorant),Georgia,serif;--sans:'Inter',system-ui,sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace;--r:14px;
  font-family:var(--sans);color:var(--ink);font-size:16px;line-height:1.6;max-width:1180px;margin:44px auto 0}
.ywz *{box-sizing:border-box}
.ywz [hidden]{display:none!important}
.ywz .desk{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
@media (max-width:980px){.ywz .desk{grid-template-columns:1fr}}
.ywz .panel{background:var(--card);border:1px solid #E7DDCC;border-radius:24px;padding:clamp(18px,3.5vw,40px);box-shadow:0 30px 60px -40px rgba(58,46,28,.35);min-width:0}
.ywz .stepper{display:flex;gap:6px;margin:0 0 28px;padding:0;list-style:none;overflow-x:auto;scrollbar-width:none}
.ywz .stepper li{flex:1 0 auto}
.ywz .stepper button{width:100%;background:none;border:0;border-top:2px solid var(--line);padding:10px 4px 0;text-align:left;cursor:pointer;font:500 11px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--stone)}
.ywz .stepper button span{display:block;font-family:var(--display);font-size:20px;letter-spacing:0;text-transform:none;color:inherit}
.ywz .stepper li.done button{border-color:var(--gold-2);color:var(--label)}
.ywz .stepper li.cur button{border-color:var(--ink);color:var(--ink)}
.ywz .stepper button[disabled]{cursor:default}
.ywz .ph{font-family:var(--display);font-size:clamp(28px,4vw,36px);font-weight:400;margin:0 0 4px;line-height:1.1}
.ywz .psub{color:var(--body);margin:0 0 24px;font-size:15px}
.ywz .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px}
.ywz .grid>*{min-width:0}
.ywz .full{grid-column:1/-1}
@media (max-width:620px){.ywz .grid{grid-template-columns:1fr}}
.ywz label.f{display:grid;gap:7px;align-content:start}
.ywz label.f>span,.ywz .lab{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--label)}
.ywz label.f>span em,.ywz .lab em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:400;color:var(--stone)}
.ywz input[type=date],.ywz input[type=text],.ywz input[type=tel],.ywz input[type=email],.ywz input[type=time],.ywz select,.ywz textarea{width:100%;font:400 16px/1.3 var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-height:48px}
.ywz select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--label) 50%),linear-gradient(135deg,var(--label) 50%,transparent 50%);background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:36px}
.ywz textarea{min-height:80px;resize:vertical}
.ywz input:focus,.ywz select:focus,.ywz textarea:focus{outline:none;border-color:var(--gold-2);box-shadow:0 0 0 3px rgba(200,169,110,.2);background:#fff}
.ywz .bad input,.ywz .bad select,.ywz select.bad{border-color:var(--err)}
.ywz .msg{font-size:12px;color:var(--err)}
.ywz .hint{font-size:12px;color:var(--stone)}
.ywz .seg{display:flex;gap:8px;flex-wrap:wrap}
.ywz .seg label{cursor:pointer;position:relative}
.ywz .seg input{position:absolute;opacity:0;pointer-events:none}
.ywz .seg span{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:14px;background:var(--paper)}
.ywz .seg input:checked+span{border-color:var(--ink);background:var(--ink);color:var(--cream)}
.ywz .seg input:focus-visible+span{outline:2px solid var(--gold-2);outline-offset:2px}
.ywz .tick{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}
.ywz .tick input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--forest);flex:none}
.ywz .item{border:1px solid var(--line);border-radius:18px;padding:18px;background:var(--paper);display:grid;gap:14px;min-width:0}
.ywz .item+.item{margin-top:14px}
.ywz .item .top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.ywz .item .top h4{margin:0;font-family:var(--display);font-weight:500;font-size:22px}
.ywz .idchip{font-family:var(--mono);font-size:11px;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:3px 7px;color:var(--label)}
.ywz .x{background:none;border:0;color:var(--stone);cursor:pointer;font-size:13px;text-decoration:underline;padding:4px}
.ywz .x:hover{color:var(--err)}
.ywz .adders{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 18px}
.ywz .adders button{border:1px dashed var(--gold-2);background:var(--paper);color:var(--label);border-radius:10px;padding:10px 12px;font:500 13px var(--sans);cursor:pointer}
.ywz .adders button:hover{background:var(--sand-2)}
.ywz .swatches{display:flex;gap:6px;flex-wrap:wrap}
.ywz .swatches label{cursor:pointer;position:relative}
.ywz .swatches input{position:absolute;opacity:0;pointer-events:none}
.ywz .swatches i{display:block;width:30px;height:30px;border-radius:50%;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line)}
.ywz .swatches input:checked+i{box-shadow:0 0 0 2px var(--ink)}
.ywz .swatches input:focus-visible+i{outline:2px solid var(--gold-2);outline-offset:2px}
.ywz .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ywz .callout{border-radius:14px;padding:14px 16px;font-size:14px;background:#F8F1E4;border:1px solid #EADBC0;color:#5B4A2E}
.ywz .callout.ok{background:#EEF2E8;border-color:#D4DEC8;color:#3C5230}
.ywz .callout.warn{background:#FBEFDF;border-color:#EFD3A8;color:#6E4A12}
.ywz .callout.err{background:#F8E6E0;border-color:#E8C3B6;color:#7A2F1D}
.ywz .navrow{display:flex;justify-content:space-between;gap:12px;margin-top:30px;flex-wrap:wrap}
.ywz .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;cursor:pointer;font:600 13px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;border-radius:var(--r);padding:17px 26px;min-height:52px;background:var(--forest);color:var(--cream);transition:background .2s,transform .2s}
.ywz .btn:hover{background:#333F31;transform:translateY(-1px)}
.ywz .btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.ywz .btn.ghost:hover{background:var(--paper)}
.ywz .btn.sm{padding:11px 14px;font-size:11px;border-radius:10px;min-height:0}
.ywz .btn[disabled]{opacity:.55;cursor:wait;transform:none}
.ywz .tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}
.ywz table{border-collapse:collapse;width:100%;font-size:14px;min-width:480px}
.ywz th,.ywz td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line-2);vertical-align:top}
.ywz th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--label);font-weight:600;background:var(--paper)}
.ywz tr:last-child td{border-bottom:0}
.ywz td.num{font-variant-numeric:tabular-nums}
.ywz .retrow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line-2)}
.ywz .retrow:last-child{border-bottom:0}
@media (max-width:720px){.ywz .retrow{grid-template-columns:1fr 1fr}.ywz .retrow>div:first-child{grid-column:1/-1}}
.ywz .sum{position:sticky;top:88px;background:var(--forest);color:var(--on-dark);border-radius:24px;padding:24px;display:grid;gap:16px}
@media (max-width:980px){.ywz .sum{position:static;order:-1}.ywz .sum .more{display:none}}
.ywz .sum h4{margin:0;color:var(--on-dark);font-family:var(--display);font-weight:400;font-size:26px}
.ywz .sum .eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold)}
.ywz .sum dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:8px 12px;font-size:14px}
.ywz .sum dt{color:rgba(244,238,228,.7)}
.ywz .sum dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.ywz .sum hr{border:0;border-top:1px solid rgba(244,238,228,.12);margin:0}
.ywz .flags{display:grid;gap:8px}
.ywz .flag{font-size:13px;display:flex;gap:8px;align-items:flex-start;color:rgba(244,238,228,.85)}
.ywz .flag i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--gold)}
.ywz .flag.w i{background:#E3A857}
.ywz .pillside{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:600;color:#fff;background:var(--bride)}
.ywz .pillside.groom{background:var(--groom)}
.ywz .bid{font-family:var(--mono);font-size:24px;letter-spacing:.06em}
.ywz .conf-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:22px}
.ywz .eyebrow2{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold-2);font-weight:500}
`
