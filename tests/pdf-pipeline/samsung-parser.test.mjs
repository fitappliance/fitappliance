import test from 'node:test';
import assert from 'node:assert/strict';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';
import {
  extractSamsungDimensions,
  extractSamsungSections,
  parseSamsungText
} from '../../scripts/pdf-pipeline/parsers/samsung.js';

const SOURCE_URL = 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=TEST';
const EXTRACTION_DATE = '2026-05-10T00:00:00.000Z';

test('Samsung parser extracts fridge manual dimensions and clearance from installation section', () => {
  const text = `
    Refrigerator
    User manual
    2L Non-Plumbed Water Dispenser
    Free Standing Appliance
    Step-by-step installation
    STEP 1 Select a site
    Select a site that has adequate room for opening and closing the door.
    Clearance
    See the following figures and tables for space requirements for installation.
    Model RF44A* RF50A* RF49A* RF57A*
    Depth “A” 715 mm 765 mm
    Width “B” 817 mm 817 mm
    Height “C” 1749 mm 1749 mm
    Overall Height “D” 1776 mm 1776 mm
    Model RF44A* RF50A* RF49A* RF57A*
    01 50 mm 50 mm
    02 135° 135°
    03 1393 mm 1393 mm
    04 291 mm 291 mm
    05 625 mm 675 mm
    06 31.5 mm 31.5 mm
    07 1056 mm 1101 mm
    08 1082 mm 1132 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'SRF5300BD', category: 'fridge' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1776,
    width_mm: 817,
    depth_mm: 715,
    door_open_90_depth_mm: 1393
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
  assert.equal(result.data.flags.ventilation_required, true);
  assert.equal(result.data.flags.requires_plumbing, false);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser accepts fridge clearance table phrased as more than 50 mm', () => {
  const text = `
    Refrigerator
    User manual
    STEP 1 Select a site
    Clearance
    See the following figures and tables for installation space requirements.
    Depth “A” 723 mm
    Width “B” 912 mm
    Height “C” 1748 mm
    Overall Height “D” 1779 mm
    01 more than 50 mm
    recommended
    02 125°
    03 1472 mm
    04 282 mm
    05 610 mm
    06 47 mm
    07 1093 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'RF59A7010B1', category: 'fridge' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1779,
    width_mm: 912,
    depth_mm: 723,
    door_open_90_depth_mm: 1472
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser records a verified alias without changing the target SKU', () => {
  const text = `
    Refrigerator
    User manual
    STEP 1 Select a site
    Clearance
    Depth “A” 723 mm
    Width “B” 912 mm
    Height “C” 1748 mm
    Overall Height “D” 1779 mm
    01 more than 50 mm
    03 1472 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'SRF7300BSS', category: 'fridge' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE,
    verifiedAlias: 'RF59A7010B1/SA'
  });

  assert.equal(result.data.sku, 'SRF7300BSS');
  assert.equal(result.data.metadata.verified_alias, 'RF59A7010B1/SA');
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser extracts dryer dimensions and alcove clearance without global regex', () => {
  const text = `
    Heat Pump Dryer
    User manual
    Installation requirements
    Alcove or closet installation
    For alcove or closet installation, the dryer requires the following minimum clearances:
    Sides   Top   Front   Rear
    25 mm   25 mm   490 mm   50 mm
    If installing the dryer with a washing machine, the front of the alcove or closet must have an unobstructed
    air opening of at least 550 mm.
    Specification
    TYPE FRONT LOADING DRYER
    MODEL NAME DV9*BB94**** DV9*BB74****
    DIMENSIONS
    A 600 mm 600 mm
    B 850 mm 850 mm
    C 600 mm 600 mm
    D 650 mm 650 mm
    E 1100 mm 1100 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'DV90BB9440GB', category: 'dryer' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 600,
    door_open_90_depth_mm: 1100
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 25,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
  assert.equal(result.data.flags.ventilation_required, false);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser extracts washer dimensions and alcove clearance from bounded sections', () => {
  const text = `
    Washing Machine
    User manual
    Installation requirements
    Alcove installation
    Minimum clearance for stable operation:
    Sides 25 mm
    Top 25 mm
    Rear 50 mm
    Front 550 mm
    Specification sheet
    Type Front loading washing machine
    Model name WW12BB******
    Dimensions
    Width 600 mm
    Height 850 mm
    Depth 695 mm
    Water pressure 50-800 kPa
    Type Front loading washing machine
    Model name WW90BB******
    Dimensions
    Width 600 mm
    Height 850 mm
    Depth 595 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'WW12BB944DGB', category: 'washing_machine' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 695,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 25,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
  assert.equal(result.data.flags.requires_plumbing, true);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser extracts washer dimensions from A/B/C labelled specification rows', () => {
  const text = `
    Washing Machine
    User manual
    Installation requirements
    Alcove installation
    Minimum clearance for stable operation:
    Sides 25 mm
    Top 25 mm
    Rear 50 mm
    Front 550 mm
    Specification sheet
    Type Front loading washing machine
    Model name WW11CG******
    Dimensions
    A (Width) 600 mm
    B (Height) 850 mm
    C (Depth) 600 mm
    Water pressure 50-800 kPa
    Type Front loading washing machine
    Model name WW90DG******
    Dimensions
    A (Width) 600 mm
    B (Height) 850 mm
    C (Depth) 550 mm
  `;

  const result = parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'WW11CG604DLE', category: 'washing_machine' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 600,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 25,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Samsung parser can read AO fridge spec sheet dimensions but still requires clearance before full parse', () => {
  const text = `
    Specification/Information
    Code SR399WTC
    Customer Code (SAP) RT35K5035WW/SA
    Measurement Specifications
    Height (mm) 1715
    Width (mm) 675
    Depth w. Door (mm) 668
    Depth w/o. Door (mm) 668
  `;
  const sections = extractSamsungSections(text);

  assert.deepEqual(extractSamsungDimensions(sections, 'FRIDGE', 'SR399WTC'), {
    height_mm: 1715,
    width_mm: 675,
    depth_mm: 668,
    door_open_90_depth_mm: null
  });
  assert.throws(() => parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'SR399WTC', category: 'fridge' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  }), /installation section/i);
});

test('Samsung parser can read AO washer net dimensions but still requires installation clearance before full parse', () => {
  const text = `
    SPECIFICATIONS
    Model Code WW90DG6U34LB
    Material Code WW90DG6U34LBSA
    PHYSICAL SPECIFICATION
    Gross Dimension (WxHxD) 670 x 890 x 660 mm
    Net Dimension (WxHxD) 600 x 850 x 595 mm
  `;
  const sections = extractSamsungSections(text);

  assert.deepEqual(extractSamsungDimensions(sections, 'WASHING_MACHINE', 'WW90DG6U34LB'), {
    width_mm: 600,
    height_mm: 850,
    depth_mm: 595,
    door_open_90_depth_mm: null
  });
  assert.throws(() => parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'WW90DG6U34LB', category: 'washing_machine' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  }), /installation section/i);
});

test('Samsung parser fails closed when dishwasher manual lacks explicit clearance figures', () => {
  const text = `
    Dishwasher
    User manual
    Installation requirements
    Cut-out dimension
    There may be a difference depending on the model.
    Specifications
    Model DW60*G750F**
    Type Free Standing
    Dimension
    (Width x Depth x Height) 598 x 600 x 845 mm
  `;

  assert.throws(() => parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'DW60BG750FSL', category: 'dishwasher' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  }), /explicit clearance/i);
});

test('Samsung parser rejects long manuals with dimensions outside installation/spec sections', () => {
  const text = `
    Washing Machine
    User manual
    Cycle table
    Random marketing table 600 mm 850 mm 695 mm.
    Troubleshooting says keep 50 mm away from children toys.
  `;

  assert.throws(() => parseSamsungText(text, {
    target: { brand: 'Samsung', sku: 'WW12BB944DGB', category: 'washing_machine' },
    sourceUrl: SOURCE_URL,
    extractionDate: EXTRACTION_DATE
  }), /layout-aware/i);
});

test('Samsung parser exposes bounded sections for auditability', () => {
  const sections = extractSamsungSections(`
    preamble 600 mm
    Installation requirements
    Alcove installation
    Sides 25 mm Top 25 mm Rear 50 mm
    Specification sheet
    Dimensions
    Width 600 mm Height 850 mm Depth 695 mm
  `);

  assert.match(sections.installation, /Alcove installation/);
  assert.match(sections.specification, /Width 600 mm/);
  assert.doesNotMatch(sections.installation, /preamble/);
});
