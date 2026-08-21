const TOKEN = "C:/Users/Obrey/AppData/Local/Temp/claude/c--AerocooleProject-aerocore-system/570d259f-f43c-4607-89ad-e2072adac034/scratchpad/t.txt"
import puppeteer from "puppeteer-core"
import { readFileSync } from "fs"
const token = readFileSync(TOKEN, "utf8").trim()
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new", args: ["--no-sandbox"],
})
const page = await browser.newPage()
page.on("pageerror", (e) => console.log("   [pageerror]", e.message))
await browser.setCookie({ name: "session", value: token, domain: "localhost", path: "/" })
await page.setViewport({ width: 1200, height: 950 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto("http://localhost:3000/admin/projects", { waitUntil: "networkidle0" })

// --- record one COGS expense against 260001 ------------------------------
await page.evaluate(() =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Record expenses").click())
await wait(1400)
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  const row = popup.querySelector('input[type="date"]').closest("tr")
  ;[...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "COGS").click()
})
await wait(500)
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
  const put = (label, v) => {
    const el = popup.querySelector(`input[aria-label="${label}"]`)
    setter.call(el, v)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
  put("Date for row 1", "2026-08-14")
  put("What row 1 was for", "Condenser fan motor")
  put("Amount for row 1", "7250")
})
await wait(400)
// client then S.O.
const openSelect = (idx) => page.evaluate((i) => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  const row = popup.querySelector('input[type="date"]').closest("tr")
  row.querySelectorAll('[data-slot="search-select-trigger"]')[i].click()
}, idx)
const pickOption = (match) => page.evaluate((m) => {
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(m))
  if (!option) throw new Error("no option matching " + m + " — saw: " +
    [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()).slice(0, 4).join(" | "))
  option.click()
}, match)

await openSelect(0)
await wait(700)
await pickOption("BRIGHTHALL")
await wait(1500)
await openSelect(1)
await wait(800)
await pickOption("260001")
await wait(900)
console.log("   [before save]", await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  const save = [...popup.querySelectorAll('[data-slot="dialog-footer"] button')].find((b) => b.textContent.includes("Save"))
  const selects = [...popup.querySelectorAll('[data-slot="search-select-trigger"]')].map((t) => t.textContent.trim())
  const row = popup.querySelector('input[type="date"]').closest("tr")
  const rowInputs = [...row.querySelectorAll("input")].map((i) => ({ type: i.type, value: i.value }))
  const status = [...popup.querySelectorAll("span")].map((x) => x.textContent.trim()).find((t) => t.includes("ready"))
  return { saveLabel: save?.textContent.trim(), disabled: save?.disabled, selects, status, rowInputs }
}))
await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="dialog-footer"] button')].find((b) => b.textContent.includes("Save")).click())
await wait(3000)

// --- read the project's history -----------------------------------------
async function history() {
  console.log("   [state] dialog open:", await page.evaluate(() => !!document.querySelector('[data-slot="dialog-content"]')),
    "| triggers:", await page.evaluate(() => [...document.querySelectorAll('[data-slot="tabs-trigger"]')].map((t) => t.textContent.trim())))
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="tabs-trigger"]')].find((t) => t.textContent.includes("Projects")).click())
  await wait(1200)
  await page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("260001")).click())
  await wait(1500)
  await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="dialog-content"]')
    ;[...popup.querySelectorAll('[data-slot="tabs-trigger"]')].find((t) => t.textContent.includes("History")).click()
  })
  await wait(1500)
  const rows = await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="dialog-content"]')
    return [...popup.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => /recorded|removed|changed/.test(t)).slice(0, 4)
  })
  return rows
}
console.log("history after recording:")
for (const r of await history()) console.log("   ", r)

// --- remove it from the Expenses tab -------------------------------------
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  ;[...popup.querySelectorAll('[data-slot="tabs-trigger"]')].find((t) => t.textContent.includes("Expenses")).click()
})
await wait(1600)
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  ;[...popup.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Remove ")).click()
})
await wait(600)
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  ;[...popup.querySelectorAll("button")].find((b) => b.textContent.trim() === "Yes, remove").click()
})
await wait(2500)
await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="dialog-content"]')
  ;[...popup.querySelectorAll("button")].find((b) => b.textContent.trim() === "Close").click()
})
await wait(2000)
console.log("\nhistory after removing:")
for (const r of await history()) console.log("   ", r)
await browser.close()
