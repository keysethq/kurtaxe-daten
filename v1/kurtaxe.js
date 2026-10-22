// Kurtaxe für einen Aufenthalt, nach den Regeln einer Gemeinde aus den Gastgeber-Ortsdaten von Keyset.
//
// Eine Datei für drei Leser: die Ortsseiten rechnen damit im Browser, der Generator druckt damit das Beispiel, das ohne
// JavaScript stehen bleibt, und Entwickler laden sie unter /kurtaxe/v1/kurtaxe.js. Sie rechnet in ganzen Cent, schickt
// nichts ins Netz und speichert nichts.
//
// rules (aus /kurtaxe/v1/<ort>.json, Feld "calculation"):
//   countsDepartureDay  An- und Abreisetag zählen beide (sieben Nächte sind acht Tage)
//   maxDays             höchstens so viele Nächte oder Tage zählen, oder null
//   childLimits         aufsteigende Altersgrenzen (exklusiv) der Kinderstufen
//   periods             [{ label, ranges: [[von, bis], …] als MM-DD einschließlich, adult, children: [Cent je Stufe] }];
//                       von oder bis kann auch an Ostern hängen: "easter-8" ist acht Tage vor Ostersonntag
//   family              nur wo die Satzung es sagt: { free: 'children' | 'persons', from: n } – das n-te und jedes
//                       weitere Kind (das zahlen müsste) bzw. die n-te und jede weitere Person zahlt nichts, die
//                       jüngsten zuerst; der Rechner nimmt an, dass alle zu einer Familie gehören
//   stayCap             nur wo die Satzung es sagt: höchstens so viele Cent je Person für einen Aufenthalt
//   oneNight            nur wo die Satzung es sagt: der Satz für Erwachsene, wenn der Aufenthalt eine Nacht dauert
//   companion           nur wo die Satzung es sagt: der Satz je Tag für jeden weiteren Erwachsenen neben einem mit dem
//                       vollen Satz (mitreisende Ehe- oder Lebenspartner)
//   change              nur wo schon neue Sätze beschlossen sind: { from: 'YYYY-MM-DD', label }; jede Periode trägt dann
//                       next: { adult, children }, die Sätze für Tage ab from
//   zones               nur wo die Sätze nach Kurbezirk verschieden sind: [{ label, periods }], periods wie oben;
//                       das Feld periods ist dann das des ersten Bezirks
//   reduced             nur wo die Satzung ermäßigte Sätze nennt: [{ label, onApplication }], wer ermäßigt zahlt; jede
//                       Periode trägt dann reduced: [Cent je Gruppe], den Satz, den diese Erwachsenen statt adult zahlen
//                       (bei change auch in next)
// stay: { arrival: 'YYYY-MM-DD', nights, adults, children: [Anzahl je Kinderstufe], zone: Index des Bezirks (0),
//         reduced: [Anzahl je ermäßigter Gruppe], fehlt es, zahlt niemand ermäßigt }

/** @param {number} cents @returns {string} 3,40 € */
export function formatEuro(cents) {
  const sign = cents < 0 ? '−' : ''
  const amount = Math.abs(cents)
  const whole = Math.floor(amount / 100).toLocaleString('de-DE')
  return `${sign}${whole},${String(amount % 100).padStart(2, '0')} €`
}

/** @param {number} year @returns {number} Ostersonntag als UTC-Zeitstempel (gregorianisch, nach Meeus) */
function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day)
}

/** @param {string} bound MM-DD oder easter±n @param {number} year @returns {string} MM-DD in diesem Jahr */
export function boundIn(bound, year) {
  const easter = /^easter([+-]\d+)?$/.exec(bound)
  if (!easter) return bound
  return new Date(easterSunday(year) + Number(easter[1] ?? 0) * 86_400_000).toISOString().slice(5, 10)
}

