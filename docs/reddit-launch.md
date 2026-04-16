# Reddit Launch Plan — FitAppliance Phase 17

## Why this is worth posting now
FitAppliance solves a real Australian appliance-buying problem: retailer specs tell you the box dimensions, but not the brand-specific clearance rules that decide whether the appliance actually fits and keeps its warranty-safe airflow.

Current proof points:
- 2169 AU appliance records across fridges, washing machines, dishwashers, and dryers
- 286 brand pages live
- 38 compare pages live
- 148 automated tests in place before launch validation
- Direct retailer links are now being surfaced on compare pages where source coverage exists

## Pre-launch checklist
- [ ] Run `npm run generate-pages`
- [ ] Run `npm test`
- [ ] Spot-check mobile sticky banner from a compare-intent URL
- [ ] Spot-check 5 compare pages for working buy links
- [ ] Confirm disclosure language is present anywhere affiliate-style links appear
- [ ] Prepare 2 screenshots: one search result, one compare page

## Best subreddit targets
1. **r/AusRenovation** — strongest fit, practical home-improvement angle
2. **r/AusPropertyChat** — buyers, renovators, landlords
3. **r/AusFinance** — cost-of-ownership and bad-purchase prevention angle
4. **r/Appliances** — broader audience, but lead with AU-specific clearance rules

## Recommended first post: r/AusRenovation

### Title options
- Built a tool to check if an appliance actually fits your cavity, not just the product dimensions
- I got tired of retailer specs hiding clearance requirements, so I built an AU appliance fit checker
- This shows when a fridge fits on paper but fails once brand clearance rules are applied

### Post body
Hi all,

I built **FitAppliance**, a free Australian appliance fit checker, after running into the annoying problem where a fridge technically matched the cavity dimensions but still needed extra side, rear, or top clearance that retailers barely mention.

What it does:
- checks your cavity dimensions against actual appliance dimensions
- applies brand-specific clearance rules
- compares brands side by side on dedicated compare pages
- shows retailer jump-off links where source coverage exists
- covers fridges, washers, dishwashers, and dryers

Current scope:
- 2169 appliance records
- 286 brand landing pages
- 38 compare pages
- built for Australian sizing and buying flow

The goal is simple: stop people buying appliances that “fit” in theory but fail in the real cavity once ventilation and access rules are applied.

If anyone wants to test it with a real cavity size or a brand pair they are comparing, I’m happy to use that as feedback for the next update.

## Comment reply snippets
- **Why not just measure manually?**
  Measuring the cavity is only half the job. The hidden part is the brand-specific clearance requirement around the appliance.
- **Is this just affiliate bait?**
  The tool is built around fit logic first. Any retailer links are there to shorten the path once someone already has a fit shortlist.
- **My brand is missing.**
  Send the brand or model and I can add it to the research queue.

## Risk notes
- Do not quote outdated direct_url or door-swing coverage numbers from older promo docs.
- Keep claims anchored to current generated pages and current audit output.
- If comments focus on “just use a tape measure”, bring the answer back to ventilation clearance and install reality.
