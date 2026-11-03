// Hidden, isolated UI acceptance. Forecast fixtures are deliberate; optional live probes use public city coordinates only.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `weather-ui-${Date.now()}`,
);
process.env.CODEPLAN_BACKGROUND_TEST = "1";
dialog.showErrorBox = (_t, m) => console.error(m);
require("../desktop/main.cjs");
let window,
  connection,
  complete = false,
  stage = "startup";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (code) =>
  window.webContents.executeJavaScript(code).catch((error) => {
    throw new Error(`Renderer expression failed: ${code}`, { cause: error });
  });
async function wait(check, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await (typeof check === "string" ? run(check) : check())) return;
    await delay(100);
  }
  throw Error("Weather timeout: " + stage + " " + check);
}
async function request(endpoint, method = "GET", body) {
  const r = await fetch(connection.base + "/api" + endpoint, {
    method,
    headers: {
      "X-App-Token": connection.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error(endpoint + ": " + r.status + " " + (await r.text()));
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function click(text) {
  await run(
    `(()=>{const b=[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(text)}).at(-1);if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();})()`,
  );
}
async function screenshot(name) {
  await wait(
    '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
  );
  await delay(700);
  await window.webContents.capturePage({ stayHidden: true, stayAwake: true });
  await delay(200);
  fs.writeFileSync(
    path.join(root, ".local", name),
    (
      await window.webContents.capturePage({
        stayHidden: true,
        stayAwake: true,
      })
    ).toPNG(),
  );
}
async function fixtures() {
  await run(`(()=>{
 window.weatherCalls={location:0,forecast:0};window.weatherFail=false;window.locationFail=false;
 const original=window.fetch.bind(window);
 window.fetch=async(url,options)=>{
  const u=new URL(url,location.origin);
  if(u.pathname==='/api/weather/location'){window.weatherCalls.location++;if(window.locationFail)return new Response(JSON.stringify({code:'WEATHER_LOCATION_FAILED'}),{status:500});return new Response(JSON.stringify({name:'东京 · 日本',latitude:35.68,longitude:139.69}));}
  if(u.pathname==='/api/weather/cities')return new Response(JSON.stringify([{name:'北京 · 中国',latitude:39.9,longitude:116.4}]));
  if(u.pathname==='/api/weather/forecast'){
   window.weatherCalls.forecast++;if(window.weatherFail)throw Error('Fixture offline');
   const now=Math.floor(Date.now()/1000),tokyo=+u.searchParams.get('longitude')>130,offset=tokyo?9:8;
   const start=Math.floor((now+offset*3600)/86400)*86400-offset*3600;
   return new Response(JSON.stringify({fetchedAt:now,stale:false,data:{timezone:tokyo?'Asia/Tokyo':'Asia/Shanghai',current:{time:now,temperature_2m:tokyo?20:15,weather_code:2,is_day:1,relative_humidity_2m:52,apparent_temperature:14,wind_speed_10m:2},hourly:{time:Array.from({length:168},(_,i)=>start+i*3600),temperature_2m:Array.from({length:168},(_,i)=>15+i%4),weather_code:Array.from({length:168},(_,i)=>i%3===0?61:0),precipitation_probability:Array.from({length:168},(_,i)=>i%2?null:0),is_day:Array(168).fill(1)},daily:{time:Array.from({length:7},(_,i)=>start+i*86400),temperature_2m_max:[18,19,20,18,17,18,21],temperature_2m_min:[8,9,10,9,8,7,10],weather_code:[2,61,3,0,0,2,61],precipitation_probability_max:[0,70,null,0,0,10,50]}}}));
  }
  return original(url,options);
 };
})()`);
}
const watchdog = setTimeout(() => {
  console.error("Timeout", stage);
  app.quit();
}, 240000);
app.whenReady().then(async () => {
  try {
    await wait(async () => {
      window = BrowserWindow.getAllWindows()[0];
      return (
        window?.webContents.getURL().startsWith("http://127.0.0.1:") &&
        (await run('!!document.querySelector(".weather-home-link")'))
      );
    }, 120000);
    assert.equal(window.isVisible(), false);
    for (let i = 0; i < 7; i++) {
      const point = await run(
        `(()=>{const r=document.querySelectorAll('.sidebar nav a')[${i}].getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
      );
      window.webContents.sendInputEvent({ type: "mouseMove", ...point });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform!=='none'`,
      );
      window.webContents.sendInputEvent({ type: "mouseMove", x: 0, y: 0 });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform==='none'`,
      );
    }
    assert.equal(
      await run('!!document.querySelector("[data-testid=weather-card]")'),
      false,
    );
    await run('document.querySelector(".weather-home-link").click()');
    await wait('!!document.querySelector("[data-testid=weather-card]")');
    connection = await run("window.codeplan.connection()");
    await fixtures();
    await window.webContents.insertCSS(
      ".el-overlay,.el-dialog {animation:none!important;transition:none!important}",
    );
    await run(
      `(()=>{const previous=window.fetch;window.fetch=async(url,options)=>{const r=await previous(url,options);if(!String(url).includes('/weather/forecast'))return r;const payload=await r.json();const d=payload.data;Object.assign(d.current,{wind_direction_10m:180,wind_gusts_10m:4,pressure_msl:1015,cloud_cover:30});Object.assign(d.hourly,{uv_index:Array(168).fill(0),visibility:Array(168).fill(12000),dew_point_2m:Array(168).fill(8)});Object.assign(d.daily,{uv_index_max:Array(7).fill(4),precipitation_sum:Array(7).fill(0),sunrise:d.daily.time.map(t=>t+6*3600),sunset:d.daily.time.map(t=>t+18*3600)});return new Response(JSON.stringify(payload));}})()`,
    );
    await run(
      `(()=>{const previous=window.fetch;window.fetch=async(url,options)=>{const r=await previous(url,options);if(!String(url).includes('/weather/forecast'))return r;const payload=await r.json();Object.assign(payload.data.hourly,{wind_speed_10m:Array(168).fill(2),relative_humidity_2m:Array(168).fill(52),apparent_temperature:Array(168).fill(14),pressure_msl:Array(168).fill(1015)});return new Response(JSON.stringify(payload));}})()`,
    );
    stage = "add multiple cities";
    for (const city of ["Beijing", "Shanghai"]) {
      await click("＋ 添加城市");
      await wait('!!document.querySelector("[data-city=' + city + ']")');
      await run('document.querySelector("[data-city=' + city + ']").click()');
      await wait(
        '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
      );
    }
    await wait('document.querySelectorAll(".weather-city-card").length===2');
    assert.equal((await request("/weather/preferences")).cities.length, 2);
    await screenshot("weather-multi-home.png");
    assert.ok(
      await run(
        `(()=>{const p=document.querySelector('.weather-overview');return p.scrollWidth<=p.clientWidth})()`,
      ),
    );
    assert.ok(
      await run(
        `(()=>{const day=document.querySelector('.weather-daily-panel').getBoundingClientRect(),metrics=document.querySelector('.weather-detail-metrics').getBoundingClientRect();return day.right<=metrics.left && Math.abs(day.top-metrics.top)<2})()`,
      ),
    );
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector(".weather-overview")).overflowY',
      ),
      "auto",
    );
    assert.ok(
      await run(
        'document.querySelector(".weather-page").getBoundingClientRect().height<=innerHeight',
      ),
    );
    stage = "details and metrics";
    await run('document.querySelector(".weather-city-open").click()');
    await wait('document.querySelectorAll(".weather-hour").length===24');
    assert.ok(
      await run('document.querySelectorAll(".trend-point").length===24'),
    );
    assert.equal(
      await run('!!document.querySelector(".weather-detail-dialog")'),
      false,
    );
    await run(
      'document.querySelector(".weather-content").scrollIntoView({block:"start"})',
    );
    await screenshot("weather-dashboard-hourly.png");
    assert.equal(
      await run(
        'document.querySelectorAll(".weather-metric-grid article").length',
      ),
      9,
    );
    assert.ok(
      await run(
        'document.querySelector("[data-testid=weather-metrics]").textContent.includes("紫外线")',
      ),
    );
    await run(
      '[...document.querySelectorAll(".weather-city-open")].find(e=>e.textContent.includes("北京")).click()',
    );
    await wait(
      'document.querySelector(".weather-selected-title")?.textContent.includes("北京")',
    );
    await wait('document.querySelectorAll(".weather-day").length===7');
    assert.equal(
      await run('document.querySelectorAll(".weather-hour").length'),
      24,
    );
    assert.equal(
      await run(
        '!!document.querySelector(".weather-dashboard .el-radio-group")',
      ),
      false,
    );
    assert.ok(
      await run(
        `(()=>{const sidebar=document.querySelector('.weather-city-sidebar').getBoundingClientRect();const main=document.querySelector('.weather-overview').getBoundingClientRect();return sidebar.right<=main.left+1})()`,
      ),
    );
    assert.ok(
      await run(
        `[...document.querySelectorAll('.weather-range-fill')].every(e=>{const left=parseFloat(e.style.left),width=parseFloat(e.style.width);return Number.isFinite(left)&&width>0&&left>=0&&left+width<=100.01})`,
      ),
    );
    await run('document.querySelector(".weather-trend-disclosure").open=true');
    await screenshot("weather-apple-trend.png");
    await run('document.querySelector(".weather-trend-disclosure").open=false');
    await run(
      `[...document.querySelectorAll('.weather-city-open')].find(e=>e.textContent.includes('上海')).focus()`,
    );
    // Renderer-only focus emulation keeps the native test window hidden.
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await wait(
      'document.querySelector(".weather-selected-title").textContent.includes("上海")',
    );
    await window.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: false },
    );
    window.webContents.debugger.detach();
    stage = "home default city";
    await run('document.querySelector(".weather-day").click()');
    await wait(
      'document.querySelector(".weather-inspector")?.checkVisibility()',
    );
    assert.ok(
      await run(
        'document.querySelectorAll(".weather-inspector tbody tr").length>0',
      ),
    );
    await run(
      'document.querySelector(".weather-inspector .el-dialog__headerbtn").click()',
    );
    await wait(
      '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
    );
    await run('document.querySelector(".weather-metric-grid article").click()');
    await wait(
      'document.querySelector(".weather-inspector")?.checkVisibility()',
    );
    assert.ok(
      await run(
        'document.querySelector(".weather-inspector").textContent.includes("紫外线")',
      ),
    );
    await delay(600);
    fs.writeFileSync(
      path.join(root, ".local", "weather-inspector.png"),
      (
        await window.webContents.capturePage({
          stayHidden: true,
          stayAwake: true,
        })
      ).toPNG(),
    );
    await run(
      'document.querySelector(".weather-inspector .el-dialog__headerbtn").click()',
    );
    await wait(
      '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
    );
    await run(
      `(()=>{const e=document.querySelector('.weather-display-controls select');e.value='F';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await wait(
      async () => (await request("/weather/display")).temperature === "F",
    );
    await wait(
      'document.querySelector(".weather-temperature").textContent.includes("59")',
    );
    await run(
      `(()=>{const e=document.querySelector('.weather-display-controls select');e.value='C';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await wait(
      async () => (await request("/weather/display")).temperature === "C",
    );
    stage = "display preferences and city ordering";
    await wait('!document.querySelector(".weather-display-controls").disabled');
    await run(
      `(()=>{const e=document.querySelectorAll('.weather-display-controls select')[1];e.value='kmh';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await wait(async () => (await request("/weather/display")).wind === "kmh");
    await wait('!document.querySelector(".weather-display-controls").disabled');
    await run(
      'document.querySelector(".weather-display-controls input").click()',
    );
    await wait(async () => (await request("/weather/display")).clarity);
    assert.ok(
      await run(
        'document.querySelector(".weather-dashboard").classList.contains("weather-clear")',
      ),
    );
    await wait('!document.querySelector(".weather-display-controls").disabled');
    await click("城市列表");
    await wait(async () => (await request("/weather/display")).collapsed);
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector(".weather-city-sidebar")).display',
      ),
      "none",
    );
    await wait('!document.querySelector(".weather-display-controls").disabled');
    await click("城市列表");
    await wait(async () => !(await request("/weather/display")).collapsed);
    await run(
      `[...document.querySelectorAll('.weather-city-card')].find(e=>e.textContent.includes('上海')).querySelector('details').open=true`,
    );
    await run(
      `[...document.querySelectorAll('.weather-city-card')].find(e=>e.textContent.includes('上海')).querySelector('details button').click()`,
    );
    await wait(
      async () =>
        (await request("/weather/preferences")).cities[0].name === "上海",
    );
    await wait(
      'document.querySelector("[data-testid=weather-card]").getAttribute("aria-busy")==="false"',
    );
    assert.equal((await request("/weather/preferences")).city.name, "北京");
    assert.ok(
      await run(
        'document.querySelector(".weather-selected-title").textContent.includes("上海")',
      ),
    );
    await run(
      `[...document.querySelectorAll('.weather-city-card')].find(e=>e.textContent.includes('上海')).querySelector('details').open=true`,
    );
    await run(
      `[...document.querySelectorAll('.weather-city-card')].find(e=>e.textContent.includes('上海')).querySelector('.weather-set-default').click()`,
    );
    await wait(
      async () => (await request("/weather/preferences")).city.name === "上海",
    );
    await wait(
      '!document.querySelector("[data-testid=weather-card]").getAttribute("aria-busy") || document.querySelector("[data-testid=weather-card]").getAttribute("aria-busy")==="false"',
    );
    await run(
      `[...document.querySelectorAll('.weather-city-open')].find(e=>e.textContent.includes('北京')).click()`,
    );
    await run(`location.hash='#/today'`);
    await wait(
      'document.querySelector(".weather-summary-main strong")?.textContent==="上海"',
    );
    assert.ok(
      await run(
        'document.querySelector(".weather-summary-temperature").textContent.includes("15")',
      ),
    );
    await screenshot("weather-glass-home.png");
    stage = "task weather reference";
    const tasksBefore = await request("/tasks");
    await run('document.querySelector("[data-testid=add-task]").click()');
    await wait(
      'document.querySelector(".task-weather-hint button")?.checkVisibility()',
    );
    const fieldsBefore = await run(
      `JSON.stringify([...document.querySelectorAll('.el-dialog input,.el-dialog textarea')].map(e=>e.value))`,
    );
    await run('document.querySelector(".task-weather-hint button").click()');
    await wait(
      'document.querySelector(".task-weather-hint").textContent.includes("m/h") || document.querySelector(".task-weather-hint").textContent.includes("km/h") || document.querySelector(".task-weather-hint").textContent.includes("暂无预报")',
    );
    assert.ok(
      await run(
        'document.querySelector(".task-weather-hint").textContent.includes("上海")',
      ),
    );
    assert.equal(
      await run(
        `JSON.stringify([...document.querySelectorAll('.el-dialog input,.el-dialog textarea')].map(e=>e.value))`,
      ),
      fieldsBefore,
    );
    assert.deepEqual(await request("/tasks"), tasksBefore);
    await click("取消");
    await wait(
      '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
    );
    await run('document.querySelector(".weather-home-link").click()');
    await wait('document.querySelectorAll(".weather-hour").length===24');
    await wait(
      'document.querySelector(".weather-selected-title")?.textContent.includes("北京")',
    );
    await window.webContents.capturePage({ stayHidden: true, stayAwake: true });
    await delay(500);
    fs.writeFileSync(
      path.join(root, ".local", "weather-multi-details.png"),
      (
        await window.webContents.capturePage({
          stayHidden: true,
          stayAwake: true,
        })
      ).toPNG(),
    );

    await wait(
      '![...document.querySelectorAll(".el-overlay")].some(e=>e.checkVisibility())',
    );
    await run(
      'document.querySelector(".weather-dashboard").scrollIntoView({block:"start"})',
    );
    await screenshot("weather-apple-wide.png");
    await run(
      'document.querySelector(".weather-detail-layout").scrollIntoView({block:"start"})',
    );
    await screenshot("weather-apple-details.png");
    await run(
      'document.querySelector(".weather-dashboard").scrollIntoView({block:"start"})',
    );
    await run('document.documentElement.classList.add("dark")');
    window.setSize(850, 900);
    await delay(400);
    await screenshot("weather-apple-dark-narrow.png");
    assert.equal(
      await run(
        'getComputedStyle(document.querySelector(".weather-city-grid")).flexDirection',
      ),
      "row",
    );
    assert.equal(
      await run("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
    await run('document.documentElement.classList.remove("dark")');
    stage = "remove city";
    await run(
      `(()=>{const card=document.querySelector('.weather-city-card');card.querySelector('details').open=true;card.querySelector('button[aria-label^="移除"]').click()})()`,
    );
    await wait('!!document.querySelector(".el-message-box")');
    await click("确认");
    await wait('document.querySelectorAll(".weather-city-card").length===1');
    assert.equal((await request("/weather/preferences")).cities.length, 1);
    const saved = (await request("/weather/preferences")).city;
    const live = await request(
      "/weather/forecast?latitude=" +
        saved.latitude +
        "&longitude=" +
        saved.longitude,
    );
    assert.ok(live.data.daily.uv_index_max.length === 7);
    assert.ok(live.data.hourly.visibility.length >= 24);
    for (const field of [
      "wind_speed_10m",
      "apparent_temperature",
      "relative_humidity_2m",
      "pressure_msl",
    ])
      assert.ok(live.data.hourly[field].length >= 24);
    stage = "reload stored cities";
    await window.webContents.reload();
    await wait(
      'document.querySelectorAll(".weather-city-card").length===1',
      30000,
    );
    window.setSize(850, 900);
    await delay(400);
    assert.equal(
      await run("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
    assert.equal(window.isVisible(), false);
    assert.equal(
      await run(
        'document.querySelectorAll(".weather-display-controls select")[1].value',
      ),
      "kmh",
    );
    assert.equal(
      await run(
        'document.querySelector(".weather-display-controls input").checked',
      ),
      true,
    );
    complete = true;
    console.log(
      "PASS: cities/order/default, daily/metric details, persisted units/clarity/collapse, task weather read-only, browse restore, real hourly fields, hidden responsive UI.",
    );
  } catch (e) {
    console.error(stage, e);
    console.error(
      await run("document.body.innerText.slice(-1500)").catch(() => ""),
    );
  } finally {
    clearTimeout(watchdog);
    await run("window.codeplanExiting=true;void 0").catch(() => {});
    app.quit();
  }
});
app.on("will-quit", (e) => {
  e.preventDefault();
  app.exit(complete ? 0 : 1);
});