/** @param {string} monthDay @param {[string, string]} range @param {number} year */
function inRange(monthDay, [start, end], year) {
  const from = boundIn(start, year)
  const to = boundIn(end, year)
  return from <= to ? from <= monthDay && monthDay <= to : from <= monthDay || monthDay <= to
}

/**
 * @param {any} rules
 * @param {{ arrival: string, nights: number, adults: number, children: number[], zone?: number, reduced?: number[] }} stay
 * @returns {{ total: number, days: number, counted: number, lines: { label: string, days: number, perDay: number, amount: number }[] }}
 */
export function kurtaxe(rules, stay) {
  const days = stay.nights + (rules.countsDepartureDay ? 1 : 0)
  const counted = rules.maxDays === null ? days : Math.min(days, rules.maxDays)
  const start = Date.parse(`${stay.arrival}T00:00:00Z`)
  const periods = rules.zones?.[stay.zone ?? 0]?.periods ?? rules.periods
  // Everyone in the stay, oldest first: adults, then adults at a reduced rate, then the child bands from the oldest
  // down. A family rule frees the youngest, so whoever comes later in this list is freed first.
  /** @type {(number | string | null)[]} null for an adult, `r<index>` for an adult at a reduced rate, the band for a child */
  const people = [
    ...Array.from({ length: stay.adults }, () => null),
    ...(rules.reduced ?? []).flatMap((/** @type {any} */ _, /** @type {number} */ group) =>
      Array.from({ length: stay.reduced?.[group] ?? 0 }, () => `r${group}`),
    ),
    ...stay.children.flatMap((count, band) => Array.from({ length: count ?? 0 }, () => band)).reverse(),
  ]
  const owed = people.map(() => 0)
  /** @type {Map<string, { label: string, days: number | null, perDay: number, amount: number }>} */
  const lines = new Map()
  let total = 0
  for (let day = 0; day < counted; day += 1) {
    const date = new Date(start + day * 86_400_000)
    const monthDay = date.toISOString().slice(5, 10)
    const year = date.getUTCFullYear()
    const period = periods.find((/** @type {any} */ p) =>
      p.ranges.some((/** @type {any} */ r) => inRange(monthDay, r, year)),
    )
    if (!period) continue
    const changed = rules.change != null && date.toISOString().slice(0, 10) >= rules.change.from
    const { adult, children, reduced = [] } = changed ? period.next : period
    const adultRate = rules.oneNight != null && stay.nights === 1 ? rules.oneNight : adult
    // Where the statute charges the adults travelling with one who pays in full less, every adult after the first
    // pays that rate (never more than the adult rate). An adult at a reduced rate pays it, never more than an adult.
    const rates = people.map((band, index) =>
      band === null
        ? index > 0 && rules.companion != null
          ? Math.min(rules.companion, adultRate)
          : adultRate
        : typeof band === 'string'
          ? Math.min(reduced[Number(band.slice(1))] ?? adultRate, adultRate)
          : (children[band] ?? 0),
    )
    if (rules.family) {
      // Only those who would pay count towards the family's n-th child or person.
      let counting = 0
      for (const [index, band] of people.entries()) {
        if (rules.family.free === 'children' && (band === null || typeof band === 'string')) continue
        if (rules.family.free === 'children' && rates[index] === 0) continue
        counting += 1
        if (counting >= rules.family.from) rates[index] = 0
      }
    }
    let perDay = 0
    for (const [index, rate] of rates.entries()) {
      owed[index] += rate
      perDay += rate
    }
    const label = changed ? `${period.label}, ${rules.change.label}` : period.label
    const line = lines.get(label) ?? { label, days: 0, perDay, amount: 0 }
    line.days = (line.days ?? 0) + 1
    line.amount += perDay
    lines.set(label, line)
    total += perDay
  }
  // A cap per person and stay: what anyone owes above it is taken off, shown as its own line.
  if (rules.stayCap != null) {
    const above = owed.reduce((sum, amount) => sum + Math.max(0, amount - rules.stayCap), 0)
    if (above > 0) {
      lines.set('\u0000cap', { label: 'Abzug Höchstbetrag je Person', days: null, perDay: 0, amount: -above })
      total -= above
    }
  }
  return { total, days, counted, lines: [...lines.values()] }
}

