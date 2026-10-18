# Cijfercode

Een website voor Nederlandse cijfercodepuzzels. Bezoekers kunnen zonder account
een puzzel genereren en spelen, of een A4-puzzelboek met meerdere
moeilijkheidsniveaus maken en via de browser afdrukken of als PDF bewaren.

De website draait volledig in de browser. De generator werkt in een Web Worker,
waardoor het scherm tijdens het zoeken naar een unieke puzzel bruikbaar blijft.
Puzzels, voortgang en het laatst gemaakte boekje worden alleen lokaal in de
browser bewaard.

## Ontwikkelen

Vereisten: Node.js 20.19+ of 22.12+ wordt aanbevolen. De huidige vastgezette
toolchain werkt ook met Node.js 22.0.

```bash
npm install
npm run dev
```

De belangrijkste commando's zijn:

```bash
npm test                              # unit- en generatortests
npm run build                         # productiebuild in dist/
npm run generate -- --difficulty 2   # één puzzel als JSON
npm run generate -- --difficulty 4 --seed voorbeeld --output puzzel.json
```

## Website

- **Spelen:** kies niveau 1–4, selecteer een cijfervak en typ een letter. Een
  letter wordt meteen in alle vakken met hetzelfde cijfer ingevuld. De niveaus
  starten met respectievelijk 3, 2, 1 en 0 gegeven letters.
- **Hulp:** controleer ingevulde letters, onthul de geselecteerde letter of toon
  na bevestiging de volledige oplossing.
- **Boekje maken:** geef een titel en aantallen per niveau op, tot maximaal 20
  puzzels. De uitvoer staat op moeilijkheid gesorteerd; de oplossingen staan op
  aparte pagina's achterin.
- **PDF:** kies `Afdrukken / PDF` en daarna `Opslaan als PDF` in het
  afdrukvenster van de browser. De opmaak is geoptimaliseerd voor A4 staand.

## Woordenlijst bijwerken

`public/lexicon.json` is een vastgezette, compacte momentopname. Daardoor doet
de productiebuild geen netwerkdownload en blijven seeds reproduceerbaar binnen
dezelfde generator- en lexiconversie.

Installeer voor een bewuste update eerst de Python-ontwikkelomgeving en haal een
nieuwe OpenTaal-momentopname op:

```bash
python -m pip install -e '.[dev]'
python -m cijfercode words sync
npm run lexicon:build
```

Controleer en commit de gewijzigde bronmetadata en `public/lexicon.json` samen.
Zie [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) voor bronvermelding. De
bestaande Python-implementatie blijft voorlopig beschikbaar als referentie voor
de datatool en regressievergelijking; de website en Node-CLI gebruiken uitsluitend
de TypeScript-generator.

## Cloudflare publiceren

De statische site is ingesteld als Cloudflare Worker met assets uit `dist/`:

```bash
npx wrangler login
npm run deploy
```

Voeg daarna in **Workers & Pages → cijfercode → Settings → Domains & Routes**
het aangepaste domein `cijfercode.dckoster.com` toe. Cloudflare beheert de DNS
voor `dckoster.com`, dus het bijbehorende record wordt vanuit deze stap gemaakt.

## Oudere Python-API

De oorspronkelijke generator blijft tijdens de webmigratie testbaar:

```bash
pytest -q
python -m cijfercode generate --difficulty 2 --seed voorbeeld
```

De TypeScript-generator is leidend voor nieuwe websitepuzzels. JSON uit de
website gebruikt `schemaVersion: 3`; oudere opgeslagen websitepuzzels worden
bewust niet hergebruikt na deze moeilijkheidswijziging.
