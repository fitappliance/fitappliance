(function fitCalculatorModule(globalScope) {
  const FIELD_LABELS = {
    height: 'Height',
    width: 'Width',
    depth: 'Depth',
  };

  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  }

  function stripMarkup(value) {
    return String(value ?? '').replace(/<[^>]*>/g, '').trim();
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  function numberOrNull(...values) {
    for (const value of values) {
      const parsed = toFiniteNumber(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function numberOrZero(...values) {
    const parsed = numberOrNull(...values);
    return parsed === null ? 0 : parsed;
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value));
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function formatMm(value) {
    const parsed = toFiniteNumber(value);
    return parsed === null ? '-' : `${parsed}mm`;
  }

  function getProductSpecs(productData = {}) {
    const dimensions = productData.dimensions || {};
    const clearance = productData.clearance_requirements || productData.clearance || {};

    const width = numberOrNull(dimensions.width_mm, productData.width_mm, productData.w);
    const height = numberOrNull(dimensions.height_mm, productData.height_mm, productData.h);
    const depth = numberOrNull(dimensions.depth_mm, productData.depth_mm, productData.d);
    const doorOpen90Depth = numberOrNull(
      dimensions.door_open_90_depth_mm,
      productData.door_open_90_depth_mm,
      productData.doorOpen90Depth,
    );

    const clearanceRequirements = {
      top: numberOrZero(clearance.top_mm, clearance.top),
      left: numberOrZero(clearance.left_mm, clearance.left, clearance.side_mm, clearance.side),
      right: numberOrZero(clearance.right_mm, clearance.right, clearance.side_mm, clearance.side),
      rear: numberOrZero(clearance.rear_mm, clearance.rear),
    };

    const required = width === null || height === null || depth === null
      ? null
      : {
          width: width + clearanceRequirements.left + clearanceRequirements.right,
          height: height + clearanceRequirements.top,
          depth: depth + clearanceRequirements.rear,
        };

    return {
      brand: productData.brand || '',
      model: productData.model || productData.sku || '',
      dimensions: {
        width,
        height,
        depth,
        doorOpen90Depth,
      },
      clearance: clearanceRequirements,
      required,
      evidence: productData.evidence || null,
      dataSource: productData.data_source || productData.dataSource || '',
    };
  }

  function normalizeCabinetInput(cabinetInput = {}) {
    return {
      height: toFiniteNumber(cabinetInput.height),
      width: toFiniteNumber(cabinetInput.width),
      depth: toFiniteNumber(cabinetInput.depth),
    };
  }

  function addBaseDimensionFailure(failures, axis, cabinetValue, productValue) {
    const label = FIELD_LABELS[axis];
    const overage = productValue - cabinetValue;
    failures.push(`${label} fails: appliance is ${overage}mm ${axis === 'depth' ? 'deeper' : axis === 'height' ? 'taller' : 'wider'} than the cabinet.`);
  }

  function computeFitResult(productData = {}, cabinetInput = {}) {
    const specs = getProductSpecs(productData);
    const cabinet = normalizeCabinetInput(cabinetInput);

    if (!specs.required) {
      return {
        status: 'invalid',
        message: 'Product dimensions are missing, so fit cannot be calculated.',
        failures: ['Product dimensions are missing.'],
        required: null,
        specs,
      };
    }

    if (cabinet.height === null || cabinet.width === null || cabinet.depth === null) {
      return {
        status: 'incomplete',
        message: 'Enter all three cabinet dimensions to calculate fit.',
        failures: [],
        required: specs.required,
        specs,
      };
    }

    const failures = [];
    const { dimensions, clearance } = specs;

    if (cabinet.width < dimensions.width) {
      addBaseDimensionFailure(failures, 'width', cabinet.width, dimensions.width);
    } else {
      const widthClearanceAvailable = cabinet.width - dimensions.width;
      if (widthClearanceAvailable < clearance.left + clearance.right) {
        const availableLeft = Math.floor(widthClearanceAvailable / 2);
        const availableRight = widthClearanceAvailable - availableLeft;
        if (availableLeft < clearance.left) {
          failures.push(`Left clearance fails: needs ${clearance.left}mm, only have ${availableLeft}mm.`);
        }
        if (availableRight < clearance.right) {
          failures.push(`Right clearance fails: needs ${clearance.right}mm, only have ${availableRight}mm.`);
        }
      }
    }

    if (cabinet.height < dimensions.height) {
      addBaseDimensionFailure(failures, 'height', cabinet.height, dimensions.height);
    } else {
      const topClearanceAvailable = cabinet.height - dimensions.height;
      if (topClearanceAvailable < clearance.top) {
        failures.push(`Top clearance fails: needs ${clearance.top}mm, only have ${topClearanceAvailable}mm.`);
      }
    }

    if (cabinet.depth < dimensions.depth) {
      addBaseDimensionFailure(failures, 'depth', cabinet.depth, dimensions.depth);
    } else {
      const rearClearanceAvailable = cabinet.depth - dimensions.depth;
      if (rearClearanceAvailable < clearance.rear) {
        failures.push(`Rear clearance fails: needs ${clearance.rear}mm, only have ${rearClearanceAvailable}mm.`);
      }
    }

    if (failures.length > 0) {
      return {
        status: 'fail',
        message: failures.join(' '),
        failures,
        required: specs.required,
        specs,
      };
    }

    const spare = {
      width: cabinet.width - specs.required.width,
      height: cabinet.height - specs.required.height,
      depth: cabinet.depth - specs.required.depth,
    };

    return {
      status: 'pass',
      message: `Fits with manufacturer clearance. Spare: W ${spare.width}mm / H ${spare.height}mm / D ${spare.depth}mm.`,
      failures: [],
      spare,
      required: specs.required,
      specs,
    };
  }

  function renderVerifiedBadge(specs) {
    const sourceUrl = safeUrl(specs.evidence?.source_url);
    if (specs.dataSource !== 'official_pdf') return '';
    if (!sourceUrl) {
      return '<span class="inline-flex border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-slate-600">Verified source URL unavailable</span>';
    }
    return `<a class="fitcalc-verified-badge inline-flex border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-emerald-700 underline-offset-2 hover:underline" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Verified by Manufacturer</a>`;
  }

  function renderSpecRows(specs) {
    const { dimensions, clearance, required } = specs;
    const rows = [
      ['Base height', formatMm(dimensions.height)],
      ['Base width', formatMm(dimensions.width)],
      ['Base depth', formatMm(dimensions.depth)],
      ['Door open 90 depth', formatMm(dimensions.doorOpen90Depth)],
      ['Top clearance', formatMm(clearance.top)],
      ['Left clearance', formatMm(clearance.left)],
      ['Right clearance', formatMm(clearance.right)],
      ['Rear clearance', formatMm(clearance.rear)],
      ['Required cabinet height', formatMm(required?.height)],
      ['Required cabinet width', formatMm(required?.width)],
      ['Required cabinet depth', formatMm(required?.depth)],
    ];

    return rows.map(([label, value]) => (
      `<tr class="border-b border-slate-200 last:border-b-0">
        <th class="py-1.5 pr-3 text-left font-medium text-slate-600">${escapeHtml(label)}</th>
        <td class="py-1.5 text-right font-mono text-slate-900">${escapeHtml(value)}</td>
      </tr>`
    )).join('');
  }

  function renderInput(name, label) {
    return `<label class="block">
      <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">${escapeHtml(label)}</span>
      <input
        class="w-full border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm text-slate-950 outline-none focus:border-slate-900"
        data-fit-input="${escapeHtml(name)}"
        inputmode="numeric"
        min="0"
        placeholder="mm"
        step="1"
        type="number"
      />
    </label>`;
  }

  function verdictClasses(status) {
    const base = 'border p-3 font-mono text-sm leading-relaxed';
    if (status === 'pass') return `${base} border-emerald-500 bg-emerald-50 text-emerald-700`;
    if (status === 'fail') return `${base} border-amber-500 bg-amber-50 text-amber-700`;
    if (status === 'invalid') return `${base} border-red-500 bg-red-50 text-red-700`;
    return `${base} border-slate-300 bg-slate-50 text-slate-700`;
  }

  function renderVerdict(result) {
    if (result.status === 'fail') {
      return `<strong class="block uppercase tracking-wide">Does not fit yet</strong><ul class="mt-2 list-disc space-y-1 pl-5">${result.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('')}</ul>`;
    }
    if (result.status === 'pass') {
      return `<strong class="block uppercase tracking-wide">Fit confirmed</strong><span>${escapeHtml(result.message)}</span>`;
    }
    return escapeHtml(result.message);
  }

  function initFitCalculator(containerElement, productData = {}) {
    if (!containerElement || typeof containerElement.querySelectorAll !== 'function') {
      throw new TypeError('initFitCalculator requires a container element.');
    }

    const specs = getProductSpecs(productData);
    const productLabel = [stripMarkup(specs.brand), stripMarkup(specs.model)].filter(Boolean).join(' ') || 'Selected appliance';
    const initialResult = computeFitResult(productData, {});

    containerElement.innerHTML = `
      <section class="fitcalc border border-slate-300 bg-white p-4 text-slate-950">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold tracking-tight">${escapeHtml(productLabel)} fit check</h2>
            <p class="text-xs text-slate-600">Cabinet dimensions are checked against product size plus required clearances.</p>
          </div>
          ${renderVerifiedBadge(specs)}
        </div>

        <div class="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2">
              ${renderInput('height', 'Height')}
              ${renderInput('width', 'Width')}
              ${renderInput('depth', 'Depth')}
            </div>
            <div data-fit-verdict class="${verdictClasses(initialResult.status)}">${renderVerdict(initialResult)}</div>
          </div>

          <div class="border border-slate-200 bg-slate-50 p-3">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Data panel: Base dimensions + clearance</h3>
            <table class="w-full border-collapse text-xs">
              <tbody>${renderSpecRows(specs)}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;

    const inputs = Array.from(containerElement.querySelectorAll('[data-fit-input]'));
    const verdict = containerElement.querySelector('[data-fit-verdict]');

    function readInputState() {
      return inputs.reduce((state, input) => ({
        ...state,
        [input.dataset.fitInput]: input.value,
      }), {});
    }

    function update() {
      const result = computeFitResult(productData, readInputState());
      verdict.className = verdictClasses(result.status);
      verdict.innerHTML = renderVerdict(result);
      return result;
    }

    inputs.forEach((input) => input.addEventListener('input', update));

    return {
      destroy() {
        inputs.forEach((input) => input.removeEventListener('input', update));
      },
      getState: readInputState,
      update,
    };
  }

  const api = {
    computeFitResult,
    escapeHtml,
    getProductSpecs,
    initFitCalculator,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.initFitCalculator = initFitCalculator;
    globalScope.FitCalculator = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
