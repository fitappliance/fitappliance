# Dimension Axis Audit

Generated: 2026-07-11T13:58:09.608Z

## Summary

- Issues: 49
- Blockers: 17
- Warnings: 32
- Raw evidence blockers: 17
- Catalog-final drift blockers: 0
- Shape review warnings: 32

## Blockers

| code |product |brand |model |dims |source diff |
| --- |--- |--- |--- |--- |--- |
| swapped_against_raw_evidence |ao-11243 |Bosch |SCE53M05AU |w=595 h=595 d=500 | |
| swapped_against_raw_evidence |fridge-arf2392 |Electrolux |EQE6870SA |w=1782 h=913 d=749 |w: runtime 1782, source 913; h: runtime 913, source 1782 |
| dimension_mismatch_raw_evidence |fridge-arf2395 |Westinghouse |WHE6874SA |w=1782 h=913 d=749 |w: runtime 1782, source 913; h: runtime 913, source 1782; d: runtime 749, source 803 |
| dimension_mismatch_raw_evidence |fridge-arf2439 |Westinghouse |WTB4600WC |w=1725 h=699 d=769 |w: runtime 1725, source 699; h: runtime 699, source 1725; d: runtime 769, source 723 |
| dimension_mismatch_raw_evidence |fridge-arf2442 |KELVINATOR |KBM4502WC |w=1725 h=699 d=723 |w: runtime 1725, source 699; h: runtime 699, source 1718; d: runtime 723, source 730 |
| swapped_against_raw_evidence |fridge-arf2443 |Westinghouse |WTB5400WC |w=1725 h=796 d=723 |w: runtime 1725, source 796; h: runtime 796, source 1725 |
| dimension_mismatch_raw_evidence |fridge-arf2461 |Westinghouse |WHE7074SA |w=1728 h=913 d=803 |w: runtime 1728, source 913; h: runtime 913, source 1782 |
| dimension_mismatch_raw_evidence |fridge-arf2495 |KELVINATOR |KBM5302AC |w=1725 h=796 d=723 |w: runtime 1725, source 796; h: runtime 796, source 1718 |
| dimension_mismatch_raw_evidence |fridge-arf2538 |KELVINATOR |KTM4602WC |w=1725 h=699 d=723 |w: runtime 1725, source 699; h: runtime 699, source 1718; d: runtime 723, source 730 |
| dimension_mismatch_raw_evidence |fridge-arf2540 |KELVINATOR |KTM5402AC |w=1725 h=796 d=723 |w: runtime 1725, source 796; h: runtime 796, source 1718 |
| dimension_mismatch_raw_evidence |fridge-arf2921 |Westinghouse |WQE5650BA |w=1795 h=896 d=723 |w: runtime 1795, source 896; h: runtime 896, source 1795 |
| swapped_against_raw_evidence |fridge-arf2922 |Westinghouse |WQE5660BA |w=1795 h=896 d=723 |w: runtime 1795, source 896; h: runtime 896, source 1795 |
| swapped_against_raw_evidence |fridge-arf2944 |Electrolux |EQE6160BA |w=1782 h=913 d=749 |w: runtime 1782, source 913; h: runtime 913, source 1782 |
| swapped_against_raw_evidence |fridge-arf3258 |Westinghouse |WQE6170BB |w=1782 h=913 d=749 |w: runtime 1782, source 913; h: runtime 913, source 1782 |
| swapped_against_raw_evidence |fridge-arf3824 |Westinghouse |WHE5264SC |w=1725 h=796 d=769 |w: runtime 1725, source 796; h: runtime 796, source 1725 |
| swapped_against_raw_evidence |fridge-arf3868 |Westinghouse |WHE5204BC |w=1725 h=796 d=769 |w: runtime 1725, source 796; h: runtime 796, source 1725 |
| dimension_mismatch_raw_evidence |fridge-arf3923 |Westinghouse |WTB4600SC |w=1725 h=699 d=769 |w: runtime 1725, source 699; h: runtime 699, source 1725; d: runtime 769, source 723 |

## Warnings

| code |product |brand |model |message |
| --- |--- |--- |--- |--- |
| upright_fridge_width_gt_height_review |ao-105274 |Haier |HCF384W2 |ao-105274 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-105275 |Haier |HCF719W2 |ao-105275 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-153207 |Haier |HCF301 |ao-153207 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-40194 |Haier |HCF264 |ao-40194 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-40195 |Haier |HCF384 |ao-40195 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-50178 |Midea |MCH198W |ao-50178 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-50179 |Midea |MCH295W |ao-50179 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-50180 |Midea |MCH415W |ao-50180 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-53437 |Hisense |HR6CF206 |ao-53437 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-53438 |Hisense |HR6CF307 |ao-53438 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-56232 |Haier |HCF201 |ao-56232 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-57643 |Esatto |ECF198W |ao-57643 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-62171 |Beko |HSA46330 |ao-62171 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-62591 |Haier |HCF719 |ao-62591 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-64066 |Fisher & Paykel |RC201W1 |ao-64066 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-64067 |Fisher & Paykel |RC376W1 |ao-64067 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-64068 |Fisher & Paykel |RC519W1 |ao-64068 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-68982 |Esatto |ECF198WE |ao-68982 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-70350 |Haier |HCF524W2 |ao-70350 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-70968 |CHIQ |CCF199S |ao-70968 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-70969 |CHIQ |CCF291S |ao-70969 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |ao-80586 |Beko |BCF307W |ao-80586 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf2470 |Ikea |HS-65LN(AU) TILLREDA N |fridge-arf2470 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf2512 |Dometic |DM50C D |fridge-arf2512 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf2816 |Fisher & Paykel |RB90S64MKIW1 |fridge-arf2816 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf2826 |Fisher & Paykel |RB90S64MKIW1 2 |fridge-arf2826 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf2932 |RYOBI |R18FRF10 |fridge-arf2932 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf3196 |Germanica |GR48LTBF |fridge-arf3196 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf3875 |Fhiaba |UC2D90POA |fridge-arf3875 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf3890 |Fhiaba |UC2D90GMIA |fridge-arf3890 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-arf3892 |Fhiaba |UC2D90GMA |fridge-arf3892 is an upright fridge where width is greater than height; review before GEO treatment |
| upright_fridge_width_gt_height_review |fridge-zrf0241 |Fisher & Paykel |RB90S64MKIW |fridge-zrf0241 is an upright fridge where width is greater than height; review before GEO treatment |

## Operating Decision

- Blockers must be fixed before publishing GEO treatment pages or new fit-check pages.
- Shape warnings are review queues; they should not block normal builds unless promoted deliberately.
- Prefer verified raw evidence or `data/catalog-final.json` rows with dimension evidence over runtime public JSON when they disagree.
