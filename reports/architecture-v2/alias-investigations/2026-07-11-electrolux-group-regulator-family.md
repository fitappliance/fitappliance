# Electrolux Group Alias Investigation

Status: adjudicated. One dimensions-only alias is approved, one remains pending,
and seven are rejected.

## Authority evidence

- Dataset: Australian Government Energy Rating for Household Appliances,
  `rf_2026_07_10.csv`.
- Dataset URL: `https://data.gov.au/data/dataset/559708e5-480e-4f94-8429-c49571e82761/resource/0eabca18-49bb-4a9e-8019-28d5d56501c4/download/rf_2026_07_10.csv`.
- Retrieved: 2026-07-11.
- SHA-256: `cceb22f8a1879ee66cfd0c929a78c441bd08f18933f8ba6a0ae1d1efec202775`.

The register places both ends of every candidate pair in the same submission,
registration, family, manufacturing country, and sales markets:

| Target | Source | Registration | Family | Submit ID | Sold in |
| --- | --- | --- | --- | --- | --- |
| EBE5367BC | EBE5367SC | ARF4011 | EBE5367** | 177949 | Australia, New Zealand |
| WTB2500AH | WTB2500WH | ARF2581 | WTB2500** | 139409 | Australia, Fiji, New Zealand |
| KTB2302AB | KTB2302WB | ARF3931 | KTB2302** | 177959 | Australia, Fiji, New Zealand |
| KTB2502AB | KTB2502WB | ARF3963 | KTB2502** | 177960 | Australia, Fiji, New Zealand |
| KTB2802AB | KTB2802WB | ARF3964 | KTB2802** | 177962 | Australia, Fiji, New Zealand |
| WHE6000BB | WHE6000SB | ARF3968 | WHE6000*B | 177966 | Australia, New Zealand |
| WHE6060BB | WHE6060SB | ARF3969 | WHE6060** | 177993 | Australia, New Zealand |
| WHE6874BA | WHE6874SA | ARF3970 | WHE6874** | 177994 | Australia, New Zealand |
| WHE7074BA | WHE7074SA | ARF3916 | WHE7074** | 178002 | Australia, New Zealand |

## Axis warning

The dataset's `Depth`, `Height`, and `Width` columns do not express physical
W/H/D in the order expected by the current importer for these rows. For
example, the register's axis columns do not match the physical W/H/D ordering
used by the product documents. The regulator data is accepted only as
relationship evidence and must not populate geometry.

## Target-model research

- The official WHE6874SA factsheet reports W913 x H1782 x D803 on page 4:
  `https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6874SA&brand=Westinghouse`
  (SHA-256 `a792faf4dd337ea4fde2fcd9fa9b4904b7270c227be664765b95176a6ff7979a`).
- The Appliances Online WHE6874BA PDF reports the same ordered dimensions on
  page 4:
  `https://www.appliancesonline.com.au/ak/0/1/9/2/0192e04f906bcc306046551bd4bf2f3a8373e7f2_WHE6874BA_Westinghouse_Specifications_Sheet.pdf`
  (SHA-256 `148c96022fe394b0ad19d6342fc5bc686ba1671a221cfc80d26e717e221f07dc`).
- The independent Winning Appliances target page reports the same dimensions.
  Its normalized immutable snapshot is
  `data/architecture-v2/reviews/phase-10/alias-market-snapshot-winnings-whe6874ba.json`
  (SHA-256 `965821c5c9b2dee11763e62a5f5c66fb565cb7b5e94185a2b19de1a4d5353615`).
- The official Westinghouse WHE6874BA page independently confirms the exact
  target model and W913 x D803 x H1782 envelope:
  `https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/`.
- Searches for the exact KTB2302AB, KTB2502AB, KTB2802AB, WHE6000BB,
  WHE6060BB, and WHE7074BA target models did not produce two independent
  market pages with explicit ordered dimensions.
- WTB2500AH is additionally unsafe because the current no-X family coexists
  with older WTB2500AH-X/WTB2500WH-X registrations and product documents with
  a different envelope. A colour-suffix relationship cannot cross a product
  generation boundary.

## Decisions

| Target | Status | Scope | Rationale |
| --- | --- | --- | --- |
| WHE6874BA | Approved, Tier B | W/H/D only | Regulator family, official source dimensions, and two independent target-market sources agree on W913 x H1782 x D803. |
| EBE5367BC | Pending | None published | Strong regulator and hydrocarbon-register relationship, but target-market dimension corroboration is incomplete. |
| WTB2500AH | Rejected | None | Generation conflict plus incomplete exact no-X target evidence. |
| KTB2302AB | Rejected | None | Regulator relationship only; target dimension corroboration missing. |
| KTB2502AB | Rejected | None | Regulator relationship only; target dimension corroboration missing. |
| KTB2802AB | Rejected | None | Regulator relationship only; target dimension corroboration missing. |
| WHE6000BB | Rejected | None | Sibling guide plus regulator relationship do not prove target dimensions. |
| WHE6060BB | Rejected | None | Sibling guide plus regulator relationship do not prove target dimensions. |
| WHE7074BA | Rejected | None | Regulator relationship exists, but target dimension corroboration is missing. |

Rejected means that this alias route is closed on the evidence currently
available; it does not claim that the products are unrelated. Clearance,
plumbing, door swing, ventilation, service space, and operational fields are
never inherited through Tier B.

The active `ao-88474` WHE6874BA row remains in publication quarantine even
though the dimensions alias is approved. Its legacy projection still carries
unreviewed clearance and operation fields, and its `requires_plumbing: false`
flag conflicts with the exact target PDF's `Plumbed water supply: Yes`. The
product can be released only after the projection consumes the approved W/H/D
without carrying those unrelated legacy claims, or after those fields receive
their own exact-target review.
