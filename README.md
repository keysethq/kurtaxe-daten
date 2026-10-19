# Kurtaxe-Daten für Deutschland

Kurtaxe, Kurbeitrag, Gästebeitrag und Übernachtungsteuer von mehr als 250 deutschen Orten als offene Daten, in JSON
und CSV. Jede Zahl steht mit dem Wortlaut der Satzung, der Quelle, der SHA-256-Prüfsumme des Dokuments und dem Tag der
Prüfung da. Dazu die Tourismusabgabe, die Vermieter selbst zahlen, und schon beschlossene neue Sätze.

**Frei unter [CC BY 4.0](LICENSE), auch kommerziell.** Nenne als Quelle „Keyset, keyset.cloud/kurtaxe“.

Zum Nachschlagen im Browser, mit Rechner je Ort: **[keyset.cloud/kurtaxe](https://keyset.cloud/kurtaxe/)**

*[English below](#english)*

## Was hier liegt

Dieses Repository ist ein täglicher Spiegel von `https://keyset.cloud/kurtaxe/v1/`. Eine GitHub Action holt die Daten
jeden Morgen und committet nur, wenn sich etwas geändert hat. Deshalb ist die Historie gleichzeitig ein Änderungsprotokoll:
jede neue Satzung, jeder neue Satz und jeder neue Ort steht als eigener Commit drin.

| Datei | Inhalt |
|---|---|
| [`v1/orte.json`](v1/orte.json) | alle Orte mit allen Feldern |
| `v1/<ort>.json` | ein Ort, z. B. [`v1/binz.json`](v1/binz.json) |
| [`v1/orte.csv`](v1/orte.csv) | alle Sätze als Tabelle, eine Zeile je Ort und Saison |
| [`v1/aenderungen.json`](v1/aenderungen.json) | beschlossene neue Sätze mit Datum, Wortlaut und Quelle |
| [`v1/kurtaxe.js`](v1/kurtaxe.js) | der Rechner als JavaScript-Modul, derselbe Code wie auf den Ortsseiten |

Was jedes Feld bedeutet, steht in der [Beschreibung der Schnittstelle](https://keyset.cloud/kurtaxe/api/).
Beträge sind in Cent.

## Benutzen

Direkt von keyset.cloud, ohne Schlüssel und ohne Anmeldung, mit CORS für jede Herkunft:

```bash
curl https://keyset.cloud/kurtaxe/v1/binz.json
```

Oder aus diesem Repository, zum Beispiel über jsDelivr:

```js
const { places } = await fetch('https://cdn.jsdelivr.net/gh/keysethq/kurtaxe-daten@main/v1/orte.json').then((r) => r.json())
```

Die Kurtaxe für einen Aufenthalt selbst rechnen:

```js
import { kurtaxe } from 'https://keyset.cloud/kurtaxe/v1/kurtaxe.js'

const binz = await fetch('https://keyset.cloud/kurtaxe/v1/binz.json').then((r) => r.json())
// Eine Woche im Juli, zwei Erwachsene und ein Kind in der ersten Kinderstufe
const result = kurtaxe(binz.calculation, { arrival: '2027-07-10', nights: 7, adults: 2, children: [1] })
// → { total: 5440, days: 8, lines: [{ label: 'Ganzjährig', perDay: 680, amount: 5440, … }], … }
```

`total` ist in Cent. Mehr dazu unter [Selbst rechnen](https://keyset.cloud/kurtaxe/api/).

## Stabilität

Unter `v1/` kommen nur Felder dazu. Keins fällt weg oder ändert seine Bedeutung. Was das brechen würde, erscheint unter
`v2/`, und `v1/` bleibt mindestens zwölf Monate daneben bestehen.

## Eine Zahl prüfen

Jede Quelle hat ihre Adresse und die SHA-256-Prüfsumme des Dokuments, das gelesen wurde. Lade es, vergleiche die
Prüfsumme und such das Zitat: Es steht wörtlich darin. Die Satzungen selbst sind amtliche Werke der Gemeinden.

## Fehler gefunden?

Schreib an [info@verge-one.com](mailto:info@verge-one.com) oder mach ein Issue auf. Korrekturen landen zuerst auf
keyset.cloud und kommen am nächsten Morgen hier an. Pull Requests auf `v1/` würden beim nächsten Abgleich überschrieben.

## Wer das pflegt

Gepflegt von [Keyset](https://keyset.cloud), Haßfurt.

## English

Local tourist and spa taxes (Kurtaxe, Kurbeitrag, Gästebeitrag) and overnight stay taxes (Übernachtungsteuer) of more
than 250 German municipalities, keyed by the official municipality code (AGS). Germany has no central source for these
rates: every municipality sets them in its own statute. Each figure here carries the verbatim wording of that statute,
the source URL, the SHA-256 checksum of the source document and the date it was checked. Also included: child age
bands, caps, exemptions, rates already adopted for a later date and the levy landlords pay themselves.

- **Formats:** JSON per municipality and for all of them, one CSV with a row per municipality and season, amounts in
  euro cents.
- **Updates:** this repository mirrors `https://keyset.cloud/kurtaxe/v1/` every morning and commits only when
  something changed, so the Git history is a change log of the rates.
- **API:** the same files are served without key or sign-up, over HTTPS with CORS open to any origin. Field reference
  (German): <https://keyset.cloud/kurtaxe/api/>.
- **Calculator:** `v1/kurtaxe.js` exports `kurtaxe(calculation, stay)` and returns the tax for a stay in cents.
- **Stability:** fields are only added under `v1/`; anything breaking would appear under `v2/`, with `v1/` kept for at
  least twelve months.
- **License:** [CC BY 4.0](LICENSE). Attribute as „Keyset, keyset.cloud/kurtaxe“. Corrections:
  [info@verge-one.com](mailto:info@verge-one.com) or an issue.
