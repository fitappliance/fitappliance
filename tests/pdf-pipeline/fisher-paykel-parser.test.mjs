import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { extractText } from '../../scripts/pdf-pipeline/2-extract-text.js';
import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  parseFisherPaykelText,
  parseFisherPaykelPdf
} = require('../../scripts/pdf-pipeline/parsers/fisher-paykel.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDir = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'fisher-paykel');

const fixtures = {
  RF605QNUVX1: {
    category: 'fridge',
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8c666b56/QRG/AU/QRG-AU-26551.pdf',
    expected: {
      dimensions: { height_mm: 1790, width_mm: 905, depth_mm: 688 },
      clearance: { top_mm: 20, left_mm: 20, right_mm: 20, rear_mm: 30 },
      requires_plumbing: true,
      ventilation_required: true
    }
  },
  DW60FC1X3: {
    category: 'dishwasher',
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwb0eba4af/QRG/AU/QRG-AU-84900.pdf',
    expected: {
      dimensions: { height_mm: 850, width_mm: 597, depth_mm: 600 },
      clearance: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
      requires_plumbing: true,
      ventilation_required: false
    }
  },
  DE7060G2: {
    category: 'dryer',
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwe03618a9/QRG/AU/QRG-AU-92278.pdf',
    expected: {
      dimensions: { height_mm: 830, width_mm: 600, depth_mm: 575 },
      clearance: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
      requires_plumbing: false,
      ventilation_required: true
    }
  },
  DH9060H1: {
    category: 'dryer',
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw39d686c0/QRG/AU/QRG-AU-92293.pdf',
    expected: {
      dimensions: { height_mm: 850, width_mm: 600, depth_mm: 655 },
      clearance: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
      requires_plumbing: true,
      ventilation_required: false,
      reversible_door: true
    }
  },
  WH1060P5: {
    category: 'washing_machine',
    sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw86686a71/QRG/NZ/QRG-NZ-92333.pdf',
    expected: {
      dimensions: { height_mm: 850, width_mm: 602, depth_mm: 593 },
      clearance: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
      requires_plumbing: true,
      ventilation_required: false
    }
  }
};

for (const [sku, fixture] of Object.entries(fixtures)) {
  test(`Fisher & Paykel parser extracts strict appliance dimensions for ${sku}`, async () => {
    const pdfPath = path.join(fixtureDir, `${sku}.pdf`);
    const textResult = await extractText(pdfPath);
    const result = parseFisherPaykelText(textResult.text, {
      target: {
        brand: 'Fisher & Paykel',
        sku,
        category: fixture.category
      },
      sourceUrl: fixture.sourceUrl,
      extractionDate: '2026-05-09T00:00:00.000Z'
    });

    assert.equal(result.data.brand, 'Fisher & Paykel');
    assert.equal(result.data.sku, sku);
    assert.deepEqual(result.data.dimensions, {
      ...fixture.expected.dimensions,
      door_open_90_depth_mm: null
    });
    assert.deepEqual(result.data.clearance_requirements, fixture.expected.clearance);
    assert.equal(result.data.flags.requires_plumbing, fixture.expected.requires_plumbing);
    assert.equal(result.data.flags.ventilation_required, fixture.expected.ventilation_required);
    if ('reversible_door' in fixture.expected) {
      assert.equal(result.data.flags.reversible_door, fixture.expected.reversible_door);
    }
    assert.equal(result.data.metadata.source_pdf_url, fixture.sourceUrl);
    assert.ok(result.data.metadata.confidence_score >= 0.82);

    const validation = validateApplianceDimension(result.data);
    assert.equal(validation.valid, true, validation.errors.join('; '));
  });
}

test('Fisher & Paykel parser records warnings when QRG uses a height range', async () => {
  const pdfPath = path.join(fixtureDir, 'DW60FC1X3.pdf');
  const result = await parseFisherPaykelPdf(pdfPath, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'DW60FC1X3',
      category: 'dishwasher'
    },
    sourceUrl: fixtures.DW60FC1X3.sourceUrl,
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.equal(result.data.dimensions.height_mm, 850);
  assert.ok(result.warnings.some((warning) => /range/i.test(warning)));
});

test('Fisher & Paykel parser fails closed when dimensions are absent', () => {
  assert.throws(() => parseFisherPaykelText('QUICK REFERENCE GUIDE > RF0000\nSPECIFICATIONS only', {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RF0000',
      category: 'fridge'
    },
    sourceUrl: 'https://www.fisherpaykel.com/example.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  }), /dimensions/i);
});

test('Fisher & Paykel parser rejects manifest category when QRG text indicates a different appliance type', async () => {
  const pdfPath = path.join(fixtureDir, 'DE7060G2.pdf');
  const textResult = await extractText(pdfPath);

  assert.throws(() => parseFisherPaykelText(textResult.text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'DE7060G2',
      category: 'washing_machine'
    },
    sourceUrl: fixtures.DE7060G2.sourceUrl,
    extractionDate: '2026-05-09T00:00:00.000Z'
  }), /category mismatch/i);
});

test('Fisher & Paykel parser accepts washer dryer combo pages for washing machine manifest rows', () => {
  const text = `
    QUICK REFERENCE GUIDE > WD8560F1
    Washer Dryer Combo
    Front Loader Washer Dryer, 8.5kg wash / 5kg dry
    DIMENSIONS
    Height 850 mm
    Width 600 mm
    Depth 645 mm
    FEATURES
    Condenser Dryer function included.
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'WD8560F1',
      category: 'washing_machine'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-wd8560f1.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.equal(result.data.category, 'WASHING_MACHINE');
  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 645,
    door_open_90_depth_mm: null
  });
});

test('Fisher & Paykel parser treats front-loader washer pages as washing machines even when dryer stacking text appears', () => {
  const text = `
    QUICK REFERENCE GUIDE > WH1260H5
    Series 11 Front Loader Washer, 12kg
    Designed to stack with compatible Fisher & Paykel Dryer models.
    DIMENSIONS
    Height 850 mm
    Width 600 mm
    Depth 675 mm
    FEATURES
    Stacking kit available for Heat Pump Dryer installation.
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'WH1260H5',
      category: 'washing_machine'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-wh1260h5.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.equal(result.data.category, 'WASHING_MACHINE');
  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 675,
    door_open_90_depth_mm: null
  });
});