/**
 * Der Betrag je Gast und Nacht einer nach dem Preis gestaffelten Steuer: die Stufe, in die der Preis je Gast und Nacht
 * fällt (über over bis einschließlich upTo); über der letzten Stufe, wo die Satzung es sagt, je angefangene everyCents
 * weitere beyond.cents. Unter der ersten Stufe nichts.
 *
 * @param {any} rules @param {number} priceCents
 */
function tierCents(rules, priceCents) {
  const tier = rules.tiers.find(
    (/** @type {any} */ t) => priceCents > t.over && (t.upTo == null || priceCents <= t.upTo),
  )
  if (tier) return tier.cents
  const last = rules.tiers.at(-1)
  if (rules.beyond && last?.upTo != null && priceCents > last.upTo)
    return last.cents + Math.ceil((priceCents - last.upTo) / rules.beyond.everyCents) * rules.beyond.cents
  return 0
}

/**
 * Übernachtungsteuer einer Stadt für einen Aufenthalt (rules.kind === 'town'): ein Anteil am Übernachtungspreis
 * (percent) oder ein fester Betrag je Nacht (cents, je Gast wenn perPerson). Höchstens maxDays Nächte; eine Grenze je
 * Kalenderjahr begrenzt auch den einzelnen Aufenthalt. maxMonths: nach so vielen Monaten am Stück ist jede weitere
 * Nacht frei; ohne Datum weiß der Rechner nicht, wann das ist, und meldet nur, dass der Aufenthalt sie erreichen kann
 * (beyond). change: { from, label } mit next ({ percent } oder { cents }) für Nächte ab from (stay.later).
 *
 * @param {any} rules @param {{ nights: number, priceCents: number, guests: number, later?: boolean }} stay
 * @returns {{ total: number, counted: number, beyond: boolean }}
 */
export function overnightTax(rules, stay) {
  const counted = rules.maxDays != null ? Math.min(stay.nights, rules.maxDays) : stay.nights
  // The shortest months are 28 days: up to 28 nights a month, the stay never reaches the cap.
  const beyond = rules.maxMonths != null && stay.nights > rules.maxMonths * 28
  const rate = stay.later && rules.change ? { ...rules, ...rules.next } : rules
  if (rules.tiers != null) {
    // Stages decided for later replace the current ones for nights from their date (stay.later).
    const stages = stay.later && rules.change && rules.next?.tiers ? { ...rules, ...rules.next } : rules
    const perNight = stages.byLabel ? (stages.tiers[stay.tier ?? 0]?.cents ?? 0) : tierCents(stages, stay.priceCents)
    return { total: perNight * counted * stay.guests, counted, beyond }
  }
  if (rate.percent != null)
    return { total: Math.round((stay.priceCents * counted * rate.percent) / 100), counted, beyond }
  return { total: rate.cents * counted * (rate.perPerson ? stay.guests : 1), counted, beyond }
}

