import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildFinalCatalog,
  mergeEvidenceIntoProduct,
  runMerge
} from '../../scripts/pdf-pipeline/4-merge.js';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-final-merge-'));
  const activeFridge = {
    id: 'fridge-arf2964',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740,
    unavailable: false,
    retailers: [{ n: 'Appliances Online', url: 'https://example.com/product' }]
  };
  const untouchedDryer = {
    id: 'dryer-1',
    cat: 'dryer',
    brand: 'Other',
    model: 'DRY1',
    w: 600,
    h: 850,
    d: 600,
    unavailable: false
  };
  const sameSkuDifferentProduct = {
    id: 'fridge-similar',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    w: 910,
    h: 1905,
    d: 755,
    unavailable: false
  };

  writeJson(path.join(repoRoot, 'public', 'data', 'fridges.json'), { products: [activeFridge, sameSkuDifferentProduct] });
  writeJson(path.join(repoRoot, 'public', 'data', 'dryers.json'), { products: [untouchedDryer] });
  writeJson(path.join(repoRoot, 'public', 'data', 'dishwashers.json'), { products: [] });
  writeJson(path.join(repoRoot, 'public', 'data', 'washing-machines.json'), { products: [] });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'), {
    schema_version: 1,
    product_id: 'fridge-arf2964',
    category: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    source_url: 'https://example.com/rf730.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'Fisher & Paykel',
      sku: 'RF730QNUVX1',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1900,
        width_mm: 905,
        depth_mm: 748,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 20,
        left_mm: 20,
        right_mm: 20,
        rear_mm: 30
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/rf730.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  });
  return repoRoot;
}

