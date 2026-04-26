#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { existsSync, statSync } = require('node:fs');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { buildHreflangLinks, buildOgImageMeta } = require('./common/html-head.js');
const { buildArticleSchema, serializeJsonLd } = require('./common/schema-jsonld.js');
const { FIXED_EPOCH_ISO } = require('./common/file-dates.js');

const ARTICLE_SCHEMA_ORIGIN = 'https://fitappliance.com.au';
const GUIDE_DATE_HISTORY = {
  publishedAt: '2026-04-18T12:11:49.000Z',
  modifiedAt: '2026-04-25T00:00:00.000Z'
};

const GUIDE_HUBS = [
  {
    slug: 'dishwasher-cavity-sizing',
    title: 'Dishwasher Cavity Sizing Guide',
    description:
      'Installation-first dishwasher cavity sizing references for Australian kitchens, with links to brand clearance pages, compare pages, and nearby fridge cavity benchmarks.',
    ...GUIDE_DATE_HISTORY
  },
  {
    slug: 'washing-machine-doorway-access',
    title: 'Washing Machine Doorway Access Guide',
    description:
      'Delivery and installation access planning for washing machines across Australian homes, including doorway benchmarks and model-level clearance references.',
    ...GUIDE_DATE_HISTORY
  },
  {
    slug: 'fridge-clearance-requirements',
    title: 'Fridge Clearance Requirements Guide',
    description:
      'A central fridge clearance index covering major Australian brands, side/rear/top spacing differences, and comparison pages for high-intent fit checks.',
    ...GUIDE_DATE_HISTORY
  },
  {
    slug: 'dryer-ventilation-guide',
    title: 'Dryer Ventilation & Safety Guide',
    description:
      'Dryer placement references, ventilation requirements, and cross-links into high-efficiency dryer models and comparison pages for apartment-safe installs.',
    ...GUIDE_DATE_HISTORY
  },
  {
    slug: 'appliance-fit-sizing-handbook',
    title: 'Appliance Fit Sizing Handbook',
    description:
      'Master hub for appliance cavity, doorway, brand, and compare pages. Use this handbook to traverse every FitAppliance sizing resource in one place.',
    ...GUIDE_DATE_HISTORY
  }
];

const GUIDE_SVGS = {
  fridgeCavity: '<svg viewBox="0 0 400 300" aria-label="Fridge cavity clearance diagram"><rect x="70" y="42" width="170" height="215" fill="#f5f5f5" stroke="#333" stroke-width="2"/><rect x="102" y="78" width="106" height="150" fill="none" stroke="#333" stroke-width="2"/><path d="M102 62h106M52 78v150M240 78h42M102 245h106" stroke="#333" stroke-width="2"/><text x="140" y="56" font-family="sans-serif" font-size="11">width</text><text x="30" y="156" font-family="sans-serif" font-size="11">height</text><text x="250" y="72" font-family="sans-serif" font-size="11">side gap</text><text x="123" y="260" font-family="sans-serif" font-size="11">rear depth</text></svg>',
  fridgeDoor: '<svg viewBox="0 0 400 300" aria-label="Fridge door swing diagram"><rect x="92" y="70" width="110" height="150" fill="#f5f5f5" stroke="#333" stroke-width="2"/><path d="M202 70A150 150 0 0 1 330 198M202 70l118 18M202 70v150" stroke="#333" stroke-width="2" fill="none"/><text x="232" y="106" font-family="sans-serif" font-size="11">90 degrees</text><text x="274" y="190" font-family="sans-serif" font-size="11">120 degrees</text><text x="104" y="238" font-family="sans-serif" font-size="11">handle side must clear bench</text></svg>',
  dishwasher: '<svg viewBox="0 0 400 300" aria-label="Dishwasher cavity services diagram"><rect x="88" y="54" width="190" height="190" fill="#f5f5f5" stroke="#333" stroke-width="2"/><rect x="115" y="76" width="136" height="145" fill="none" stroke="#333" stroke-width="2"/><path d="M88 40h190M298 92v112M115 236h136" stroke="#333" stroke-width="2"/><circle cx="305" cy="132" r="10" fill="none" stroke="#333" stroke-width="2"/><circle cx="305" cy="172" r="10" fill="none" stroke="#333" stroke-width="2"/><text x="151" y="35" font-family="sans-serif" font-size="11">600 mm bay</text><text x="316" y="136" font-family="sans-serif" font-size="11">water</text><text x="316" y="176" font-family="sans-serif" font-size="11">power</text></svg>',
  dryer: '<svg viewBox="0 0 400 300" aria-label="Dryer ventilation path diagram"><rect x="50" y="75" width="85" height="130" fill="#f5f5f5" stroke="#333" stroke-width="2"/><path d="M135 135h62M197 135v-55h62" stroke="#333" stroke-width="2" fill="none"/><rect x="258" y="62" width="92" height="38" fill="none" stroke="#333" stroke-width="2"/><rect x="175" y="185" width="75" height="42" fill="none" stroke="#333" stroke-width="2"/><text x="60" y="225" font-family="sans-serif" font-size="11">dryer</text><text x="214" y="78" font-family="sans-serif" font-size="11">duct to wall</text><text x="168" y="242" font-family="sans-serif" font-size="11">drain or tank</text></svg>',
  washer: '<svg viewBox="0 0 400 300" aria-label="Washing machine doorway route diagram"><path d="M52 54h110v70h92v122H52z" fill="#f5f5f5" stroke="#333" stroke-width="2"/><rect x="80" y="162" width="76" height="58" fill="none" stroke="#333" stroke-width="2"/><path d="M52 124h88M140 124a65 65 0 0 1 65 65" stroke="#333" stroke-width="2" fill="none"/><path d="M156 191h88" stroke="#333" stroke-width="2"/><text x="72" y="148" font-family="sans-serif" font-size="11">doorway</text><text x="90" y="237" font-family="sans-serif" font-size="11">washer on trolley</text><text x="212" y="185" font-family="sans-serif" font-size="11">turning space</text></svg>',
  handbook: '<svg viewBox="0 0 400 300" aria-label="Appliance sketches"><g fill="#f5f5f5" stroke="#333" stroke-width="2"><rect x="38" y="58" width="70" height="92"/><rect x="132" y="84" width="72" height="66"/><rect x="228" y="68" width="70" height="82"/><rect x="320" y="78" width="50" height="72"/></g><path d="M38 170h70M132 170h72M228 170h70M320 170h50" stroke="#333" stroke-width="2"/><g font-family="sans-serif" font-size="11"><text x="42" y="188">fridge</text><text x="126" y="188">washer</text><text x="228" y="188">dish</text><text x="318" y="188">dryer</text></g></svg>'
};