test('Fisher & Paykel parser records explicit zero-clearance fridge wording without guessing', () => {
  const text = `
    QUICK REFERENCE GUIDE > RS7621SRK1
    Integrated Refrigerator Freezer
    DIMENSIONS
    Height 2134 mm
    Width 756 mm
    Depth 610 mm
    Designed to fit flush with surrounding cabinetry.
    Zero clearance installation when installed according to this guide.
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RS7621SRK1',
      category: 'fridge'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-rs7621srk1.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
  assert.ok(result.warnings.some((warning) => /zero-clearance wording/i.test(warning)));
});

test('Fisher & Paykel parser derives integrated-column clearances from cavity dimensions', () => {
  const text = `
    QUICK REFERENCE GUIDE > RS4621FRJK1
    Integrated Column Freezer
    DIMENSIONS
    Height 2134 mm
    Width 451 mm
    Depth 610 mm
    Installation Dimensions
    Minimum inside width of cabinetry frame 457 mm
    Minimum internal depth of cabinetry 635 mm
    Minimum internal height of cabinetry 2134 mm
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RS4621FRJK1',
      category: 'fridge'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-rs4621frjk1.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 3,
    right_mm: 3,
    rear_mm: 25
  });
  assert.ok(result.warnings.some((warning) => /cavity dimensions/i.test(warning)));
});

test('Fisher & Paykel parser supports legacy spec-sheet dimensions in depth-height-width order', () => {
  const text = `
    SPEC SHEET > E450LXFD1 > Vertical Refrigerator 451L
    E450LXFD1
    Vertical Refrigerator 451L
    Dimensions
    Depth 695mm
    Height 1695mm
    Width 635mm
    Specifications
    Measurements
    Depth - door closed not including handle 695mm
    Height - incl. feet and hinge cap 1695mm
    Minimum air clearance - at rear 30mm
    Minimum air clearance - each side 20mm
    Minimum air clearance - on top 50mm
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'E450LXFD',
      category: 'fridge'
    },
    sourceUrl: 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf',
    extractionDate: '2026-05-10T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1695,
    width_mm: 635,
    depth_mm: 695,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 30
  });
  assert.ok(result.warnings.some((warning) => /spec-sheet/i.test(warning)));
});

test('Fisher & Paykel parser supports integrated fridge data sheets with cavity-derived clearance', () => {
  const text = `
    DATA SHEET
    Model no:
    RS9120WRU1 (with Stainless Door panels PART NO. RD9120WRU)
    Product Dimensions mm
    a Overall height of fridge 2130
    B Overall width of fridge 906
    c Depth of fridge front panels (excl. handles) 19
    D Overall depth of fridge (excl. front door panels) 606
    Clearance Dimensions mm
    Minimum cabinetry gap from edge of product 4
    Overall height of cavity 2134
    Overall width of cavity 914
    Overall minimum depth of cavity 635
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RS9120WRU1',
      category: 'fridge'
    },
    sourceUrl: 'https://dam.fisherpaykel.com/KZ3PKN00/at/st7kprvwb6fg56j9mth6jpm/FP-DataSheet-RS9120WRU1-IntegratedFridgeFreezer-AU-90001400A.pdf',
    extractionDate: '2026-05-10T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 2130,
    width_mm: 906,
    depth_mm: 606,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 4,
    left_mm: 4,
    right_mm: 4,
    rear_mm: 29
  });
  assert.ok(result.warnings.some((warning) => /data-sheet/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /cavity dimensions/i.test(warning)));
});