test('final merge overlays official PDF dimensions, clearance and flags without mutating input', () => {
  const product = {
    id: 'fridge-arf2964',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740
  };
  const evidence = {
    product_id: 'fridge-arf2964',
    source_url: 'https://example.com/rf730.pdf',
    verified_at: '2026-05-09',
    extracted: {
      dimensions: {
        height_mm: 1900,
        width_mm: 905,
        depth_mm: 748,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 20,
        left_mm: 20,
        right_mm: 20,
        rear_mm: 30
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/rf730.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  };

  const merged = mergeEvidenceIntoProduct(product, evidence);

  assert.deepEqual(product, {
    id: 'fridge-arf2964',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740
  });
  assert.equal(merged.w, 905);
  assert.equal(merged.h, 1900);
  assert.equal(merged.d, 748);
  assert.equal(merged.data_source, 'official_pdf');
  assert.deepEqual(merged.dimensions, evidence.extracted.dimensions);
  assert.deepEqual(merged.clearance_requirements, evidence.extracted.clearance_requirements);
  assert.deepEqual(merged.flags, evidence.extracted.flags);
  assert.equal(merged.evidence.has_pdf_evidence, true);
});

test('final merge promotes verified WashTower evidence into the dedicated catalog category', () => {
  const product = {
    id: 'discovery-washing-machine-lg-1910bx',
    cat: 'washing_machine',
    brand: 'LG',
    model: '1910BX'
  };
  const evidence = {
    product_id: 'discovery-washing-machine-lg-1910bx',
    source_url: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=aDEyNnLn9ZhB6npLvfqKzA',
    verified_at: '2026-05-14',
    extracted: {
      dimensions: {
        height_mm: 1890,
        width_mm: 700,
        depth_mm: 830,
        door_open_90_depth_mm: 1460
      },
      category: 'WASHTOWER_COMBO',
      clearance_requirements: {
        top_mm: 110,
        left_mm: 50,
        right_mm: 50,
        rear_mm: 200
      },
      flags: {
        requires_plumbing: true,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=aDEyNnLn9ZhB6npLvfqKzA',
        extraction_date: '2026-05-14T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  };

  const merged = mergeEvidenceIntoProduct(product, evidence);

  assert.equal(merged.cat, 'washtower_combo');
  assert.equal(merged.w, 700);
  assert.equal(merged.h, 1890);
  assert.equal(merged.d, 830);
  assert.equal(merged.flags.requires_plumbing, true);
});

test('final catalog summary includes evidence-only categories such as WashTower Combo', () => {
  const repoRoot = makeRepo();
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'discovery-washing-machine-lg-1910bx': {
        category: 'washing_machine',
        brand: 'LG',
        model: '1910BX',
        discovery: { retailer_key: 'the-good-guys' },
        product: {
          id: 'discovery-washing-machine-lg-1910bx',
          cat: 'washing_machine',
          brand: 'LG',
          model: '1910BX',
          unavailable: false
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', '1910BX.json'), {
    schema_version: 1,
    product_id: 'discovery-washing-machine-lg-1910bx',
    category: 'washing_machine',
    brand: 'LG',
    model: '1910BX',
    source_url: 'https://example.com/wwt-1910bx.pdf',
    verified_at: '2026-05-14',
    extracted: {
      brand: 'LG',
      sku: '1910BX',
      category: 'WASHTOWER_COMBO',
      dimensions: {
        height_mm: 1890,
        width_mm: 700,
        depth_mm: 830,
        door_open_90_depth_mm: 1460
      },
      clearance_requirements: {
        top_mm: 110,
        left_mm: 50,
        right_mm: 50,
        rear_mm: 200
      },
      flags: {
        requires_plumbing: true,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/wwt-1910bx.pdf',
        extraction_date: '2026-05-14T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });

  assert.equal(result.summary.categories.washtower_combo, 1);
  assert.equal(result.summary.official_pdf_by_category.washtower_combo, 1);
});

test('final catalog builder keeps unmatched products and reports merge counts', () => {
  const repoRoot = makeRepo();
  const result = buildFinalCatalog({ repoRoot });

  assert.equal(result.summary.total_products, 3);
  assert.equal(result.summary.evidence_files, 1);
  assert.equal(result.summary.merged_products, 1);
  assert.equal(result.catalog.products.length, 3);
  assert.equal(result.catalog.products.find((product) => product.id === 'fridge-arf2964').data_source, 'official_pdf');
  assert.equal(result.catalog.products.find((product) => product.id === 'fridge-similar').data_source, undefined);
  assert.equal(result.catalog.products.find((product) => product.id === 'dryer-1').data_source, undefined);
});

test('runMerge writes data/catalog-final.json and never rewrites public catalog files', () => {
  const repoRoot = makeRepo();
  const publicFridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const before = fs.readFileSync(publicFridgesPath, 'utf8');
  const result = runMerge({ repoRoot });

  assert.equal(result.outputPath, path.join(repoRoot, 'data', 'catalog-final.json'));
  assert.equal(fs.existsSync(result.outputPath), true);
  assert.equal(fs.readFileSync(publicFridgesPath, 'utf8'), before);

  const output = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(output.products.find((product) => product.id === 'fridge-arf2964').data_source, 'official_pdf');
});

test('final catalog builder can add verified discovery products that are not in runtime catalog yet', () => {
  const repoRoot = makeRepo();
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-79153': {
        category: 'washing_machine',
        brand: 'LG',
        model: 'WV5-1408W',
        source_url: 'https://example.com/wv5.pdf',
        discovery: {
          retailer: 'Appliances Online',
          retailer_key: 'appliancesonline',
          product_id: 79153,
          product_url: 'https://www.appliancesonline.com.au/product/lg-wv5-1408w/'
        },
        product: {
          id: 'ao-79153',
          cat: 'washing_machine',
          brand: 'LG',
          model: 'WV5-1408W',
          displayName: 'LG Series 5 8kg Front Load Washing Machine WV5-1408W',
          unavailable: false,
          retailers: [
            { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wv5-1408w/', p: 931 }
          ]
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WV5-1408W.json'), {
    schema_version: 1,
    product_id: 'ao-79153',
    category: 'washing_machine',
    brand: 'LG',
    model: 'WV5-1408W',
    source_url: 'https://example.com/wv5.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'LG',
      sku: 'WV5-1408W',
      category: 'WASHING_MACHINE',
      dimensions: {
        height_mm: 850,
        width_mm: 600,
        depth_mm: 605,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 0,
        left_mm: 0,
        right_mm: 0,
        rear_mm: 150
      },
      flags: {
        requires_plumbing: true,
        ventilation_required: false,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/wv5.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.91
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });
  const discoveryProduct = result.catalog.products.find((product) => product.id === 'ao-79153');

  assert.equal(result.summary.total_products, 4);
  assert.equal(discoveryProduct.data_source, 'official_pdf');
  assert.equal(discoveryProduct.w, 600);
  assert.equal(discoveryProduct.unavailable, false);
  assert.equal(discoveryProduct.retailers[0].n, 'Appliances Online');
  assert.equal(result.summary.official_pdf_by_category.washing_machine, 1);
});

test('final catalog builder preserves third-party dimension evidence without marking it official PDF verified', () => {
  const repoRoot = makeRepo();
  fs.rmSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'));
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-61887': {
        category: 'fridge',
        brand: 'Samsung',
        model: 'SR269MW',
        verified_alias: 'RT29',
        discovery: {
          retailer: 'Appliances Online',
          retailer_key: 'appliancesonline',
          product_id: 61887,
          product_url: 'https://www.appliancesonline.com.au/product/samsung-sr269mw-270l-top-mount-fridge'
        },
        product: {
          id: 'ao-61887',
          cat: 'fridge',
          brand: 'Samsung',
          model: 'SR269MW',
          displayName: 'Samsung SR269MW 270L Top Mount Fridge',
          unavailable: false,
          retailers: [
            { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/samsung-sr269mw-270l-top-mount-fridge', p: 499 }
          ]
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'SR269MW.json'), {
    schema_version: 1,
    product_id: 'ao-61887',
    category: 'fridge',
    brand: 'Samsung',
    model: 'SR269MW',
    data_source: 'third_party_retailer_spec',
    has_pdf_evidence: false,
    source_url: 'https://www.appliancesonline.com.au/product/samsung-sr269mw-270l-top-mount-fridge',
    verified_at: '2026-05-11',
    extracted: {
      brand: 'Samsung',
      sku: 'SR269MW',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1635,
        width_mm: 555,
        depth_mm: 637,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 100,
        left_mm: 50,
        right_mm: 50,
        rear_mm: 50
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: false
      },
      metadata: {
        source_pdf_url: 'https://example.com/samsung-sr269mw-user-manual.pdf',
        extraction_date: '2026-05-11T00:00:00.000Z',
        confidence_score: 0.72,
        verified_alias: 'RT29',
        data_source: 'third_party_retailer_spec',
        has_pdf_evidence: false,
        source_type: 'mixed_retailer_dimensions_pdf_clearance',
        dimension_source: 'Appliances Online specifications tab',
        clearance_source: 'Samsung user manual page 14'
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });
  const product = result.catalog.products.find((row) => row.id === 'ao-61887');

  assert.equal(product.data_source, 'third_party_retailer_spec');
  assert.equal(product.evidence.has_pdf_evidence, false);
  assert.equal(product.evidence.source_type, 'mixed_retailer_dimensions_pdf_clearance');
  assert.equal(product.evidence.dimension_source, 'Appliances Online specifications tab');
  assert.equal(product.evidence.clearance_source, 'Samsung user manual page 14');
  assert.equal(product.evidence.verified_alias, 'RT29');
  assert.equal(product.w, 555);
  assert.equal(product.h, 1635);
  assert.equal(product.d, 637);
  assert.deepEqual(product.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
  assert.equal(result.summary.merged_products, 0);
  assert.equal(result.summary.official_pdf_by_category.fridge, 0);
});

test('final catalog builder keeps distinct product-id matches when normalized SKU tokens collide', () => {
  const repoRoot = makeRepo();
  fs.rmSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'));
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-103181': {
        category: 'washing_machine',
        brand: 'LG',
        model: 'WXLC-1116B-WTP357B',
        discovery: { retailer_key: 'appliancesonline' },
        product: {
          id: 'ao-103181',
          cat: 'washing_machine',
          brand: 'LG',
          model: 'WXLC-1116B-WTP357B',
          unavailable: false
        }
      },
      'ao-103064': {
        category: 'washing_machine',
        brand: 'LG',
        model: 'WTP357B',
        discovery: { retailer_key: 'appliancesonline' },
        product: {
          id: 'ao-103064',
          cat: 'washing_machine',
          brand: 'LG',
          model: 'WTP357B',
          unavailable: false
        }
      }
    }
  });

  const baseEvidence = {
    schema_version: 1,
    category: 'washing_machine',
    brand: 'LG',
    source_url: 'https://example.com/lg.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'LG',
      category: 'WASHING_MACHINE',
      dimensions: {
        height_mm: 360,
        width_mm: 700,
        depth_mm: 790,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 0,
        left_mm: 0,
        right_mm: 0,
        rear_mm: 0
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/lg.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  };
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WTP-357B.json'), {
    ...baseEvidence,
    product_id: 'ao-103181',
    model: 'WXLC-1116B-WTP357B',
    extracted: {
      ...baseEvidence.extracted,
      sku: 'WTP-357B'
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WTP357B.json'), {
    ...baseEvidence,
    product_id: 'ao-103064',
    model: 'WTP357B',
    extracted: {
      ...baseEvidence.extracted,
      sku: 'WTP357B'
    }
  });

  const result = buildFinalCatalog({ repoRoot });

  assert.equal(result.catalog.products.some((product) => product.id === 'ao-103181'), true);
  assert.equal(result.catalog.products.some((product) => product.id === 'ao-103064'), true);
  assert.equal(result.catalog.duplicate_evidence.length, 0);
  assert.equal(result.catalog.unmatched_evidence.length, 0);
});

test('final catalog builder can add verified non-AO discovery products', () => {
  const repoRoot = makeRepo();
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'discovery-fridge-bosch-kfd96axeaa': {
        category: 'fridge',
        brand: 'Bosch',
        model: 'KFD96AXEAA',
        source_url: 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
        discovery: {
          retailer: 'JB Hi-Fi',
          retailer_key: 'jb-hi-fi',
          product_url: 'https://www.jbhifi.com.au/products/bosch-kfd96axeaa'
        },
        product: {
          id: 'discovery-fridge-bosch-kfd96axeaa',
          cat: 'fridge',
          brand: 'Bosch',
          model: 'KFD96AXEAA',
          displayName: 'Bosch 574L Quad Door Refrigerator KFD96AXEAA',
          unavailable: false,
          retailers: [
            { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/bosch-kfd96axeaa', p: null }
          ]
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'KFD96AXEAA.json'), {
    schema_version: 1,
    product_id: 'discovery-fridge-bosch-kfd96axeaa',
    category: 'fridge',
    brand: 'Bosch',
    model: 'KFD96AXEAA',
    source_url: 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'Bosch',
      sku: 'KFD96AXEAA',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1830,
        width_mm: 905,
        depth_mm: 706,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 50,
        left_mm: 5,
        right_mm: 5,
        rear_mm: 50
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.92
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });
  const discoveryProduct = result.catalog.products.find((product) => product.id === 'discovery-fridge-bosch-kfd96axeaa');

  assert.equal(discoveryProduct.data_source, 'official_pdf');
  assert.equal(discoveryProduct.retailers[0].n, 'JB Hi-Fi');
  assert.equal(discoveryProduct.w, 905);
});

test('final catalog builder can add manual catalog entries as archived verified evidence', () => {
  const repoRoot = makeRepo();
  fs.rmSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'));
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'fridge-manual-samsung-srf7300bss': {
        category: 'fridge',
        brand: 'Samsung',
        model: 'SRF7300BSS',
        manual_catalog_entry: true,
        product: {
          id: 'fridge-manual-samsung-srf7300bss',
          cat: 'fridge',
          brand: 'Samsung',
          model: 'SRF7300BSS',
          displayName: 'Samsung SRF7300BSS',
          unavailable: true,
          retailers: []
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'SRF7300BSS.json'), {
    schema_version: 1,
    product_id: 'fridge-manual-samsung-srf7300bss',
    category: 'fridge',
    brand: 'Samsung',
    model: 'SRF7300BSS',
    source_url: 'https://downloadcenter.samsung.com/content/UM/202604/OID38284-04_T-TYPE_RF7000A_EN_260417.pdf',
    verified_at: '2026-05-10',
    extracted: {
      brand: 'Samsung',
      sku: 'SRF7300BSS',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1779,
        width_mm: 912,
        depth_mm: 723,
        door_open_90_depth_mm: 1472
      },
      clearance_requirements: {
        top_mm: 50,
        left_mm: 50,
        right_mm: 50,
        rear_mm: 50
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://downloadcenter.samsung.com/content/UM/202604/OID38284-04_T-TYPE_RF7000A_EN_260417.pdf',
        extraction_date: '2026-05-10T00:00:00.000Z',
        confidence_score: 0.9,
        verified_alias: 'RF59A7010B1/SA'
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });
  const product = result.catalog.products.find((row) => row.id === 'fridge-manual-samsung-srf7300bss');

  assert.equal(product.data_source, 'official_pdf');
  assert.equal(product.unavailable, true);
  assert.equal(product.w, 912);
  assert.equal(product.evidence.verified_alias, 'RF59A7010B1/SA');
  assert.equal(result.summary.unmatched_evidence_files, 0);
});

test('final catalog builder matches discovery evidence to existing catalog products by SKU when AO product id differs', () => {
  const repoRoot = makeRepo();
  fs.rmSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'));
  writeJson(path.join(repoRoot, 'public', 'data', 'fridges.json'), {
    products: [
      {
        id: 'fridge-baf369w',
        cat: 'fridge',
        brand: 'Beko',
        model: 'BAF369W',
        w: 595,
        h: 1714,
        d: 655,
        unavailable: true
      }
    ]
  });
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-80585': {
        category: 'fridge',
        brand: 'Beko',
        model: 'BAF369W',
        discovery: {
          retailer_key: 'appliancesonline'
        },
        product: {
          id: 'ao-80585',
          cat: 'fridge',
          brand: 'Beko',
          model: 'BAF369W',
          unavailable: false
        }
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'BAF369W.json'), {
    schema_version: 1,
    product_id: 'ao-80585',
    category: 'fridge',
    brand: 'Beko',
    model: 'BAF369W',
    source_url: 'https://example.com/baf369w.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'Beko',
      sku: 'BAF369W',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1714,
        width_mm: 595,
        depth_mm: 655,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 50,
        left_mm: 10,
        right_mm: 10,
        rear_mm: 30
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/baf369w.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  });

  const result = buildFinalCatalog({ repoRoot });
  const merged = result.catalog.products.find((product) => product.id === 'fridge-baf369w');

  assert.equal(result.summary.total_products, 2);
  assert.equal(result.summary.merged_products, 1);
  assert.equal(result.summary.unmatched_evidence_files, 0);
  assert.equal(result.catalog.products.some((product) => product.id === 'ao-80585'), false);
  assert.equal(merged.data_source, 'official_pdf');
  assert.equal(merged.evidence.source_url, 'https://example.com/baf369w.pdf');
});