const GUIDE_ARTICLES = {
  'fridge-clearance-requirements': {
    title: "How much clearance does my fridge actually need? An Australian buyer's guide",
    description: 'Measure the fridge cavity, ventilation gaps, door swing, and delivery route before you buy. This guide explains the Australian fit checks that matter most before delivery day.',
    intro: [
      'A fridge can fit the bare cavity measurement and still be the wrong appliance. The mistake usually shows up after delivery, when the cabinet is too tight for ventilation, the handle hits a bench, or the box cannot turn through the hallway. This guide treats fit as an installation question, not a product-card number.',
      'Use it before you shortlist models. Measure the open space, add the brand-specific gaps, check the door swing, then walk the delivery path from the truck to the kitchen. If any one of those checks fails, the fridge is not a good match for that cavity.'
    ],
    figures: [
      { svg: GUIDE_SVGS.fridgeCavity, caption: 'Fridge cavity clearance is a mix of product width, height, depth, rear breathing space, and side gaps.' },
      { svg: GUIDE_SVGS.fridgeDoor, caption: 'Door swing can matter as much as width when the fridge sits beside a wall, pantry, or stone bench.' }
    ],
    sections: [
      {
        heading: 'Why clearance matters',
        paragraphs: [
          'Clearance is the empty air a fridge needs around the cabinet. It lets heat leave the condenser area and gives the doors room to open without scraping cabinetry. A tight install can also make the fridge noisy because the compressor works harder in a warm pocket.',
          'The fit question is therefore not simply “is the fridge 600 mm wide?” It is “does a 600 mm wide fridge plus the required side, rear, and top gaps fit the space I actually have?” That second question is the one many Australian retail pages leave to the buyer.'
        ]
      },
      {
        heading: 'The 3 dimensions you must measure',
        paragraphs: [
          'Measure the cavity width at the front and back, the height at both sides, and the usable depth from the rear wall to the front edge of the cabinetry. Older kitchens are often out by 5 mm to 15 mm, especially where a tiled floor has been added after the cabinets.',
          'When you enter dimensions into FitAppliance, the width, height, and depth checks are compared against product dimensions and the tolerance you choose. A 5 mm tolerance is useful when your tape measure reading is close but not exact. It is not a substitute for required ventilation space.'
        ]
      },
      {
        heading: 'Brand-specific clearance: what changes',
        paragraphs: [
          'Different fridge designs shed heat in different places. Some brands ask for larger top clearance; others focus on side or rear airflow. In the FitAppliance data, Samsung fridge guidance includes a 100 mm top clearance in the relevant rules, while Haier examples include 25.4 mm clearances around the cabinet.',
          'Those numbers are not decoration. If your cavity is 1,800 mm high and a fridge needs 100 mm above it, a 1,760 mm model is too tall even though the bare product height looks close. A model with a 20 mm top requirement may be possible in the same space.'
        ]
      },
      {
        heading: 'Side, rear, and top clearance: what each does',
        paragraphs: [
          'Side clearance gives the cabinet and door seals breathing room. Rear clearance helps warm air move away from the compressor area. Top clearance is important when the fridge is boxed in under overhead cupboards because hot air can otherwise collect above the appliance.',
          'If one gap has to be tight, do not guess. Read the installation manual for the exact model and measure the usable space again. A fridge that technically slides in but blocks the intended airflow is not a good install.'
        ]
      },
      {
        heading: 'Door swing radius: the dimension everyone forgets',
        paragraphs: [
          'A fridge door needs space in front and beside the cabinet. A 90 degree opening may be enough for everyday use, but some crisper drawers need a wider 110 degree or 120 degree swing before they can slide out fully.',
          'Before you buy, stand at the cavity and imagine the handle side of the door opening into the room. Check nearby walls, pantry doors, island benches, and dishwasher handles. If a wall sits directly beside the hinge or handle side, door swing should be treated as a hard constraint.'
        ]
      },
      {
        heading: "Doorway delivery: the moment you discover the new fridge can't enter",
        paragraphs: [
          'The delivery route is separate from the kitchen cavity. Measure the narrowest doorway, hallway turn, stair landing, and lift door. The product may be able to enter on its side, but only if one of its dimensions is smaller than the narrowest point and the delivery team can rotate it safely.',
          'On delivery day, a fridge that cannot turn at the front door becomes a costly problem: missed delivery, repacking, return fees, or a second model search. FitAppliance includes a doorway check because this failure happens before the appliance ever reaches the kitchen.'
        ]
      },
      {
        heading: 'A measuring checklist before you buy',
        paragraphs: [
          'Use the same tape measure for every reading and write down the smallest value, not the neatest one. Photograph the cavity with the tape in frame if someone else will order the appliance. This gives you a quick record if the retailer asks why a model was rejected.',
          'Also check power-point location, water connection if the fridge has an ice maker, skirting boards, and floor slope. A cavity that is 700 mm wide at eye level may be 690 mm wide near the floor if trim or tiles intrude.'
        ]
      },
      {
        heading: 'What to do if the cavity is non-standard',
        paragraphs: [
          'If the space is narrow, sort by width first and then check the top and rear clearances. If the space is shallow, look for models with flat backs and note that handles can add practical depth even when the listed cabinet depth is acceptable. Keep at least one backup model on your shortlist in case the final manual check rules out your first choice.',
          'For very tall but narrow spaces, a bottom-mount or top-mount fridge may be easier than a French-door model. If the cavity is boxed in on three sides, favour models with clearer installation guidance rather than forcing a fashionable shape into a difficult opening.'
        ]
      }
    ],
    checklist: [
      'Measure width at front and back of the cavity.',
      'Measure height on both sides under overhead cupboards.',
      'Measure usable depth to the cabinetry front, not to the wall only.',
      'Add side, rear, and top clearances from the model manual.',
      'Check door swing against nearby walls, benches, and handles.',
      'Measure the narrowest delivery point before ordering.'
    ],
    table: {
      caption: 'Fridge fit checks to record before ordering',
      headers: ['Check', 'What to record', 'Why it matters'],
      rows: [
        ['Cavity', 'Smallest W/H/D reading', 'Cabinets are often not square'],
        ['Clearance', 'Brand side, rear, top gaps', 'Protects ventilation and warranty conditions'],
        ['Door swing', '90 to 120 degree opening path', 'Drawers and shelves may need extra swing'],
        ['Delivery', 'Narrowest doorway or hallway turn', 'Prevents a failed delivery before installation']
      ]
    }
  },
  'dishwasher-cavity-sizing': {
    title: 'Built-in dishwasher cavity sizing: the 600mm trap',
    description: 'A practical Australian guide to measuring dishwasher cavities, planning service access, and avoiding the small gaps that make a 600mm appliance hard to install in an existing kitchen with finished floors, cabinets, plumbing, and power already fixed.',
    intro: [
      'Built-in dishwashers look standard until a real kitchen cavity proves otherwise. A 600 mm appliance can still be awkward when the cabinet sides are swollen, the floor kicks up at the back, or the plumbing sits exactly where the machine needs to slide.',
      'This guide is for the moment before you order. It explains the difference between the opening in your cabinetry and the product dimensions in the listing, then walks through services, door panels, and the common traps that make a simple swap harder than expected.'
    ],
    figures: [
      { svg: GUIDE_SVGS.dishwasher, caption: 'A dishwasher bay needs appliance space plus a clear path for water, drain, and electrical services.' }
    ],
    sections: [
      {
        heading: 'AU standard dishwasher dimensions',
        paragraphs: [
          'Most full-size Australian built-in dishwashers target a 600 mm wide bay. Slimline models are usually around 450 mm wide. Height often sits near the 820 mm to 870 mm range because adjustable feet are used to align the dishwasher under the benchtop.',
          'Those numbers are starting points, not permission to skip measuring. Measure the width between cabinet walls, the height from finished floor to underside of bench, and the depth to any pipes or power points at the rear.'
        ]
      },
      {
        heading: 'Cavity vs product dimensions',
        paragraphs: [
          'The product dimension describes the metal box. The cavity dimension describes the space available after tiles, cabinet lips, screw heads, trim, hoses, and floor slope are considered. A product that is 598 mm wide can still scrape if the opening is 600 mm at the front but 594 mm at the back.',
          'When the dishwasher is replacing an old unit, pull the old door open and inspect the sides. Swollen particleboard, loose kickboards, or a raised tile edge can steal a few millimetres exactly where the new machine needs clearance.'
        ]
      },
      {
        heading: 'Plumbing and electrical access',
        paragraphs: [
          'A dishwasher usually needs a water inlet, drain hose, and power access. The best cavity has a service path through the neighbouring sink cabinet so hoses can run without being crushed behind the appliance.',
          'If the power point is directly behind the dishwasher, measure the plug depth as well as the machine depth. Before you buy, check whether the hose length reaches the tap and drain without stretching. A neat product fit can still fail if the services cannot reach safely.'
        ]
      },
      {
        heading: 'Integrated, freestanding, and semi-integrated models',
        paragraphs: [
          'Freestanding dishwashers bring their own finished front and top panel. Built-in models are intended to sit under the bench. Fully integrated models hide behind a cabinet panel, while semi-integrated models keep the control strip visible.',
          'The more integrated the design, the more the door panel matters. Panel thickness, handle placement, and toe-kick clearance can affect how the door opens. If you are replacing a freestanding unit with an integrated one, treat it as a cabinetry job, not just an appliance swap.'
        ]
      },
      {
        heading: 'Door panel weight and hinge specification',
        paragraphs: [
          'Integrated dishwashers have hinge limits. A heavy timber or stone-look panel can exceed the door spring range even if the appliance fits the opening. The result is a door that drops too quickly, refuses to stay partly open, or pulls against the cabinetry.',
          'Read the installation manual for the panel weight range before ordering the door front. If the manual gives a minimum and maximum panel height, use those numbers rather than assuming your existing cabinet door will transfer across.'
        ]
      },
      {
        heading: 'Real measuring steps',
        paragraphs: [
          'Measure the bay width at the top, middle, and bottom. Measure height at the left and right. Measure depth at the floor and at the service zone. If the floor slopes, use the smallest height reading and check whether the appliance feet can compensate.',
          'When the opening is close to 600 mm, write down the exact reading in millimetres. “About 600” is not useful when the product is 598 mm and the cabinet is slightly bowed. A 2 mm difference can decide whether installation is smooth or forced.'
        ]
      },
      {
        heading: 'Common installation errors',
        paragraphs: [
          'The most common error is measuring the front of the cabinet only. The second is forgetting that hoses and plugs need space. The third is assuming a previous dishwasher proves the cavity is standard. Older units may have been smaller, less insulated, or installed before the flooring changed.',
          'If you are renovating, leave the final appliance order until the finished floor and cabinets are known. Cabinet plans and installed cabinets are not always identical, and appliance returns are slower than adjusting a drawing.'
        ]
      },
      {
        heading: 'When the bay is close to the limit',
        paragraphs: [
          'A tight dishwasher bay needs a conservative decision. If the opening is 600 mm and the product is listed at 598 mm, inspect the side walls for screw heads, bowed cabinet panels, and laminate edges. Also check whether the adjustable feet can be reached after the machine is partly installed.',
          'When you are within 5 mm of the listed product width, contact the installer or retailer with your exact measurements before delivery. Ask whether they need the old machine removed first, whether the kickboard must come off, and whether they will refuse the install if services sit behind the appliance. Those answers matter more than a neat product-card width.',
          'If you are replacing a dishwasher in a rental or apartment, take photos of the water tap, drain spigot, and power point. The person approving the purchase may not be the person standing in the kitchen, and a quick photo prevents vague descriptions turning into the wrong model.',
          'A second useful check is the door drop. Open the existing dishwasher or hold a tape measure where the new door will fall. Make sure the open door does not hit the opposite cabinet, an island bench, a pantry handle, or the toe of a person standing at the sink. A built-in machine that fits the bay but blocks the walkway every night is still the wrong fit.',
          'If you are comparing two close models, prefer the one with clearer installation drawings. A product sheet that shows hose exits, adjustable foot range, and panel limits gives you something to verify. A listing that only says “600 mm dishwasher” leaves too many practical questions unanswered.',
          'Finally, check who is responsible for final connection. Some deliveries place the machine in the room but do not alter plumbing, electrical outlets, or cabinet trim. If your bay needs a hole widened, a tap moved, or a kickboard cut, organise that trade before the dishwasher arrives. Keep the installer notes with your receipt folder.'
        ]
      }
    ],
    checklist: [
      'Measure the bay at top, middle, bottom, left, and right.',
      'Confirm whether the model is freestanding, built-in, semi-integrated, or fully integrated.',
      'Check water inlet, drain, and power access before ordering.',
      'Read panel weight limits for integrated doors.',
      'Measure toe-kick and plinth space if cabinetry is custom.',
      'Allow enough hose path so services are not crushed behind the unit.'
    ],
    table: {
      caption: 'Dishwasher sizing reference',
      headers: ['Dishwasher type', 'Common width', 'Main fit risk'],
      rows: [
        ['Full-size built-in', 'About 600 mm', 'Rear services and cabinet squareness'],
        ['Slimline', 'About 450 mm', 'Limited model range and panel matching'],
        ['Fully integrated', 'About 600 mm', 'Panel weight, hinge range, toe-kick'],
        ['Freestanding', 'About 600 mm', 'Top panel and visible side clearance']
      ]
    }
  },
  'dryer-ventilation-guide': {
    title: 'Vented vs heat pump vs condenser: matching the dryer to your laundry',
    description: 'A plain-English guide to dryer ventilation, laundry space, stacking, and apartment-friendly dryer choices in Australian homes with tight laundries, cupboards, garages, and shared walls.',
    intro: [
      'Dryers fail in laundries for different reasons than fridges and dishwashers. The appliance may fit the floor space but still be wrong because it needs a duct, a drain, a water tank, or enough room air to work efficiently.',
      'This guide compares vented, heat pump, and condenser dryers through the lens of fit. It is not a product review. It is a way to decide whether your laundry, apartment, garage, or cupboard can support the dryer type you are considering.'
    ],
    figures: [
      { svg: GUIDE_SVGS.dryer, caption: 'Dryer fit depends on airflow, ducting, drain access, and whether the appliance is stacked or freestanding.' }
    ],
    sections: [
      {
        heading: 'The 3 dryer types',
        paragraphs: [
          'A vented dryer pushes moist air outside or into the room. A condenser dryer captures moisture into a tank or drain hose. A heat pump dryer recycles warm air inside the machine and usually uses less energy, but it still needs enough surrounding air and cleaning access.',
          'The right type depends on where the dryer will live. A garage wall with an exterior vent suits a vented dryer. A small apartment cupboard may suit a heat pump or condenser model better, provided the manual allows that installation.'
        ]
      },
      {
        heading: 'Vented dryer: ducting requirements',
        paragraphs: [
          'A vented dryer is simple and often cheaper, but it needs a path for damp air. If you can duct directly through an external wall, measure the route and keep bends short. Long flexible ducts collect lint and reduce airflow.',
          'When a vented dryer exhausts into a laundry, the room can become humid quickly. That can affect paint, cupboards, and nearby stored items. If you rent, check whether cutting a wall vent is allowed before choosing this type.'
        ]
      },
      {
        heading: 'Heat pump dryer: room ventilation in practice',
        paragraphs: [
          'Heat pump dryers do not usually need an external duct, which makes them attractive for apartments. They still produce some heat, need filter access, and often require a minimum room volume or door gap stated in the manual.',
          'If the dryer will sit in a closed cupboard, check both the clearance around the appliance and the cupboard ventilation. When the laundry door must stay shut, a heat pump model with clear cupboard guidance is safer than guessing.'
        ]
      },
      {
        heading: 'Condenser dryer: water tank or drain hose',
        paragraphs: [
          'A condenser dryer removes water from the air and stores it in a tank or sends it to a drain. Tank models need regular emptying, so leave room to pull the tank out. Drain-hose models need a reachable outlet.',
          'Before you buy, decide which water path you will use. A dryer that fits a stacked frame can still be annoying if the tank is too high to empty comfortably or the drain hose cannot reach.'
        ]
      },
      {
        heading: 'Stacking with a washing machine',
        paragraphs: [
          'Stacking saves floor space but adds another fit check. The washer must be stable, the dryer must match the stacking kit, and the combined height must leave room for controls, doors, shelves, and safe lifting.',
          'Many laundry cupboards are tight at the top because a hot-water shelf or wall cabinet sits above the appliances. Measure the full stack height, not just the dryer. Also check whether the dryer door opens away from the washer door path.'
        ]
      },
      {
        heading: 'Apartment, house, or townhouse decision tree',
        paragraphs: [
          'In a detached house with an external laundry wall, a vented dryer can be practical if ducting is short and legal. In an apartment without wall access, heat pump or condenser models usually make more sense. In a townhouse laundry under stairs, measure both height and airflow path carefully.',
          'If your laundry is also a hallway or bathroom cupboard, choose the dryer type by the installation manual first and price second. A bargain vented dryer can be the wrong choice if there is nowhere sensible for the moist air to go.'
        ]
      },
      {
        heading: 'Energy stars and running cost',
        paragraphs: [
          'Energy star ratings help compare efficiency, but the installation still matters. A high-star dryer placed in a closed, hot cupboard may run longer than expected. A lower-star vented dryer may cost more over time if it is used heavily.',
          'For a household drying 3 loads a week, the difference between a basic vented model and an efficient heat pump can add up over several years. Use the star rating as one input, then check whether the laundry can support the dryer type.'
        ]
      },
      {
        heading: 'Clearance around the appliance',
        paragraphs: [
          'Dryer clearance is often less visible than fridge clearance because the machine may sit in a laundry corner or stacked frame. Still, the sides, back, and front need room for vibration, airflow, filter access, and safe servicing. If a manual gives a minimum side gap or cupboard opening, use that number rather than copying the old dryer position.',
          'When a dryer is installed above a washer, the front edge of both machines should be reachable without stretching over a sink or toilet. Leave space to remove lint filters, empty a condenser tank, and reach the power switch. A dryer that technically fits but cannot be cleaned easily will become less safe over time.',
          'If your laundry has a sliding door, measure with the door in its normal open position. Some sliding doors overlap the opening and reduce the real access width by 20 mm or more. That can matter when the dryer needs to come out for cleaning or repair.',
          'For garages and outdoor laundries, also think about dust, pets, and weather. A vented dryer near an open roller door may have plenty of air, but it can also pull dusty air through filters. A heat pump model in a cold garage may take longer than expected. The best dryer type is the one that matches the room it will actually live in, not the one that looks neatest in a comparison table.',
          'If the dryer will share a laundry with storage shelves, leave a working zone in front of it. You need space to open the door, remove lint, pull a tank, and stand with a laundry basket. A machine squeezed behind baskets or cleaning supplies will be harder to maintain.',
          'Also check how noise travels from the laundry. A dryer in a hallway cupboard may measure correctly but still be unpleasant if it runs beside bedrooms at night. Vent path, door seals, and vibration pads are fit questions too because they affect where the appliance can sensibly live. Write those room notes beside the measurements before comparing final prices and delivery options at home. Noise can be a fit issue for nearby neighbours too.'
        ]
      }
    ],
    checklist: [
      'Identify the dryer type before checking dimensions.',
      'Measure floor space, door swing, and any stacking height.',
      'Check whether a vent, drain, or water tank path is needed.',
      'Read the manual for cupboard ventilation and side gaps.',
      'Confirm filter and tank access after installation.',
      'Measure the delivery route, especially stairs and tight laundries.'
    ],
    table: {
      caption: 'Dryer type fit comparison',
      headers: ['Dryer type', 'Moisture path', 'Best suited to'],
      rows: [
        ['Vented', 'Duct or room exhaust', 'Laundries with external wall access'],
        ['Condenser', 'Tank or drain hose', 'Homes without a simple wall vent'],
        ['Heat pump', 'Closed-loop with filters', 'Apartments and energy-conscious households'],
        ['Stacked dryer', 'Depends on type', 'Small laundries with safe vertical clearance']
      ]
    }
  },
  'washing-machine-doorway-access': {
    title: 'Will your new washing machine fit through the doorway?',
    description: 'A delivery-first guide to checking doorway, hallway, lift, stair, and laundry access before ordering a washing machine for a tight home, townhouse, or apartment laundry.',
    intro: [
      'A washing machine can match the laundry dimensions and still fail on delivery. The box may not turn through the hallway, the trolley may catch on a step, or the machine may be too deep to rotate into a European laundry.',
      'This guide puts the delivery route first. Measure the path from the front door to the laundry, then measure the laundry cavity. If the appliance cannot reach the room, every other fit calculation is academic.'
    ],
    figures: [
      { svg: GUIDE_SVGS.washer, caption: 'Doorway access depends on the machine, trolley, turning space, and the smallest opening along the route.' }
    ],
    sections: [
      {
        heading: 'Why this matters',
        paragraphs: [
          'Returns are frustrating because a washing machine is heavy, boxed, and hard to repack. A failed delivery can mean a second appointment, a restocking fee, or a rushed replacement model. It is much easier to rule out oversized machines before ordering.',
          'When you measure, think like the delivery team. They need enough width for the appliance, their hands, protective packaging, and sometimes a stair trolley. A bare machine dimension is not the whole delivery dimension.'
        ]
      },
      {
        heading: 'Standard Australian access points are not guaranteed',
        paragraphs: [
          'Many internal doorways fall somewhere around 720 mm to 820 mm clear opening, but older homes, apartment laundries, and renovated bathrooms vary. Hallway width, door stops, handles, and skirting boards can reduce the usable path.',
          'Do not rely on “standard door” assumptions. Open each door fully and measure the clear space between the tightest points. If the door can be lifted off its hinges, note that as a possible last step, not as the default plan.'
        ]
      },
      {
        heading: 'Pre-purchase checklist',
        paragraphs: [
          'Start outside. Measure the front door, the tightest hallway, any stair landing, the lift door if you are in an apartment, and the laundry entry. Write the smallest number down. That is the doorway number to compare against the machine.',
          'Then measure turning zones. A machine can pass through a 760 mm doorway and still fail if there is no room to rotate at the end of a corridor. Before you buy, stand where the turn happens and trace the path with the tape extended.'
        ]
      },
      {
        heading: 'Front loader vs top loader',
        paragraphs: [
          'Front loaders are often wider and deeper but shorter. Top loaders are often taller and may need lid clearance above the machine. For delivery, the deciding dimension is the smallest side that can safely pass through the narrowest opening.',
          'For use after installation, front loader door swing matters. A front loader placed in a tight cupboard may fit the cavity but block the hallway when the door is open. A top loader under a shelf may fit the floor space but fail the lid-opening check.'
        ]
      },
      {
        heading: 'Packaging and removable doors',
        paragraphs: [
          'Retailers often deliver machines in packaging, and packaging can add several centimetres. Ask whether the delivery team can unbox at the threshold if needed. Some homes require that, but it should be planned rather than improvised.',
          'Removing a laundry or bathroom door can help, but it is not always enough. Hinges, architraves, and the machine depth still matter. If a door must be removed, decide who will do it before delivery day.'
        ]
      },
      {
        heading: 'Apartment lifts and stairs',
        paragraphs: [
          'Apartment deliveries add lift depth, lift door width, corridor turns, and loading dock access. Measure the lift door and inside depth, then check whether the machine can be rotated without hitting the control panel or door glass.',
          'For stairs, the landing is often the problem. A straight stair may be easy; a half landing with a tight turn may not be. If the path includes stairs, give the retailer the measurements rather than assuming a standard delivery covers it.'
        ]
      },
      {
        heading: 'When the numbers are close',
        paragraphs: [
          'If the smallest access point is within 10 mm of the machine dimension, treat it as risky. Wall angles, packaging, hand space, and trolley straps can use that margin quickly. Look for a slightly smaller model or confirm delivery conditions in writing.',
          'When the laundry cavity is also tight, choose the machine that passes both tests with breathing room: delivery access first, then installed fit, then door or lid clearance. The best appliance is the one that reaches the room and works once it is there.'
        ]
      },
      {
        heading: 'How to talk to the retailer before delivery',
        paragraphs: [
          'Good delivery notes are specific. Instead of writing “tight stairs,” write “740 mm hallway, 680 mm bathroom doorway, 920 mm stair landing, 1 flight.” This tells the delivery team what equipment and staffing they may need before they arrive.',
          'If the old washer is still installed, say whether it needs removal and whether taps are accessible. If the route includes a lift, record the lift door width, internal depth, and whether bookings are required by building management. Apartment managers often need a delivery window, padding, or a loading dock booking.',
          'When a retailer says delivery is standard, ask what happens if the machine cannot be carried through the route you measured. You want to know whether the order can be changed before dispatch, whether extra handling fees apply, and whether packaging can be removed at the threshold.',
          'If the delivery route is borderline, choose a model with a little more margin rather than hoping the team can force it through. Washing machines are dense, awkward, and easy to damage when tilted in a tight corridor. A smaller model that arrives safely is usually better than a larger model that needs an improvised lift, twist, or doorway removal on the day.',
          'It also helps to mark hazards in advance. Move shoe racks, rugs, pot plants, and laundry baskets before the driver arrives. If the path includes timber floors or tight plaster corners, prepare protection. The goal is not only to fit the machine through the route, but to do it without damaging the home.',
          'After the machine reaches the laundry, repeat the access check for future servicing. A washer boxed tightly between a sink and wall may be difficult to pull forward if a hose leaks. Leave enough working room for the next person who has to inspect, level, repair, or remove it later. Future access matters too, especially in small apartment laundries with narrow storage doors.'
        ]
      }
    ],
    checklist: [
      'Measure front door, hallway, lift, stair landing, and laundry entry.',
      'Record the smallest clear opening, not the average opening.',
      'Measure turning space at corridor ends and stair landings.',
      'Check whether packaging adds width or depth.',
      'Confirm front-loader door swing or top-loader lid clearance.',
      'Plan door removal before delivery if it is likely to be needed.'
    ],
    table: {
      caption: 'Washing machine access reference',
      headers: ['Access point', 'What to measure', 'Common issue'],
      rows: [
        ['Doorway', 'Clear opening in mm', 'Door stops and handles reduce space'],
        ['Hallway', 'Width plus turning zone', 'Machine cannot rotate at the laundry'],
        ['Lift', 'Door width and internal depth', 'Control panel hits lift wall'],
        ['Laundry cavity', 'W/H/D and door swing', 'Fits delivery path but not daily use']
      ]
    }
  },
  'appliance-fit-sizing-handbook': {
    title: 'The complete handbook to measuring for new appliances',
    description: 'A category-by-category measuring handbook for fridges, dishwashers, washing machines, and dryers before you order a new appliance.',
    intro: [
      'Most appliance mistakes start with one measurement written down too confidently. A cavity looks square, a product card looks clear, and then the installer finds the missing 20 mm. This handbook gives you a repeatable way to measure before you spend money.',
      'FitAppliance covers about 2,170 products across four categories: fridges, dishwashers, washing machines, and dryers. The tool is useful, but the result is only as good as the measurements you enter. Use this guide to collect those measurements properly.'
    ],
    figures: [
      { svg: GUIDE_SVGS.handbook, caption: 'The same measuring habit applies across fridges, dishwashers, washing machines, and dryers: cavity first, access route second, manual-specific clearance third.' }
    ],
    sections: [
      {
        heading: 'The cost of getting it wrong',
        paragraphs: [
          'A wrong appliance size costs time before it costs money. You lose the delivery window, negotiate a return, search again, and may live with an empty cavity while the replacement is arranged. If the appliance has been unboxed, the return can become harder.',
          'The cheapest fix is a better measurement routine. Spend 20 minutes with a tape measure, note the tightest points, and check the manual-specific clearances before clicking buy. That small pause can prevent a heavy object from becoming a household problem.'
        ]
      },
      {
        heading: 'Tools you need',
        paragraphs: [
          'Use a tape measure that reads in millimetres, a notepad or phone note, a torch, and a second person if the cavity is tall or awkward. For narrow spaces, a rigid ruler can help check skirting boards and trim that a flexible tape misses.',
          'Photograph each measurement with the tape visible. This is not about making a perfect record; it is about avoiding “I think it was 700 mm” later. If someone else orders the appliance, photos reduce mistakes.'
        ]
      },
      {
        heading: 'Universal measurement principles',
        paragraphs: [
          'Measure width, height, and depth in more than one place. Use the smallest reading. Check the installed finish, not the drawing. Include trim, tiles, power points, hoses, handles, skirting boards, and overhead shelves.',
          'Then add a tolerance. FitAppliance lets you test a 5 mm tolerance because household measurements are rarely perfect. A tolerance helps with tape-measure uncertainty; it does not override brand-specific clearance rules or safe delivery access.'
        ]
      },
      {
        heading: 'Four category overview',
        paragraphs: [
          'Fridges need ventilation and door swing checks. Dishwashers need cavity and service checks. Washing machines need delivery route and lid or door clearance. Dryers need airflow, drain, tank, or duct planning depending on type.',
          'When you use the same measurement method across categories, the comparison becomes easier. The appliance changes, but the discipline stays the same: real cavity, real route, real manual requirement.'
        ]
      },
      {
        heading: 'Brand-specific differences quick reference',
        paragraphs: [
          'Brand-specific clearance matters most for fridges, but the idea applies elsewhere too. Samsung fridge examples can need 100 mm top clearance, while Haier examples include 25.4 mm cabinet gaps. Dishwasher panel weights and dryer cupboard ventilation are also model-specific.',
          'If a product page says only width, height, and depth, treat that as incomplete. The installation manual is the source for the extra numbers that decide whether the appliance will work in your home.'
        ]
      },
      {
        heading: 'When to use FitAppliance',
        paragraphs: [
          'Use FitAppliance after you have measured the cavity and delivery route. Enter the category, dimensions, tolerance, and any doorway limit, then filter the result list by brand, price, stars, and availability if you want a shorter shortlist.',
          'The tool does not replace reading the final manual before purchase. It narrows the field so you spend your attention on models that are plausible for your space instead of browsing every appliance in the catalogue.'
        ]
      },
      {
        heading: 'Common pitfalls',
        paragraphs: [
          'Do not measure an old appliance and assume the new one can use the same space. The old model may have different rear clearance, smaller handles, or a door that opens differently. Measure the cavity itself.',
          'Do not forget the floor. Tiles, timber transitions, and uneven slabs can change the height or make levelling harder. Do not forget daily use either: a machine that fits while closed can still block a walkway when open.'
        ]
      },
      {
        heading: 'After you measure',
        paragraphs: [
          'Write your final values as a short list: cavity width, cavity height, cavity depth, narrowest doorway, and any known service limits. Keep the list while shopping. If a model is close, check the manual before adding it to the cart.',
          'If the numbers are uncomfortable, choose a smaller appliance rather than forcing a borderline one. The right fit is the model you can deliver, install, ventilate, open, clean, and use without treating every laundry day or grocery shop as a tight manoeuvre.'
        ]
      },
      {
        heading: 'How to compare two close models',
        paragraphs: [
          'When two appliances both pass the basic fit check, compare the constraint that made the search difficult. For a fridge, that may be top clearance or door swing. For a dishwasher, it may be hose routing. For a washing machine, it may be lift depth. For a dryer, it may be ventilation and filter access.',
          'Then look at the everyday task, not just the delivery day. Can the fridge drawers open with the island behind you? Can the dishwasher door drop without hitting the opposite cabinet? Can the washer door open far enough to load towels? Can the dryer filter be cleaned without moving the stack?',
          'This is where a slightly smaller appliance can be the better product. A 10 mm or 20 mm margin may sound minor in a catalogue, but in a tight laundry or kitchen it can be the difference between normal use and constant irritation.',
          'If you still cannot decide, save both measurements and compare the manuals side by side. Look for the hidden installation work: extra panel limits, plumbing locations, duct length, stacking kit compatibility, and cleaning access. The appliance with fewer hidden conditions is often easier to live with, even if another model has one more feature on the retail page.',
          'After purchase, keep the measurement notes until installation is complete. They are useful if the installer asks why a certain gap was allowed, or if a replacement model is needed later. Good measurements are not just shopping notes; they become the record of why that appliance was chosen for that space.'
        ]
      }
    ],
    checklist: [
      'Measure W/H/D at more than one point and keep the smallest reading.',
      'Measure the narrowest delivery route before checking product style.',
      'Read the installation manual for clearance, panel, duct, or hose limits.',
      'Use a 5 mm tolerance only for measurement uncertainty.',
      'Check daily-use clearance: door swing, lid lift, drawer access, and filter access.',
      'Save the final measurement list before comparing models.'
    ],
    table: {
      caption: 'Appliance fit overview',
      headers: ['Category', 'Primary fit check', 'Often-forgotten check'],
      rows: [
        ['Fridge', 'Cavity plus ventilation clearance', 'Door swing and delivery path'],
        ['Dishwasher', '600 mm or 450 mm bay plus services', 'Panel weight and hose routing'],
        ['Washing machine', 'Laundry cavity and access route', 'Doorway turns, lift, or stairs'],
        ['Dryer', 'Floor or stack space', 'Vent, drain, tank, and room airflow']
      ]
    }
  }
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function visibleTextForWordCount(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function countVisibleWords(html) {
  const text = visibleTextForWordCount(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function uniqueLinks(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!row || typeof row.url !== 'string') continue;
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    deduped.push(row);
  }
  return deduped;
}

function normalizeBrandLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/brands/${row.slug}`,
    label: `${row.brand} ${String(row.cat ?? '').replace(/_/g, ' ')} clearance`
  }));
}

function normalizeCompareLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/compare/${row.slug}`,
    label: `${row.brandA} vs ${row.brandB} ${String(row.cat ?? '').replace(/_/g, ' ')}`
  }));
}

function normalizeCavityLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/cavity/${row.slug}`,
    label: `${row.width}mm fridge cavity`
  }));
}

function normalizeDoorwayLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/doorway/${row.slug}`,
    label: `${row.doorway}mm fridge doorway`
  }));
}

function guidePageTitle(guide) {
  return GUIDE_ARTICLES[guide.slug]?.title ?? guide.title;
}

function guidePageDescription(guide) {
  return GUIDE_ARTICLES[guide.slug]?.description ?? guide.description;
}

function buildLinkPool({ brands, compares, cavity, doorway }) {
  const staticLinks = [
    { url: '/', label: 'FitAppliance home' },
    { url: '/affiliate-disclosure', label: 'Affiliate disclosure' },
    { url: '/privacy-policy', label: 'Privacy policy' }
  ];
  return uniqueLinks([
    ...staticLinks,
    ...normalizeBrandLinks(brands),
    ...normalizeCompareLinks(compares),
    ...normalizeCavityLinks(cavity),
    ...normalizeDoorwayLinks(doorway)
  ]);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toDayIso(value) {
  const iso = toIso(value);
  return iso ? `${iso.slice(0, 10)}T00:00:00.000Z` : null;
}

function readGitDateForFile({ repoRoot, filePath, first }) {
  const relativePath = path.relative(repoRoot, filePath);
  const args = ['log'];
  if (first) args.push('--reverse');
  args.push('--format=%aI', '--', relativePath);

  try {
    const output = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const lines = output.split('\n').filter(Boolean);
    return lines[0] ?? null;
  } catch {
    return null;
  }
}

function readFileMtimeIso(filePath) {
  if (!existsSync(filePath)) return null;
  return toIso(statSync(filePath).mtime);
}

function resolveGuideArticleDates({ repoRoot, filePath, guide = {} }) {
  const firstCommitDate = readGitDateForFile({ repoRoot, filePath, first: true });
  const latestCommitDate = readGitDateForFile({ repoRoot, filePath, first: false });
  const fallbackMtime = readFileMtimeIso(filePath);

  const datePublished = toIso(guide.publishedAt) ?? toIso(firstCommitDate) ?? fallbackMtime ?? FIXED_EPOCH_ISO;
  const dateModified = toIso(guide.modifiedAt) ?? toDayIso(latestCommitDate) ?? toDayIso(fallbackMtime) ?? FIXED_EPOCH_ISO;

  return {
    datePublished,
    dateModified: Date.parse(dateModified) >= Date.parse(datePublished)
      ? dateModified
      : datePublished
  };
}

function buildGuideArticleJsonLd({ guide, datePublished, dateModified, wordCount }) {
  const articleUrl = `${ARTICLE_SCHEMA_ORIGIN}/guides/${guide.slug}`;
  const imageUrl = `${ARTICLE_SCHEMA_ORIGIN}/og-images/guide-${guide.slug}.png`;

  const schema = buildArticleSchema({
    headline: guidePageTitle(guide),
    description: guidePageDescription(guide),
    datePublished,
    dateModified,
    image: imageUrl,
    url: articleUrl,
    publisherUrl: ARTICLE_SCHEMA_ORIGIN,
    publisherLogoUrl: `${ARTICLE_SCHEMA_ORIGIN}/icons/icon-512.png`
  });
  if (Number.isInteger(wordCount)) {
    schema.wordCount = wordCount;
  }
  return serializeJsonLd(schema, { pretty: true });
}

function selectGuideLinks({ guide, allLinks, brands, compares, cavity, doorway }) {
  const byCategory = (cat) => ({
    brands: normalizeBrandLinks(brands.filter((row) => row.cat === cat)),
    compares: normalizeCompareLinks(compares.filter((row) => row.cat === cat))
  });
  const fridge = byCategory('fridge');
  const dishwasher = byCategory('dishwasher');
  const washingMachine = byCategory('washing_machine');
  const dryer = byCategory('dryer');
  const cavityLinks = normalizeCavityLinks(cavity);
  const doorwayLinks = normalizeDoorwayLinks(doorway);

  if (guide.slug === 'dishwasher-cavity-sizing') {
    return uniqueLinks([
      ...dishwasher.brands.slice(0, 25),
      ...dishwasher.compares.slice(0, 12),
      ...cavityLinks.slice(0, 10),
      ...doorwayLinks.slice(0, 8),
      ...fridge.compares.slice(0, 8)
    ]);
  }

  if (guide.slug === 'washing-machine-doorway-access') {
    return uniqueLinks([
      ...washingMachine.brands.slice(0, 25),
      ...washingMachine.compares.slice(0, 12),
      ...doorwayLinks.slice(0, 20),
      ...cavityLinks.slice(0, 8),
      ...dryer.compares.slice(0, 8)
    ]);
  }

  if (guide.slug === 'fridge-clearance-requirements') {
    return uniqueLinks([
      ...fridge.brands.slice(0, 50),
      ...fridge.compares.slice(0, 22),
      ...cavityLinks.slice(0, 20),
      ...doorwayLinks.slice(0, 20)
    ]);
  }

  if (guide.slug === 'dryer-ventilation-guide') {
    return uniqueLinks([
      ...dryer.brands.slice(0, 25),
      ...dryer.compares.slice(0, 16),
      ...washingMachine.compares.slice(0, 10),
      ...cavityLinks.slice(0, 8),
      ...doorwayLinks.slice(0, 8)
    ]);
  }

  return allLinks.map((row, index) => ({
    ...row,
    label: `Reference ${index + 1}`,
    title: row.label
  }));
}

function renderFigure(figure) {
  return `<figure class="guide-figure">
            ${figure.svg}
            <figcaption>${escHtml(figure.caption)}</figcaption>
          </figure>`;
}

function renderTable(table) {
  return `<table class="guide-table">
            <caption>${escHtml(table.caption)}</caption>
            <thead><tr>${table.headers.map((header) => `<th>${escHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>
              ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escHtml(cell)}</td>`).join('')}</tr>`).join('\n              ')}
            </tbody>
          </table>`;
}

function renderGuideArticle(guide) {
  const article = GUIDE_ARTICLES[guide.slug];
  if (!article) return '';

  return `<article class="guide-article">
          ${article.intro.map((paragraph) => `<p>${escHtml(paragraph)}</p>`).join('\n          ')}
          ${article.figures.map(renderFigure).join('\n          ')}
          ${article.sections.map((section) => `<section>
            <h2>${escHtml(section.heading)}</h2>
            ${section.paragraphs.map((paragraph) => `<p>${escHtml(paragraph)}</p>`).join('\n            ')}
          </section>`).join('\n          ')}
          <section class="guide-checklist">
            <h2>Pre-purchase checklist</h2>
            <ul>
              ${article.checklist.map((item) => `<li>${escHtml(item)}</li>`).join('\n              ')}
            </ul>
          </section>
          <section>
            <h2>Quick reference table</h2>
            ${renderTable(article.table)}
          </section>
        </article>`;
}

function buildHubHtml({ guide, links, crossLinks, articleJsonLd, modifiedTime }) {
  const pageTitle = guidePageTitle(guide);
  const title = `${pageTitle} | FitAppliance`;
  const description = guidePageDescription(guide);
  const canonical = `${SITE_ORIGIN}/guides/${guide.slug}`;
  const ogImage = `/og-images/guide-${guide.slug}.png`;

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <script type="application/ld+json">
${articleJsonLd}
  </script>
  <meta name="description" content="${escHtml(description)}">
  <meta name="article:modified_time" content="${escHtml(modifiedTime)}">
  <link rel="canonical" href="${canonical}">
${buildHreflangLinks(canonical)}
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="FitAppliance">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url" content="${canonical}">
${buildOgImageMeta(ogImage)}
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <style>
    :root { --ink:#131210; --ink-2:#3d3a35; --ink-3:#6b6b6b; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--paper); color: var(--ink); line-height: 1.6; }
    main { max-width: 1100px; margin: 0 auto; padding: 42px 24px 68px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
    .content-col { min-width: 0; }
    h1 { margin: 0 0 10px; font-size: 34px; }
    p { color: var(--ink-2); margin: 0 0 14px; }
    .cross { margin: 18px 0 24px; display: flex; flex-wrap: wrap; gap: 8px; }
    .cross a {
      text-decoration: none; color: var(--copper); background: var(--white);
      border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; font-size: 13px;
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;
      margin-top: 14px;
    }
    .grid a {
      text-decoration: none; color: var(--ink-2); background: var(--white); border: 1px solid var(--border);
      padding: 10px 12px; border-radius: 8px; font-size: 14px;
    }
    .grid a:hover { border-color: var(--copper); color: var(--copper); }
    .meta { margin-top: 14px; font-size: 12px; color: var(--ink-3); }
    .section-title-lg { margin: 18px 0 8px; font-size: 18px; }
    .section-title-lg--flush { margin-top: 0; }
    .guide-article {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px;
      margin: 18px 0 24px;
    }
    .guide-article h2 { margin: 26px 0 8px; font-size: 22px; line-height: 1.25; }
    .guide-article section:first-of-type h2 { margin-top: 18px; }
    .guide-figure {
      margin: 22px 0;
      padding: 14px;
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .guide-figure svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
    .guide-figure figcaption { margin-top: 8px; color: var(--ink-3); font-size: 13px; }
    .guide-checklist ul { margin: 0; padding-left: 20px; color: var(--ink-2); }
    .guide-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 4px;
      background: var(--white);
      font-size: 14px;
    }
    .guide-table caption { text-align: left; color: var(--ink-3); font-size: 13px; margin-bottom: 6px; }
    .guide-table th, .guide-table td { border: 1px solid var(--border); padding: 9px 10px; text-align: left; vertical-align: top; }
    .guide-table th { background: var(--paper); color: var(--ink); }
    .subscribe-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      position: sticky;
      top: 20px;
    }
    .subscribe-card h2 { margin: 0 0 8px; font-size: 17px; }
    .subscribe-card p { margin: 0 0 10px; font-size: 13px; color: var(--ink-3); }
    .subscribe-form { display: flex; flex-direction: column; gap: 10px; }
    .subscribe-form input[type="email"] {
      width: 100%;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      background: var(--paper);
      color: var(--ink);
      font-size: 14px;
      padding: 10px 12px;
    }
    .subscribe-form button[type="submit"] {
      width: 100%;
      border: none;
      border-radius: 10px;
      background: var(--ink);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 12px;
      cursor: pointer;
    }
    .subscribe-form button[type="submit"]:disabled { opacity: .6; cursor: not-allowed; }
    .subscribe-note { margin: 0; font-size: 11px; color: var(--ink-3); line-height: 1.45; }
    .subscribe-note a { color: var(--copper); }
    .subscribe-hp {
      position: absolute !important;
      left: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .subscribe-status { min-height: 18px; margin: 0; font-size: 12px; color: var(--ink-3); line-height: 1.4; }
    .subscribe-status[data-tone="success"] { color: #0f766e; }
    .subscribe-status[data-tone="error"] { color: #b91c1c; }
    .subscribe-status[data-tone="warn"] { color: #a16207; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .subscribe-card { position: static; }
    }
  </style>
</head>
<body>
  <main>
    <a href="/" style="color:var(--ink-3);text-decoration:none;font-size:13px">← Back to FitAppliance</a>
    <h1>${escHtml(pageTitle)}</h1>
    <p>${escHtml(description)}</p>
    <div class="layout">
      <div class="content-col">
        ${renderGuideArticle(guide)}

        <section>
          <h2 class="section-title-lg">Related Guide Hubs</h2>
          <div class="cross">
            ${crossLinks.map((row) => `<a href="${escHtml(row.url)}">${escHtml(row.label)}</a>`).join('\n        ')}
          </div>
        </section>

        <section>
          <h2 class="section-title-lg section-title-lg--flush">Linked Resources</h2>
          <div class="grid">
            ${links.map((row) => `<a href="${escHtml(row.url)}"${row.title ? ` title="${escHtml(row.title)}"` : ''}>${escHtml(row.label)}</a>`).join('\n        ')}
          </div>
          <p class="meta">${links.length} static links. Updated automatically from the latest FitAppliance page indices.</p>
        </section>

        <footer style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--ink-3)">
          <a href="/methodology">Methodology</a> ·
          <a href="/about/editorial-standards">Editorial standards</a>
        </footer>
      </div>

      <aside class="subscribe-card" aria-label="Email subscription">
        <h2>Get New Data Drops</h2>
        <p>Weekly updates when new cavity pages, brand specs, and model coverage are published.</p>
        <form class="subscribe-form" data-subscribe action="/api/subscribe" method="post" novalidate>
          <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
          <label class="subscribe-hp" aria-hidden="true">Company
            <input type="text" name="hp_company" tabindex="-1" autocomplete="off">
          </label>
          <button type="submit">Subscribe</button>
          <p class="subscribe-note">No spam. One-click unsubscribe. <a href="/privacy-policy">Privacy Policy</a></p>
          <p class="subscribe-status" data-subscribe-status aria-live="polite"></p>
        </form>
      </aside>
    </div>
  </main>
  <script defer src="/scripts/subscribe.js"></script>
</body>
</html>
`;
}