/**
 * Tourismusabgabe eines Vermieters im Jahr (rules.kind === 'business'), wo Gäste keine Kurtaxe zahlen und die Gemeinde
 * stattdessen die Betriebe heranzieht. Je Zeile der Satzung für die Vermietung (lines):
 *   { label, cents, per }       ein Jahresbetrag in Cent je per Einheiten (Bett, Wohnung …); count zählt die Einheiten;
 *                               roundUp: angefangene Einheiten zählen voll; floor: Mindestbetrag dieser Zeile in Cent
 *   { label, permille }         ein Anteil am Netto-Jahresumsatz aus der Vermietung, in Promille (Vorteilssatz ×
 *                               Gewinnsatz × Abgabesatz); turnoverCents ist dieser Umsatz
 *   minimum                     nur wo die Satzung es sagt: { cents, kind: 'floor' } hebt jeden geschuldeten Betrag auf
 *                               cents, { cents, kind: 'threshold' } erhebt bis einschließlich cents nichts,
 *                               { cents, kind: 'below' } erhebt unter cents nichts
 * Festgesetzt wird der Betrag per Bescheid; das hier ist die Rechnung nach der Satzung, auf Cent gerundet.
 *
 * @param {any} rules @param {{ line: number, count: number, turnoverCents: number }} input
 * @returns {{ total: number }}
 */
export function businessLevy(rules, input) {
  const line = rules.lines[input.line] ?? rules.lines[0]
  // A started unit counts in full where the statute says so (roundUp); a line may carry its own minimum (floor).
  const units = line.roundUp ? Math.ceil(input.count / line.per) : input.count / line.per
  const computed =
    line.permille != null ? Math.round((input.turnoverCents * line.permille) / 1000) : Math.round(line.cents * units)
  const total = line.floor != null && computed > 0 ? Math.max(computed, line.floor) : computed
  // A floor raises any amount owed to it; under a threshold nothing is charged.
  if (rules.minimum?.kind === 'floor' && total > 0) return { total: Math.max(total, rules.minimum.cents) }
  if (rules.minimum?.kind === 'threshold' && total <= rules.minimum.cents) return { total: 0 }
  if (rules.minimum?.kind === 'below' && total < rules.minimum.cents) return { total: 0 }
  return { total }
}

/** @param {HTMLFormElement} form @param {any} rules @param {Element} card */
function wireBusiness(form, rules, card) {
  const read = (/** @type {string} */ name) => {
    const input = form.elements.namedItem(name)
    return input instanceof HTMLInputElement || input instanceof HTMLSelectElement
      ? Number(input.value.replace(',', '.')) || 0
      : 0
  }
  const update = () => {
    const index = Math.max(0, Math.floor(read('art')))
    const line = rules.lines[index] ?? rules.lines[0]
    const turnover = line.permille != null
    // The field the line counts by shows, the other hides; both stay in the form, so a choice keeps what was typed.
    for (const [name, shown] of [
      ['einheiten', !turnover],
      ['umsatz', turnover],
    ]) {
      const field = form.querySelector(`[data-field="${name}"]`)
      if (field instanceof HTMLElement) field.hidden = !shown
    }
    const unit = form.querySelector('[data-out="unit"]')
    if (unit && !turnover) unit.textContent = line.unit
    const result = businessLevy(rules, {
      line: index,
      count: Math.min(Math.max(0, Math.floor(read('einheiten'))), 10_000),
      turnoverCents: Math.max(0, Math.round(read('umsatz') * 100)),
    })
    const total = card.querySelector('[data-out="total"]')
    if (total) total.textContent = formatEuro(result.total)
    const rate = card.querySelector('[data-out="rate"]')
    if (rate) rate.textContent = line.rate
  }
  form.addEventListener('input', update)
  update()
}

/** @param {HTMLFormElement} form @param {any} rules @param {Element} card */
function wireTown(form, rules, card) {
  const read = (/** @type {string} */ name) => {
    const input = form.elements.namedItem(name)
    return input instanceof HTMLInputElement || input instanceof HTMLSelectElement
      ? Number(input.value.replace(',', '.')) || 0
      : 0
  }
  const update = () => {
    const stay = {
      nights: Math.min(Math.max(0, Math.floor(read('naechte'))), 366),
      priceCents: Math.max(0, Math.round(read('preis') * 100)),
      guests: Math.max(0, Math.floor(read('gaeste'))),
      later: read('zeitraum') === 1,
      tier: Math.max(0, Math.floor(read('stufe'))),
    }
    const result = overnightTax(rules, stay)
    const total = card.querySelector('[data-out="total"]')
    if (total) total.textContent = formatEuro(result.total)
    const capped = card.querySelector('[data-out="capped"]')
    if (capped instanceof HTMLElement) capped.hidden = result.counted === stay.nights
    const beyond = card.querySelector('[data-out="beyond"]')
    if (beyond instanceof HTMLElement) beyond.hidden = !result.beyond
    const rate = card.querySelector('[data-out="rate"]')
    if (rate instanceof HTMLElement && rate.dataset.later)
      rate.textContent = (stay.later ? rate.dataset.later : rate.dataset.now) ?? ''
  }
  form.addEventListener('input', update)
  update()
}

