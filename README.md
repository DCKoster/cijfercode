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
npm run generate -- --difficulty 2 --theme animals_all --all-letters
```

## Website

- **Spelen:** kies niveau 1–4 en eventueel het onderwerp Bekende dieren of Alle dieren, selecteer een cijfervak en typ een letter. Een
  letter wordt meteen in alle vakken met hetzelfde cijfer ingevuld. De niveaus
  starten met respectievelijk 3, 2, 1 en 0 gegeven letters.
- **Opties:** laat desgewenst alle 26 letters minstens eenmaal voorkomen of sta
  eigennamen toe. Eigennamen zijn standaard uitgesloten. In een dierenpuzzel is
  ieder ingevuld woord een Nederlandse diernaam. De optie met alle 26 letters is
  niet beschikbaar voor Bekende dieren, omdat die selectie geen diernaam met een
  Q bevat.
- **Hulp:** controleer ingevulde letters, onthul de geselecteerde letter of toon
  na bevestiging de volledige oplossing.
- **Boekje maken:** geef een titel en per thema aantallen voor niveau 1–4 op, tot
  maximaal 50 puzzels. Thema's kunnen in één boekje worden gemengd. De uitvoer
  staat op moeilijkheid gesorteerd; de oplossingen staan op aparte pagina's
  achterin.
- **PDF:** kies `Afdrukken / PDF` en daarna `Opslaan als PDF` in het
  afdrukvenster van de browser. De opmaak is geoptimaliseerd voor A4 staand.

## Woordenlijst bijwerken

`public/lexicon.json` is een vastgezette momentopname van OpenTaal en het
Nederlands Soortenregister. Daardoor doet
de productiebuild geen netwerkdownload en blijven seeds reproduceerbaar binnen
dezelfde generator- en lexiconversie.

Installeer voor een bewuste update eerst de Python-ontwikkelomgeving en haal een
nieuwe OpenTaal- en Naturalis-momentopnames op:

```bash
python -m pip install -e '.[dev]'
python -m cijfercode words sync
npm run lexicon:build
.venv/bin/python tools/enrich_lexicon.py \
  --nsr-archive /pad/naar/nsr.zip \
  --approved /pad/naar/basiswoorden-gekeurd.txt \
  --unapproved /pad/naar/basiswoorden-ongekeurd.txt
```

De Naturalis-archive komt van de [Checklist Dutch Species Register](https://doi.org/10.15468/rjdpzy).
De twee OpenTaal-deellijsten staan in `elements/` van de upstream repository.
`Bekende dieren` bevat de Naturalis-namen met een Nederlandse `wordfreq`-score
van minimaal 1,0, minus de expliciete lijst `AMBIGUOUS_ANIMAL_NAMES` in
`tools/enrich_lexicon.py`. Die uitsluitlijst voorkomt dat de frequentie van een
gewone, niet-dierlijke betekenis een obscure diernaam ten onrechte bekend laat
lijken.

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
website gebruikt `schemaVersion: 4`; oudere opgeslagen websitepuzzels worden
bewust niet hergebruikt na deze moeilijkheidswijziging.
