
# Werkvoorbereidings-app — Bouwronde 1

Doel: stabiele basis waarop later de exacte Excel-logica (Materiaalstaat → Verkooporder) gelaagd kan worden. Geen voorbeelddata uit Case 308466 wordt hardcoded.

## Stack
- Frontend: Lovable (React + Vite + Tailwind + shadcn/ui), Nederlandse labels, desktop-first.
- Backend: Lovable Cloud (Supabase). Auth voorlopig open / publiek (RLS permissive in v1, voorbereid op rollen later).
- CSV-export via Supabase Edge Function `export-verkooporder-csv` voor controleerbaarheid.

## Database (Supabase migrations)

Tabellen exact zoals gespecificeerd, met UUID PK's, `created_at`/`updated_at`, en indexes op `case_number`, `project_number`, `article_number`, `category_id`, `case_id`.

1. `cases` — projectgegevens + status (`concept|in_bewerking|gereed_voor_export|geexporteerd`)
2. `categories` — vooraf geseede categorieblokken (Kabels, MS Installatie, MS patronen, Aarding, Eindsluitingen MS, Moffen MS, Magnefix, LS-rek, Stationsinrichting, I-Netten, Trafo, Overige, Asbest, Moffen LS, Standaard voorraad, Extra voorraad, Compact station, Mantelbuis, Algemeen)
3. `articles` — algemeen artikelbestand (bron: VDH/Liander/Handmatig/Anders)
4. `liander_assortment_imports` — importgeschiedenis
5. `liander_assortment_items` — masterdata Liander (raw_data jsonb)
6. `case_material_lines` — regels per case
7. `case_order_lines` — aanvulling/bestelregels per case
8. `verkooporder_lines` — exacte CSV-bron
9. `haspel_numbers` — charge/haspelregistratie
10. `export_logs` — elke CSV-export

RLS aan op alle tabellen, in v1 policies "iedereen mag alles" (zodat we straks rollen kunnen toevoegen zonder schemabreuk).

## Routes & schermen

- `/` Dashboard — tabel van cases (casenummer, projectnummer, omschrijving, datum, status, #regels, laatste export), zoekveld, statusfilter, knop "Nieuwe case".
- `/cases/new` — formulier nieuwe case → na opslaan redirect naar detail.
- `/cases/:id` — sticky header (case info + status + "CSV exporteren") en tabs:
  - **Overzicht** — meta + tellingen
  - **Materiaalstaat** — editor met categorieblokken (inklapbaar), artikel-zoek (op nummer/omschrijving), inline edit van aantal/verbruikt/retour/opmerking/charge, dupliceren/verwijderen, badges voor handmatig vs auto, badges voor ontbrekende data/negatief/retour/charge. Telt bovenin: totaal regels, regels met totaal>0, ontbrekende data, retour, met charge. Berekening v1: `total = quantity - return_quantity`.
  - **Verbruik** — afgeleide weergave uit material_lines (artikel, hoeveelheid, eenheid, charge, categorie, opmerking).
  - **Aanvulling** — case_order_lines met match-status tegen Liander (placeholder match op artikelnummer), Klant Hoeveelheid editbaar.
  - **Verkooporder** — verkooporder_lines tabel met knop "Verkooporder opnieuw opbouwen" (rebuild vanuit material_lines waar `total > 0` → sol_articlenumber/sol_quantity; so_number=casenummer, so_customernumber+so_project leeg/configureerbaar op case).
  - **Exportlog** — lijst export_logs.
- `/articles` — artikelbestand: zoeken, toevoegen, wijzigen, activeren, filters categorie/actief/bron.
- `/liander` — Liander Assortimentslijst: tabel + zoek + filter actief, importgeschiedenis, placeholder "Nieuwe Liander-lijst importeren" (UI klaar, parser stub).

## Edge function

`supabase/functions/export-verkooporder-csv/index.ts`
- Input: `{ case_id }`
- Leest `verkooporder_lines` waar `sol_quantity > 0`
- Bouwt CSV met kolommen `sol_articlenumber,sol_quantity,so_number,so_customernumber,so_project`
- Bestandsnaam `Case <casenummer>.csv`
- Schrijft `export_logs` rij; update case status naar `geexporteerd`
- Retourneert CSV als download

## UI/UX
- shadcn/ui, neutrale zakelijke palette, witte cards, badges voor status, sticky export-knop, geen marketing-elementen, geen overdreven animaties.

## Out of scope v1 (expliciet)
- Auth/rollen (alle policies open)
- Echte Liander-import parser (alleen UI + tabellen)
- Excel-import bestaande cases
- Geavanceerde standaard-voorraad/grijpvoorraad-formules
- Begin-/eindmeterstanden
- Exacte charge/haspel-workflow (alleen veld in v1)

## Bouwvolgorde
1. Lovable Cloud aanzetten
2. Migrations: tabellen + indexes + seed categories + RLS
3. Edge function CSV-export
4. Frontend: routes, layout, dashboard, nieuwe case, detailpagina shell met tabs
5. Materiaalstaat-editor
6. Artikelbestand
7. Liander pagina
8. Verbruik/Aanvulling/Verkooporder/Exportlog tabs
9. Exportknop wired naar edge function

Na akkoord begin ik met stap 1.
