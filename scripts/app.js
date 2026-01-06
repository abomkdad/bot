(function(){
  const $ = (sel) => document.querySelector(sel);
  const elStatus = $("#statusPill");
  const elResults = $("#results");
  const elQ = $("#q");
  const elFabMeta = $("#fabMeta");
  const elDrawer = $("#drawer");
  const elChat = $("#chat");
  const elChatInput = $("#chatInput");

  const CUSTOMER_SERVICE = "*99935";

  function escHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }
  function norm(s){
    return String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[’‘]/g, "'");
  }
  function tokenizeCodes(codeField){
    const raw = String(codeField ?? "").trim();
    if(!raw) return [];
    return raw.replace(/\|/g," ").replace(/-/g," ").split(/\s+/).map(x=>x.trim()).filter(Boolean);
  }

  const MEN_HINTS = [" homme"," men"," man"," pour homme"," male","invictus","sauvage","eros","wanted","dior homme"];
  const WOMEN_HINTS = [" women"," woman"," femme"," pour femme"," girl"," lady"," she"," her","olympea","j'adore","scandal","good girl"];
  function classifyProduct(p){
    const blob = " " + norm([p.code,p.ar,p.he,p.orig].join(" ")) + " ";
    const isNiche = Number(p.price || 0) >= 300;
    const men = MEN_HINTS.some(k => blob.includes(k));
    const women = WOMEN_HINTS.some(k => blob.includes(k));
    return { isNiche, men, women };
  }

  const Store = { products: [], branches: [], ready:false, _pByCode:new Map(), _pByKey:[], _bByKey:[] };

  async function loadJson(url){
    const r = await fetch(url, { cache: "no-store" });
    if(!r.ok) throw new Error(`HTTP ${r.status} while fetching ${url}`);
    return r.json();
  }

  function buildIndexes(){
    Store._pByCode.clear();
    Store._pByKey = [];
    Store._bByKey = [];

    for(const p of Store.products){
      for(const c of tokenizeCodes(p.code)){
        const key = norm(c);
        if(!key) continue;
        if(!Store._pByCode.has(key)) Store._pByCode.set(key, []);
        Store._pByCode.get(key).push(p);
      }
      Store._pByKey.push({ keyBlob: norm([p.code,p.ar,p.he,p.orig].join(" | ")), p });
    }

    for(const b of Store.branches){
      Store._bByKey.push({ keyBlob: norm([b.nameAr,b.nameHe].join(" | ")), b });
    }
  }

  function setStatus(text){
    elStatus.querySelector("span:last-child").textContent = text;
    elFabMeta.textContent = text;
  }

  function renderProduct(p){
    const title = (p.ar || p.he || p.orig || p.code || "منتج").trim();
    const sub = [
      p.code ? `الكود: ${p.code}` : "",
      p.orig ? `الأصلي: ${p.orig}` : "",
      (p.price ? `السعر: ${p.price} ${p.currency || ""}` : "").trim(),
    ].filter(Boolean).join(" • ");
    return `
      <div class="row">
        <img class="thumb" src="${escHtml(p.img||"")}" alt="${escHtml(title)}" loading="lazy" onerror="this.style.display='none'"/>
        <div class="meta">
          <p class="title">${escHtml(title)}</p>
          <p class="sub">${escHtml(sub)}</p>
        </div>
        <div class="actions">
          <a class="aBtn primary" href="${escHtml(p.url||"#")}" target="_blank" rel="noopener">شراء</a>
          <button class="aBtn" data-ask="${escHtml(p.code)}">اسألني عنه</button>
        </div>
      </div>
    `;
  }

  function renderBranch(b){
    const title = `${b.nameAr || ""} / ${b.nameHe || ""}`.trim();
    const hours = (b.hoursAr || b.hoursHe || "").replace(/<br\s*\/?>(\s)*/g, "\n");
    return `
      <div class="row">
        <div class="meta">
          <p class="title">${escHtml(title)}</p>
          <p class="sub">${escHtml(hours)}</p>
          <p class="sub">${b.phone ? `هاتف: ${escHtml(b.phone)}` : ""}</p>
        </div>
        <div class="actions">
          ${b.directLink ? `<a class="aBtn primary" href="${escHtml(b.directLink)}" target="_blank" rel="noopener">Waze</a>` : ""}
          ${b.phone ? `<a class="aBtn" href="tel:${escHtml(b.phone)}">اتصال</a>` : ""}
        </div>
      </div>
    `;
  }

  function setResults(html){
    elResults.innerHTML = html || `<div class="mini">لا توجد نتائج.</div>`;
    elResults.querySelectorAll("[data-ask]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        openDrawer();
        addUserMsg(`احكيلي عن ${btn.getAttribute("data-ask")}`);
        respondTo(btn.getAttribute("data-ask"));
      });
    });
  }

  function searchBranches(q){
    const nq = norm(q);
    if(!nq) return [];
    return Store._bByKey.filter(x => x.keyBlob.includes(nq)).map(x => x.b);
  }

  function searchProducts(q){
    const nq = norm(q);
    if(!nq) return [];
    const byCode = Store._pByCode.get(nq) || [];
    const fuzzy = Store._pByKey.filter(x => x.keyBlob.includes(nq)).slice(0, 50).map(x => x.p);
    const seen = new Set();
    const out = [];
    for(const p of [...byCode, ...fuzzy]){
      const k = p.url || (p.code + "|" + p.orig);
      if(seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if(out.length >= 12) break;
    }
    return out;
  }

  function suggestByIntent(intent){
    const i = norm(intent);
    if(i.includes("نيش") || i.includes("niche")) return Store.products.filter(p => classifyProduct(p).isNiche).slice(0, 12);
    if(i.includes("رجالي") || i.includes("men") || i.includes("גברי")) return Store.products.filter(p => classifyProduct(p).men && !classifyProduct(p).women).slice(0, 12);
    if(i.includes("نسائي") || i.includes("women") || i.includes("נשי")) return Store.products.filter(p => classifyProduct(p).women && !classifyProduct(p).men).slice(0, 12);
    return Store.products.slice(0, 12);
  }

  function handleQuery(q){
    const nq = norm(q);
    if(!Store.ready){
      setResults(`<div class="mini">البيانات لسه عم تتحمّل…</div>`);
      return;
    }
    if(nq === "فروع" || nq.includes("فروع") || nq.includes("סניפים") || nq.includes("סניף")){
      setResults(Store.branches.slice(0, 50).map(renderBranch).join(""));
      return;
    }
    if(["رجالي","نسائي","نيش","גברי","נשי","נישה"].some(k => nq.includes(norm(k)))){
      setResults(suggestByIntent(nq).map(renderProduct).join(""));
      return;
    }
    const bHits = searchBranches(nq);
    const pHits = searchProducts(nq);
    if(bHits.length && !pHits.length){ setResults(bHits.slice(0,12).map(renderBranch).join("")); return; }
    if(pHits.length){ setResults(pHits.map(renderProduct).join("")); return; }

    const digit = nq.match(/\b\d+\b/);
    if(digit){
      const p2 = searchProducts(digit[0]);
      if(p2.length){ setResults(p2.map(renderProduct).join("")); return; }
    }
    setResults(`<div class="mini">ما لقيت نتيجة لـ <b>${escHtml(q)}</b>. جرب كود (مثال: W160) أو اسم بالعربي/عبري، أو اكتب "فروع".</div>`);
  }

  function addMsg(text, who){
    const d = document.createElement("div");
    d.className = "msg " + (who === "me" ? "me" : "ai");
    d.textContent = text;
    elChat.appendChild(d);
    elChat.scrollTop = elChat.scrollHeight;
  }
  const addUserMsg = (t)=>addMsg(t,"me");
  const addAiMsg = (t)=>addMsg(t,"ai");

  function openDrawer(){
    elDrawer.classList.add("on");
    elDrawer.setAttribute("aria-hidden", "false");
    setTimeout(()=> elChat.scrollTop = elChat.scrollHeight, 0);
  }
  function closeDrawer(){
    elDrawer.classList.remove("on");
    elDrawer.setAttribute("aria-hidden", "true");
  }

  function formatProductLine(p){
    const name = p.ar || p.he || p.orig || p.code;
    return `• ${name} — ${p.price ? (p.price + " " + (p.currency||"ILS")) : ""}\n  شراء: ${p.url}`.trim();
  }
  function formatBranchLine(b){
    const title = `${b.nameAr||""} / ${b.nameHe||""}`.trim();
    const hours = (b.hoursAr || b.hoursHe || "").replace(/<br\s*\/?>(\s)*/g, "\n");
    const tel = b.phone ? `هاتف: ${b.phone}` : "";
    const waze = b.directLink ? `Waze: ${b.directLink}` : "";
    return `• ${title}\n${hours}\n${tel}\n${waze}`.trim();
  }

  function respondTo(text){
    const t = norm(text);
    if(t.includes("خدمة") || t.includes("support") || t.includes("תמיכה") || t.includes("اتصال")){
      addAiMsg(`خدمة العملاء السريعة: ${CUSTOMER_SERVICE}`);
      return;
    }
    if(t === "فروع" || t.includes("فروع") || t.includes("סניפים") || t.includes("סניף") || t.includes("فرع")){
      const top = Store.branches.slice(0, 6).map(formatBranchLine).join("\n\n");
      addAiMsg(`تفضل فروع MAD (أول 6):\n\n${top}\n\nاكتب اسم المدينة إذا بدك فرع معيّن.`);
      return;
    }
    if(t.includes("رجالي") || t.includes("גברי") || t.includes("men")){
      const picks = suggestByIntent("رجالي").slice(0, 6).map(formatProductLine).join("\n");
      addAiMsg(`اقتراحات رجالي:\n${picks}`);
      return;
    }
    if(t.includes("نسائي") || t.includes("נשי") || t.includes("women")){
      const picks = suggestByIntent("نسائي").slice(0, 6).map(formatProductLine).join("\n");
      addAiMsg(`اقتراحات نسائي:\n${picks}`);
      return;
    }
    if(t.includes("نيش") || t.includes("נישה") || t.includes("niche")){
      const picks = suggestByIntent("نيش").slice(0, 6).map(formatProductLine).join("\n");
      addAiMsg(`اقتراحات نيش (300+):\n${picks}`);
      return;
    }
    const bHits = searchBranches(text);
    if(bHits.length){
      addAiMsg(`لقيت ${bHits.length} فرع/فروع:\n\n${bHits.slice(0, 4).map(formatBranchLine).join("\n\n")}`);
      return;
    }
    const pHits = searchProducts(text);
    if(pHits.length){
      addAiMsg(`لقيت المنتج الأقرب:\n\n${formatProductLine(pHits[0])}`);
      return;
    }
    addAiMsg(`ما لقيت "${text}". جرب كود (مثال: W160) أو اسم بالعربي/عبري، أو اكتب "فروع".`);
  }

  function wire(){
    $("#btnSearch").addEventListener("click", ()=> handleQuery(elQ.value));
    elQ.addEventListener("keydown", (e)=>{ if(e.key==="Enter") handleQuery(elQ.value); });
    $("#btnClear").addEventListener("click", ()=>{ elQ.value=""; setResults(""); elQ.focus(); });
    document.querySelectorAll(".chip").forEach(ch=>{
      ch.addEventListener("click", ()=>{
        const q = ch.getAttribute("data-q") || "";
        elQ.value = q;
        handleQuery(q);
      });
    });

    $("#openAI").addEventListener("click", ()=>{
      openDrawer();
      if(!elChat.dataset.inited){
        elChat.dataset.inited = "1";
        addAiMsg("أهلاً! أنا مساعد MAD PARFUMEUR.\nاكتب اسم العطر/الكود أو قلّي: رجالي/نسائي/نيش، أو \"فروع\".\nللخدمة السريعة: " + CUSTOMER_SERVICE);
      }
      elChatInput.focus();
    });
    $("#closeAI").addEventListener("click", closeDrawer);
    elDrawer.addEventListener("click", (e)=>{ if(e.target === elDrawer) closeDrawer(); });

    $("#sendAI").addEventListener("click", ()=>{
      const v = elChatInput.value.trim();
      if(!v) return;
      elChatInput.value = "";
      addUserMsg(v);
      respondTo(v);
    });
    elChatInput.addEventListener("keydown", (e)=>{
      if(e.key === "Enter"){ e.preventDefault(); $("#sendAI").click(); }
    });
  }

  async function boot(){
    try{
      setStatus("Loading data…");
      const [productsRaw, branchesRaw] = await Promise.all([
        loadJson("./data/products.json"),
        loadJson("./data/branches.json"),
      ]);

      Store.products = (productsRaw || []).map(x => ({
        code: String(x["اسم المنتج"] ?? "").trim(),
        orig: String(x["اسم العطر الأصلي"] ?? "").trim(),
        he:   String(x["اسم العطر بالعبرية"] ?? "").trim(),
        ar:   String(x["اسم العطر بالعربية"] ?? "").trim(),
        url:  String(x["رابط المنتج"] ?? "").trim(),
        price: x["السعر"],
        currency: String(x["العملة"] ?? "ILS").trim(),
        img:  String(x["رابط الصورة"] ?? "").trim(),
      }));

      Store.branches = (branchesRaw || []).map(x => ({
        id: x.id,
        nameAr: String(x.nameAr ?? "").trim(),
        nameHe: String(x.nameHe ?? "").trim(),
        phone: String(x.phone ?? "").trim(),
        directLink: String(x.directLink ?? "").trim(),
        hoursAr: String(x.hoursAr ?? "").trim(),
        hoursHe: String(x.hoursHe ?? "").trim(),
      }));

      buildIndexes();
      Store.ready = true;
      setStatus(`Ready • Products: ${Store.products.length} • Branches: ${Store.branches.length}`);
      setResults(`<div class="mini">جاهز ✅ اكتب اسم عطر/كود/فرع… أو اضغط الاقتراحات.</div>`);
      wire();
    }catch(err){
      console.error(err);
      setStatus("Data error");
      setResults(`<div class="mini">صار خطأ بتحميل الداتا: <b>${escHtml(err.message)}</b><br><br>
      تأكد أن الملفات موجودة في:<br><code>/data/products.json</code> و <code>/data/branches.json</code></div>`);
      wire();
    }
  }

  boot();
})();