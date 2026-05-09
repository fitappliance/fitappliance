const PROMPT_TEMPLATE = `You extract appliance specification data from manufacturer PDF text.

Return output ONLY a single JSON object matching this schema:
{
  "brand": "string",
  "model": "string",
  "category": "fridge|dishwasher|dryer|washing_machine",
  "dimensions_mm": { "width": number, "height": number, "depth": number },
  "clearance_mm": { "side": number, "top": number, "rear": number, "front": number|null },
  "capacity_litres": number|null,
  "energy_stars": number|null,
  "annual_kwh": number|null,
  "door_swing_mm": number|null,
  "weight_kg": number|null,
  "noise_db": number|null,
  "confidence": "high|medium|low",
  "source_quote": "short exact quote from the PDF text"
}

Zero hallucination rules:
- Extract absolute physical dimensions of the product, not packaging dimensions, unless the field specifically asks for a delivery/package dimension.
- Do not guess ambiguous dimensions. Use null and lower confidence when the PDF text does not clearly map a number to width, height, depth, or clearance.
- Extract required installation air gaps for top, side, rear, and front when stated.
- If the document states a cavity dimension instead of a clearance, calculate the clearance only when both the cavity dimension and product dimension are explicit in the source text.
- Return millimetre fields as whole numbers. If the source has a decimal millimetre value, round to the nearest integer.
- If multiple models appear in one PDF, extract data for the target model in TARGET PRODUCT CONTEXT. Use that target brand/model/category for brand, model, and category unless the PDF clearly contradicts it.
- Preserve a short source_quote proving the most important dimension or clearance value.

Use null when the PDF does not state a value. Convert inches to millimetres.
Do not include markdown or commentary.

TARGET PRODUCT CONTEXT:
{{TARGET_CONTEXT}}

PDF TEXT:
{{TEXT}}`;

exports.PROMPT_TEMPLATE = PROMPT_TEMPLATE;
