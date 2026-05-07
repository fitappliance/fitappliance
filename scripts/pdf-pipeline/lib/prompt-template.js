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

Use null when the PDF does not state a value. Convert inches to millimetres.
Do not include markdown or commentary.

PDF TEXT:
{{TEXT}}`;

exports.PROMPT_TEMPLATE = PROMPT_TEMPLATE;