/** @param {HTMLFormElement} form */
function wire(form) {
  const rules = JSON.parse(form.dataset.kurtaxe ?? '{}')
  const card = form.parentElement?.querySelector('[data-kurtaxe-result]')
  if (!card) return
  if (rules.kind === 'town') {
    wireTown(form, rules, card)
    return
  }
  if (rules.kind === 'business') {
    wireBusiness(form, rules, card)
    return
  }
  const value = (/** @type {string} */ name) => {
    const input = form.elements.namedItem(name)
    return input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value : ''
  }
  const count = (/** @type {string} */ name) => Math.max(0, Math.floor(Number(value(name)) || 0))
  const update = () => {
    const arrival = value('anreise')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return
    const result = kurtaxe(rules, {
      arrival,
      nights: Math.min(count('naechte'), 366),
      adults: count('erwachsene'),
      children: rules.childLimits.map((/** @type {number} */ _, /** @type {number} */ band) => count(`stufe${band}`)),
      zone: count('bezirk'),
      reduced: (rules.reduced ?? []).map((/** @type {any} */ _, /** @type {number} */ group) =>
        count(`ermaessigt${group}`),
      ),
    })
    const total = card.querySelector('[data-out="total"]')
    if (total) total.textContent = formatEuro(result.total)
    const body = card.querySelector('[data-out="lines"]')
    if (body) {
      body.replaceChildren(
        ...result.lines.map((line) => {
          const row = document.createElement('tr')
          const label = document.createElement('th')
          label.scope = 'row'
          label.textContent = line.label
          const days = document.createElement('td')
          days.className = 'num'
          days.dataset.label = rules.countsDepartureDay ? 'Tage' : 'Nächte'
          days.textContent = line.days === null ? '' : String(line.days)
          const amount = document.createElement('td')
          amount.className = 'num table__ours'
          amount.textContent = formatEuro(line.amount)
          row.append(label, days, amount)
          return row
        }),
      )
    }
    const capped = card.querySelector('[data-out="capped"]')
    if (capped instanceof HTMLElement) capped.hidden = result.counted === result.days
  }
  form.addEventListener('input', update)
  update()
}

if (typeof document !== 'undefined')
  for (const form of document.querySelectorAll('form[data-kurtaxe]')) wire(/** @type {HTMLFormElement} */ (form))

// Framed on a host's own website (/kurtaxe/<ort>/rechner/): tell the framing page how tall the calculator is, so the
// code it pasted can fit its iframe without a scrollbar. Only that number leaves, and only to the framing window.
const framed = typeof document !== 'undefined' ? document.querySelector('main.embed') : null
if (framed && framed instanceof HTMLElement && window.parent !== window) {
  // Measured to the last element's edge: the page itself stretches to the frame, so its own height would only echo it.
  const report = () => {
    const end = framed.lastElementChild?.getBoundingClientRect().bottom ?? 0
    const height = Math.ceil(end + window.scrollY + Number.parseFloat(getComputedStyle(framed).paddingBottom))
    window.parent.postMessage({ keysetKurtaxe: { height } }, '*')
  }
  const observer = new ResizeObserver(report)
  for (const child of framed.children) observer.observe(child)
}