async function cleanOutputDir(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    if (!entry.name.endsWith('.html') && entry.name !== 'index.json') return;
    await rm(path.join(outputDir, entry.name), { force: true });
  }));
}

async function generateGuidePages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'guides');
  const logger = options.logger ?? console;

  const brands = await readJson(path.join(repoRoot, 'pages', 'brands', 'index.json'), []);
  const compares = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'), []);
  const cavity = await readJson(path.join(repoRoot, 'pages', 'cavity', 'index.json'), []);
  const doorway = await readJson(path.join(repoRoot, 'pages', 'doorway', 'index.json'), []);
  const allLinks = buildLinkPool({ brands, compares, cavity, doorway });

  await cleanOutputDir(outputDir);
  const rows = [];
  const guideCrossLinks = GUIDE_HUBS.map((guide) => ({
    url: `/guides/${guide.slug}`,
    label: guide.title
  }));

  for (const guide of GUIDE_HUBS) {
    const links = selectGuideLinks({ guide, allLinks, brands, compares, cavity, doorway });
    const filePath = path.join(outputDir, `${guide.slug}.html`);
    const articleDates = resolveGuideArticleDates({
      repoRoot,
      filePath,
      guide
    });
    const htmlForCount = buildHubHtml({
      guide,
      links,
      crossLinks: guideCrossLinks.filter((row) => row.url !== `/guides/${guide.slug}`),
      articleJsonLd: '{}',
      modifiedTime: articleDates.dateModified
    });
    const articleJsonLd = buildGuideArticleJsonLd({
      guide,
      ...articleDates,
      wordCount: countVisibleWords(htmlForCount)
    });
    const html = buildHubHtml({
      guide,
      links,
      crossLinks: guideCrossLinks.filter((row) => row.url !== `/guides/${guide.slug}`),
      articleJsonLd,
      modifiedTime: articleDates.dateModified
    });
    await writeFile(filePath, html, 'utf8');
    rows.push({
      slug: guide.slug,
      title: guide.title,
      description: guide.description,
      url: `/guides/${guide.slug}`,
      linkCount: links.length
    });
  }

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${rows.length} guide hub pages to pages/guides/`);
  return {
    generated: rows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateGuidePages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  GUIDE_HUBS,
  buildGuideArticleJsonLd,
  resolveGuideArticleDates,
  generateGuidePages
};
