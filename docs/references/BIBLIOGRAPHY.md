# Bibliography

Works consulted for Carboy's formulas and brewing data. Formulas are
recorded in our own words in [FORMULA_COVERAGE.md](../architecture/FORMULA_COVERAGE.md),
each with its source; no text, tables, figures, or worked examples are
reproduced from these works. Where a book compiles methods from earlier
publications, the primary publication is cited first and the book as the
secondary source.

Status per entry: **read** (consulted directly), **via** (cited by a work we
read; the original is still to be read and checked).

## Secondary sources (read)

- Holle, S. R. (2003; 4th printing 2010). *A Handbook of Basic Brewing
  Calculations.* Master Brewers Association of the Americas, St. Paul, MN.
  ISBN 0-9718255-1-3. **Read.** Cited in FORMULA_COVERAGE as "Holle ch. N".

## Primary sources (read)

- Bates, F. J. and associates (1942). *Polarimetry, Saccharimetry and the
  Sugars.* Circular of the National Bureau of Standards C440. US Government
  Printing Office. doi:10.6028/NBS.CIRC.440. Scan:
  <https://archive.org/details/circularofbureau440bate>. **Read**
  (Tables 113 and 114; two misprints found in Table 114). US Government
  work, public domain. Used for `gravity.sg-plato`.
- Plato, F., Domke, J., Harting, H. (1900). Die Dichte, Ausdehnung und
  Kapillarität von Lösungen reinen Rohrzuckers in Wasser. *Wissenschaftliche
  Abhandlungen der Kaiserlichen Normal-Eichungskommission* 2, 153 ff.
  **Via** NBS C440 Table 113 (the original not read).

- IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW).
  *Abridged Standard Atomic Weights 2024* (based on the Atomic Weights 2021
  report). <https://www.ciaaw.org/abridged-atomic-weights.htm>. **Read
  2026-10-14.** Used for `sulfite.so2-from-metabisulfite` and
  `nutrient.yan-from-dap`.

## Primary sources (via Holle, to be read)

- Kolbach, P. (1941). Zur Beurteilung gipshaltiger Brauwässer.
  *Wochenschrift für Brauerei* 63(44):231–234. (Residual alkalinity.)
- Kolbach, P. (1953). Der Einfluss des Brauwassers auf das pH von Würze
  und Bier. *Monatsschrift für Brauerei*, Wiss. Beilage 6(5):49–52. (pH
  shift per °dH; acid equivalents.)
- Daniels, R. (1996). *Designing Great Beers.* Brewers Publications.
  pp. 44, 59, 61, 71. (Color conversion, MCU, wort-to-beer color table.)
- Mosher, R. (1993). *The Brewer's Companion.* Alephenalia. pp. 108–109.
  (Hop utilization tables.)
- Kunze, W. (1994). *Technologie Brauer und Mälzer.* VLB Berlin.
  pp. 189–199, 237, 264–268, 283, 299, 332. (Grain bill, mashing,
  evaporation, losses, slurry, priming.)
- Narziss, L. (1992). *Die Bierbrauerei, Bd. II.* Enke. II:153–166, 313,
  325. (Water quantities, decoction, grain bill with a hot-volume factor.)
- DeClerck, J. (1957/1994). *A Textbook of Brewing.* Vols. 1–2.
  1:269–270, 1:392. (Infusion water, real degree of fermentation.)
- Bamforth, C. W. (2002). *Standards of Brewing.* Brewers Publications.
  pp. 103–104. (Grain heat capacity, slaking heat.)
- Singh, R. P. & Heldman, D. R. (2001). *Introduction to Food
  Engineering*, 3rd ed. p. 611. (Water density, i.e. shrinkage.)
- Hough, J. S. (1994). *The Biotechnology of Malting and Brewing.* p. 115.
  (CO₂ yield from extract.)

## Culture genetics (to be read)

Primary studies for strain identity, lineage, and species of brewing
cultures (INGREDIENT_CATALOG §2.2–§2.3). Not yet read; check each for its
peer-reviewed version before citing.

- Gallone, B. et al. (2016). Domestication and divergence of
  *Saccharomyces cerevisiae* beer yeasts. *Cell* 166(6). Open access
  (CC BY-NC-ND 4.0): <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5018251/>.
  **Read 2026-10-13** (full text and Table S1). Supports lineage-level
  structure (Wine, Beer 1 with Belgium/Germany, Britain and US
  subpopulations, Beer 2, Asia, Mixed) and trait findings (maltotriose use,
  loss of 4-VG production); strains are identified only by anonymous codes,
  so it supports **no product-level identity claims** by itself.
- Fay, J. C. et al. (2018). A polyploid admixed origin of beer yeasts
  derived from European and Asian wine populations. bioRxiv 466276.
- Langdon, Q. K. et al. (2019). Genomic diversity and global distribution
  of *Saccharomyces eubayanus*, the wild ancestor of hybrid lager-brewing
  yeasts. bioRxiv 709535.
- Dunham, M. J. et al. (2020). Genomic stability and adaptation of beer
  brewing yeasts during serial repitching in the brewery. bioRxiv
  2020.06.26.166157.
- Kerruish, D. W. M. et al. (2024). The origins of the Guinness stout yeast.
  *Communications Biology*. <https://www.nature.com/articles/s42003-023-05587-3>.
- White Labs (2023). Identifying lager vs ale strains. Manufacturer
  publication.

## Wine, cider, and mead chemistry (to be read)

Leads from the CQ3/CQ4 source review (FORMULA_COVERAGE.md); none read yet.

- Usseglio-Tomasset, L. and Bosia, P. D. (1984). Determinazione delle
  costanti di dissociazione dei principali acidi del vino in soluzioni
  idroalcoliche di interesse enologico. *Rivista di Viticoltura e di
  Enologia* 37. (pK of SO₂ in hydroalcoholic solutions; citation details to
  confirm.)
- Boulton, R. B., Singleton, V. L., Bisson, L. F., Kunkee, R. E. (1996).
  *Principles and Practices of Winemaking.* Chapman & Hall.
- Jackson, R. S. (2008). *Wine Science: Principles and Applications*, 3rd
  ed. Academic Press.
- Bisson, L. F. and Butzke, C. E. (2000). Diagnosis and rectification of
  stuck and sluggish fermentations. *Am. J. Enol. Vitic.* 51(2):168–177.
  doi:10.5344/ajev.2000.51.2.168.
- Mendes-Ferreira, A. et al. (2010). Improvement of mead fermentation by
  honey-must supplementation. (Journal to confirm.)
- Pereira, A. P. et al. (2015). Mead production: effect of nitrogen
  supplementation on growth, fermentation profile and aroma formation by
  yeasts in mead fermentation. *J. Inst. Brew.* doi:10.1002/jib.184.
- Lea, A. G. H. *Craft Cider Making.* (Edition to confirm.)

## Standards and specifications

- BeerXML 1.0 specification. <https://www.beerxml.com/beerxml.htm>. **Read.**
- RFC 8785, *JSON Canonicalization Scheme (JCS).* <https://www.rfc-editor.org/rfc/rfc8785>. **Read.**
- RFC 9562, *Universally Unique IDentifiers (UUIDs).* <https://www.rfc-editor.org/rfc/rfc9562>. **Read.**

## Adding an entry

Give author, year, title, edition, publisher, and ISBN or DOI. Record what
the work was used for in FORMULA_COVERAGE, not here. Keep reading notes,
transcriptions, and page-by-page summaries out of this repository.