test('Fisher & Paykel parser still fails closed for fridge clearance when flush wording is ambiguous', () => {
  const text = `
    QUICK REFERENCE GUIDE > RS7621SRK1
    Integrated Refrigerator Freezer
    DIMENSIONS
    Height 2134 mm
    Width 756 mm
    Depth 610 mm
    Premium flush cabinetry aesthetic.
  `;

  assert.throws(() => parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RS7621SRK1',
      category: 'fridge'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-rs7621srk1.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  }), /clearance/i);
});

test('Fisher & Paykel parser supports installation-guide product-dimensions tables', () => {
  const text = `
    INSTALLATION GUIDE
    Front Loader Washer
    Product dimensions
    FRONT PLAN
    MIN. CLEARANCES
    WH1060P/J  WH9060P/J  WH8560F/P/J
    MM MM MM
    E Cavity width  640  640  640
    F Cavity depth  650  650  650
    G Rear  20  20  20
    H Sides***  20  20  20
    I Door to sides  320  320  320
    PRODUCT DIMENSIONS
    WH1060P/J  WH9060P/J  WH8560F/P/J
    MM MM MM
    A Overall height*  850  850  850
    B Overall width  600  600  600
    C Overall depth**  655  655  655
    D Depth of open door  1075  1075  1075
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'WH1060P5',
      category: 'washing_machine'
    },
    sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/WH1060P5-Fisher---Paykel-User-Manual.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 655,
    door_open_90_depth_mm: 1075
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 20
  });
  assert.ok(result.warnings.some((warning) => /installation-guide table/i.test(warning)));
});

test('Fisher & Paykel parser can combine QRG dimensions with installation-guide clearances', () => {
  const text = `
    QUICK REFERENCE GUIDE > RF500QNB1
    Freestanding Quad Door Refrigerator Freezer
    DIMENSIONS
    Height 1790 mm
    Width 790 mm
    Depth 692 mm

    INSTALLATION GUIDE
    Refrigerator
    MIN. CLEARANCES
    RF500QNB1  RF500QNUB1
    MM MM
    G Rear 30 30
    H Sides*** 20 20
    PRODUCT DIMENSIONS
    RF500QNB1  RF500QNUB1
    A Overall height 1790 1790
    B Overall width 790 790
    C Overall depth 692 692
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RF500QNB1',
      category: 'fridge'
    },
    sourceUrl: 'https://www.fisherpaykel.com/qrg-rf500qnb1.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1790,
    width_mm: 790,
    depth_mm: 692,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 30
  });
  assert.ok(result.warnings.some((warning) => /installation-guide table/i.test(warning)));
});

test('Fisher & Paykel parser supports single-column user-manual product tables', () => {
  const text = `
    HEAT PUMP DRYER
    Product dimensions
    PRODUCT DIMENSIONS MM
    A Overall height of product* 845
    B Overall width of product 595
    C Overall depth of product 650
    Length of drain hose 1300
    MINIMUM CLEARANCES MM
    D Minimum cavity width 640
    E Minimum depth clearance (incl. inlet hoses and drain hose) 750
    F Minimum clearance to wall or adjacent product# 20
    G Minimum clearance at the rear of the product 50
    Applies either side.
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'DH8060P3',
      category: 'dryer'
    },
    sourceUrl: 'https://commercial.appliancesonline.com.au/public/manuals/DH8060P3-Fisher---Paykel-User-Manual.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 845,
    width_mm: 595,
    depth_mm: 650,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 50
  });
});

test('Fisher & Paykel parser supports legacy RF610 fridge drawer tables', () => {
  const text = `
    ActiveSmart refrigerator
    RF522W, RF522A, RF610A & RF540A models
    Product dimensions (mm) RF522W RF522A
    RF610/
    RF540A
    A overall height of product 1715 1715 1790
    B overall width of product 790 790 900
    C overall depth of product (excludes handle, includes
    evaporator) 695 695 695
    Minimum clearances
    M side clearance 20 20 20
    N side clearance – hinge side flush with door – full rotation 135 135 135
    O side clearance – hinge side flush with door – 90° rotation 90 90 90
    P rear clearance (incl. evaporator tray) 30 30 30
    Q vent – around top of cupboard (optional) 50 50 50
    R top clearance – above refrigerator cabinet 50 50 50
  `;

  const result = parseFisherPaykelText(text, {
    target: {
      brand: 'Fisher & Paykel',
      sku: 'RF610ANUB5',
      category: 'fridge'
    },
    sourceUrl: 'https://commercial.appliancesonline.com.au/public/manuals/RF610ANUB5-Fisher---Paykel-User-Manual.pdf',
    extractionDate: '2026-05-09T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1790,
    width_mm: 900,
    depth_mm: 695,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 30
  });
});
