(function () {
  'use strict';

  const standards = ['EN13215_RG20', 'EN13215_SH10'];
  const columns = [
    { key: 'model', label: 'Model', width: 15, placeholder: 'Type to filter models' },
    { key: 'engineeringCode', label: 'Engineering Code', width: 13, placeholder: 'Type to filter codes' },
    { key: 'refrigerant', label: 'Refrigerant', width: 9 },
    { key: 'frequency', label: 'Frequency / Rotation', width: 9 },
    { key: 'powerSupply', label: 'Power Supply', width: 14 },
    { key: 'coolingCapacityW', label: 'Cooling Capacity [W]', width: 9, rated: true, decimals: 0, placeholder: 'Min. W' },
    { key: 'copWW', label: 'COP [W/W]', width: 9, rated: true, decimals: 2, placeholder: 'Min. COP' },
    { key: 'standard', label: 'Standard', width: 12 },
    { key: 'datasheet', label: 'Datasheet', width: 10 }
  ];
  const state = {
    products: [], filtered: [], filters: {}, initialQuery: '', modelExactMatch: false, codeExactMatch: false,
    standard: standards[0],
    collapsedModels: new Set(), sort: { key: 'engineeringCode', direction: 1 },
    tableScrollLeft: 0, syncedScrollPositions: new WeakMap(),
    activePdfUrls: [], thumbnailCache: new Map(), thumbnailQueue: [],
    thumbnailRequests: 0, thumbnailObserver: null
  };
  const ui = window.APP_RUNTIME && window.APP_RUNTIME.ui || {};
  const el = {};
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const pdfIcon = '<svg viewBox="0 0 24 30" fill="none" aria-hidden="true"><path d="M5 2h9l7 7v17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8"/><path d="M14 2v7h7" stroke="currentColor" stroke-width="1.8"/><text x="12" y="22" text-anchor="middle" fill="currentColor" font-family="Arial,sans-serif" font-size="8" font-weight="700">PDF</text></svg>';
  const thumbnailPlaceholder = '<svg class="thumbnail-placeholder" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="m5 43 35-13 20 13-35 15Z M5 43v4l20 15 35-15v-4 M40 30V7l17 10v24 M40 7 25 13v20 M43 12v19m4-17v20m4-17v20m4-17v20"/><ellipse cx="23" cy="37" rx="10" ry="7"/><path d="M13 37V26c0-9 20-9 20 0v11 M13 26c0 9 20 9 20 0 M18 44v6m10-7v5 M11 40 7 37v-7h6 M33 34l5 3v7"/></svg>';

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', revokeAllPdfUrls);

  async function init() {
    Object.assign(el, {
      loading: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      toast: document.getElementById('toast'),
      form: document.getElementById('catalogue-filters'),
      header: document.querySelector('.filter-bar'),
      headings: document.getElementById('shared-column-headings'),
      columnWidths: document.getElementById('shared-column-widths'),
      headerScroll: document.getElementById('shared-columns-scroll'),
      modelInput: document.getElementById('filter-model'),
      groups: document.getElementById('model-groups'),
      count: document.getElementById('result-count'),
      empty: document.getElementById('empty-state'),
      clear: document.getElementById('clear-filters')
    });
    document.title = ui.appTitle || 'Condensing Unit Product Catalogue';
    document.getElementById('app-title').textContent = ui.catalogueHeading || 'Condensing Units';
    el.columnWidths.innerHTML = renderColumnWidths();
    el.headings.innerHTML = renderHeadings();
    el.modelInput = document.getElementById('filter-model');
    el.clear = document.getElementById('clear-filters');
    updateSortHeadings();
    bindEvents();
    updateHeaderHeight();
    if ('ResizeObserver' in window) {
      const headerObserver = new ResizeObserver(updateHeaderHeight);
      headerObserver.observe(el.header);
    }
    try {
      const bootstrap = await serverCall('getCatalogueBootstrap');
      state.products = bootstrap.products || [];
      populateFilters();
      applyInitialProduct();
      applyFilters();
      hideLoading();
    } catch (error) { showFatal(error); }
  }

  function textValue(product, key) {
    if (key === 'standard') {
      // Show the standard belonging to the same Rated Point as capacity and COP.
      return state.standard.replace(/_/g, ' ');
    }
    return product[key] === null || product[key] === undefined ? '' : String(product[key]).trim();
  }

  function ratedValue(product, key) {
    const point = selectedRatedPoint(product);
    return Number.isFinite(point[key]) ? point[key] : null;
  }

  function selectedRatedPoint(product) {
    if (product.ratedPointsByStandard) return product.ratedPointsByStandard[state.standard] || {};
    // Older bootstrap payloads are usable only for their actual standard.
    const point = product.ratedPoint || product.performance || {};
    const standard = String(point.standard || product.standard || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return standard === state.standard ? point : {};
  }

  function populateFilters() {
    el.form.querySelectorAll('select[data-filter]').forEach(function (select) {
      if (select.dataset.filter === 'standard') return;
      const values = Array.from(new Set(state.products.map(function (product) {
        return textValue(product, select.dataset.filter);
      }).filter(Boolean))).sort(collator.compare);
      values.forEach(function (value) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    });
  }

  function applyInitialProduct() {
    const initial = String(window.APP_RUNTIME && window.APP_RUNTIME.initialProduct || '').trim();
    if (!initial) return;
    const normalized = initial.toLowerCase();
    const byCode = state.products.find(function (product) {
      return textValue(product, 'engineeringCode').toLowerCase() === normalized;
    });
    const byModel = state.products.find(function (product) {
      return textValue(product, 'model').toLowerCase() === normalized;
    });
    const key = byCode ? 'engineeringCode' : byModel ? 'model' : '';
    if (key) {
      const value = textValue(byCode || byModel, key);
      state.filters[key] = value;
      state.modelExactMatch = key === 'model';
      state.codeExactMatch = key === 'engineeringCode';
      el.form.querySelector('[data-filter="' + key + '"]').value = value;
      showToast('Select Open PDF datasheet beside the desired engineering code.');
    } else {
      state.initialQuery = normalized;
      showToast('No exact match for the product link. Clear filters to browse all models.');
    }
  }

  function bindEvents() {
    el.headings.addEventListener('click', function (event) {
      const button = event.target.closest('[data-sort]');
      if (!button) return;
      const key = button.dataset.sort;
      state.sort = { key: key, direction: state.sort.key === key ? -state.sort.direction : 1 };
      updateSortHeadings();
      renderModelGroups();
      el.headings.querySelector('[data-sort="' + key + '"]').focus({ preventScroll: true });
    });
    el.headerScroll.addEventListener('scroll', function () {
      syncHorizontalScroll(el.headerScroll);
    }, { passive: true });
    el.groups.addEventListener('scroll', function (event) {
      if (event.target.matches('.table-scroll') && !event.target.hidden) {
        syncHorizontalScroll(event.target);
      }
    }, { capture: true, passive: true });
    window.addEventListener('resize', function () {
      updateHeaderHeight();
      syncHorizontalScroll(el.headerScroll);
    });
    el.form.addEventListener('submit', function (event) {
      event.preventDefault();
    });
    el.form.addEventListener('input', function (event) {
      const input = event.target.closest('input[data-filter]');
      if (input) updateInputFilter(input);
    });
    el.form.addEventListener('change', function (event) {
      const select = event.target.closest('select[data-filter]');
      if (!select) return;
      if (select.dataset.filter === 'standard') {
        if (standards.includes(select.value)) state.standard = select.value;
        applyFilters();
        return;
      }
      state.initialQuery = '';
      if (select.value) state.filters[select.dataset.filter] = select.value;
      else delete state.filters[select.dataset.filter];
      applyFilters();
    });
    el.clear.addEventListener('click', clearFilters);
    document.getElementById('empty-clear-filters').addEventListener('click', function () {
      clearFilters();
      el.modelInput.focus();
    });
    el.groups.addEventListener('click', function (event) {
      const pdf = event.target.closest('[data-code]');
      if (pdf) { openProductInNewTab(pdf.dataset.code, pdf.dataset.model); return; }
      const toggle = event.target.closest('[data-toggle-model]');
      if (toggle) {
        const model = toggle.dataset.toggleModel;
        const collapse = toggle.getAttribute('aria-expanded') === 'true';
        if (collapse) state.collapsedModels.add(model);
        else state.collapsedModels.delete(model);
        toggle.setAttribute('aria-expanded', String(!collapse));
        const tableScroll = document.getElementById(toggle.getAttribute('aria-controls'));
        tableScroll.hidden = collapse;
        if (!collapse) setTableScroll(tableScroll, state.tableScrollLeft);
        return;
      }
    });
  }

  function updateHeaderHeight() {
    document.documentElement.style.setProperty('--catalogue-header-height', el.header.getBoundingClientRect().height + 'px');
  }

  function syncHorizontalScroll(source) {
    const expected = state.syncedScrollPositions.get(source);
    state.syncedScrollPositions.delete(source);
    // Programmatic follower events must not overwrite a newer user scroll.
    if (expected === source.scrollLeft) return;
    const maximum = Math.max(0, el.headerScroll.scrollWidth - el.headerScroll.clientWidth);
    state.tableScrollLeft = Math.min(source.scrollLeft, maximum);
    [el.headerScroll].concat(Array.from(el.groups.querySelectorAll('.table-scroll'))).forEach(function (scroll) {
      setTableScroll(scroll, state.tableScrollLeft);
    });
  }

  function setTableScroll(scroll, left) {
    if (scroll.hidden || scroll.scrollLeft === left) return;
    scroll.scrollLeft = left;
    state.syncedScrollPositions.set(scroll, scroll.scrollLeft);
  }

  function renderColumnWidths() {
    return columns.map(function (column) { return '<col style="width:' + column.width + '%">'; }).join('');
  }

  function updateInputFilter(input) {
    const key = input.dataset.filter;
    const query = input.value.trim();
    // Read a trimmed query without changing the text or caret while typing.
    state.initialQuery = '';
    if (key === 'model') state.modelExactMatch = false;
    if (key === 'engineeringCode') state.codeExactMatch = false;
    if (query && (input.type !== 'number' || input.validity.valid)) state.filters[key] = query;
    else delete state.filters[key];
    applyFilters();
  }

  function updateClearFiltersState() {
    el.clear.disabled = state.standard === standards[0] && !state.initialQuery && !Object.keys(state.filters).length &&
      !Array.from(el.form.querySelectorAll('[data-filter]')).some(function (control) {
        return control.dataset.filter !== 'standard' && (control.value || control.validity.badInput);
      });
  }

  function clearFilters() {
    state.filters = {};
    state.initialQuery = '';
    state.modelExactMatch = false;
    state.codeExactMatch = false;
    state.standard = standards[0];
    el.form.querySelectorAll('[data-filter]').forEach(function (select) {
      select.value = select.dataset.filter === 'standard' ? state.standard : '';
    });
    applyFilters();
  }

  function applyFilters() {
    state.filtered = state.products.filter(function (product) {
      if (state.initialQuery && ![product.model, product.engineeringCode].join(' ').toLowerCase().includes(state.initialQuery)) return false;
      return Object.keys(state.filters).every(function (key) {
        if ((key === 'model' && !state.modelExactMatch) || (key === 'engineeringCode' && !state.codeExactMatch)) {
          return textValue(product, key).toLowerCase().includes(state.filters[key].toLowerCase());
        }
        if (key === 'coolingCapacityW' || key === 'copWW') {
          const value = ratedValue(product, key);
          return value !== null && value >= Number(state.filters[key]);
        }
        return textValue(product, key) === state.filters[key];
      });
    });
    el.form.querySelectorAll('[data-filter]').forEach(function (control) {
      control.closest('.filter-control').classList.toggle('is-active', control.dataset.filter === 'standard' || Boolean(state.filters[control.dataset.filter]));
    });
    updateClearFiltersState();
    renderModelGroups();
  }

  function groupProductsByModel(products) {
    const groups = new Map();
    products.forEach(function (product) {
      const model = textValue(product, 'model');
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(product);
    });
    return Array.from(groups.entries()).sort(function (left, right) {
      return collator.compare(left[0], right[0]) * (state.sort.key === 'model' ? state.sort.direction : 1);
    }).map(function (entry) {
      const sort = state.sort;
      const column = columns.find(function (item) { return item.key === sort.key; });
      const variants = entry[1].slice().sort(function (left, right) {
        if (column.rated) {
          const a = ratedValue(left, sort.key), b = ratedValue(right, sort.key);
          // Sort raw numbers, keeping missing values last in both directions.
          if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
          return (a - b) * sort.direction;
        }
        const a = textValue(left, sort.key), b = textValue(right, sort.key);
        if (!a || !b) return a === b ? 0 : !a ? 1 : -1;
        return collator.compare(a, b) * sort.direction;
      });
      return { model: entry[0], products: variants };
    });
  }

  function renderHeadings() {
    return columns.map(function (column) {
      if (column.key === 'datasheet') return '<th scope="col" aria-label="Datasheet"><button id="clear-filters" class="clear-filters" type="button" disabled><span aria-hidden="true">&#8634;</span><span>Clear filters</span></button></th>';
      const label = escapeHtml((column.rated ? 'Minimum ' : 'Filter ') + column.label);
      const attributes = ' id="filter-' + column.key + '" data-filter="' + column.key + '" aria-label="' + label + '"';
      const control = column.key === 'standard'
        ? '<select' + attributes + '>' + standards.map(function (standard) {
          return '<option value="' + standard + '"' + (standard === state.standard ? ' selected' : '') + '>' + standard.replace(/_/g, ' ') + '</option>';
        }).join('') + '</select>'
        : column.placeholder
        ? '<input' + attributes + ' type="' + (column.rated ? 'number' : 'text') + '" placeholder="' + column.placeholder + '"' +
          (column.rated ? ' min="0" step="any"' : ' autocomplete="off" spellcheck="false" aria-describedby="text-filter-help"') + '>'
        : '<select' + attributes + '><option value="">All</option></select>';
      return '<th scope="col" class="filter-control' + (column.rated ? ' rated-filter' : '') + '"><button type="button" class="sort-button" data-sort="' + column.key + '">' +
        '<span>' + column.label + '</span><span class="sort-icon" aria-hidden="true"></span></button>' + control + '</th>';
    }).join('');
  }

  function updateSortHeadings() {
    // Keep filter controls in place so sorting preserves values, focus and caret.
    el.headings.querySelectorAll('[data-sort]').forEach(function (button) {
      const active = button.dataset.sort === state.sort.key;
      button.closest('th').setAttribute('aria-sort', active ? state.sort.direction === 1 ? 'ascending' : 'descending' : 'none');
      const column = columns.find(function (item) { return item.key === button.dataset.sort; });
      button.setAttribute('aria-label', 'Sort all model tables by ' + column.label + ', ' + (active && state.sort.direction === 1 ? 'descending' : 'ascending'));
    });
  }

  function renderVariant(product) {
    return '<tr>' + columns.map(function (column) {
      if (column.rated) {
        const value = ratedValue(product, column.key);
        return '<td' + (value === null ? ' aria-label="Rated point value unavailable"' : '') + '>' +
          (value === null ? '—' : value.toFixed(column.decimals)) + '</td>';
      }
      if (column.key === 'datasheet') {
        const label = 'Open PDF datasheet for ' + product.model + ', ' + product.engineeringCode + ' (new tab)';
        return '<td><button type="button" class="pdf-button" data-code="' + escapeHtml(product.engineeringCode) +
          '" data-model="' + escapeHtml(product.model) + '" aria-label="' + escapeHtml(label) + '">' +
          pdfIcon + '<span>Datasheet</span></button></td>';
      }
      return '<td' + (column.key === 'engineeringCode' ? ' class="code-cell"' : '') + '>' +
        escapeHtml(textValue(product, column.key) || '—') + '</td>';
    }).join('') + '</tr>';
  }

  function renderModelGroups() {
    if (state.thumbnailObserver) state.thumbnailObserver.disconnect();
    const groups = groupProductsByModel(state.filtered);
    el.groups.innerHTML = groups.map(function (group, index) {
      const drawing = group.products.find(function (product) { return product.drawing3d; }) || group.products[0];
      const expanded = !state.collapsedModels.has(group.model);
      const count = group.products.length + (group.products.length === 1 ? ' engineering code' : ' engineering codes');
      return '<section class="model-card" data-model-group="' + escapeHtml(group.model) + '" aria-labelledby="model-name-' + index + '">' +
        '<h2 class="model-heading"><button type="button" class="model-toggle" data-toggle-model="' + escapeHtml(group.model) +
          '" aria-expanded="' + expanded + '" aria-controls="model-variants-' + index + '" aria-labelledby="model-name-' + index + ' model-count-' + index + '">' +
          '<span class="product-thumbnail" data-thumbnail-key="' + escapeHtml(drawing.drawing3d || '') + '" data-thumbnail-code="' + escapeHtml(drawing.engineeringCode) + '" aria-hidden="true">' + thumbnailPlaceholder + '</span>' +
          '<span class="model-title"><span id="model-name-' + index + '" class="model-name">' + escapeHtml(group.model) + '</span>' +
          '<span id="model-count-' + index + '" class="variant-count">' + count + '</span></span>' +
          '<span class="group-chevron" aria-hidden="true"></span></button></h2>' +
        '<div class="table-scroll" id="model-variants-' + index + '" role="region" aria-label="' + escapeHtml(group.model + ' engineering codes. Scroll horizontally on smaller screens.') + '" tabindex="0"' + (expanded ? '' : ' hidden') + '>' +
          '<table class="product-table"><caption class="visually-hidden">' + escapeHtml(group.model + ' engineering codes and PDF datasheets') + '</caption>' +
          '<colgroup>' + renderColumnWidths() + '</colgroup>' +
          '<thead class="visually-hidden"><tr>' + columns.map(function (column) {
            return '<th scope="col">' + column.label + '</th>';
          }).join('') + '</tr></thead>' +
          '<tbody>' + group.products.map(renderVariant).join('') + '</tbody></table></div></section>';
    }).join('');
    el.count.textContent = 'Showing ' + groups.length + (groups.length === 1 ? ' model' : ' models') +
      ' | ' + state.filtered.length + (state.filtered.length === 1 ? ' engineering code' : ' engineering codes');
    el.empty.classList.toggle('hidden', state.filtered.length !== 0);
    el.groups.querySelectorAll('.table-scroll').forEach(function (scroll) {
      setTableScroll(scroll, state.tableScrollLeft);
    });
    observeThumbnails();
  }

  function observeThumbnails() {
    const thumbnails = el.groups.querySelectorAll('[data-thumbnail-key]');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { queueThumbnail(entry.target); observer.unobserve(entry.target); }
        });
      }, { root: null, rootMargin: '120px' });
      state.thumbnailObserver = observer;
    }
    thumbnails.forEach(function (thumbnail) {
      const key = thumbnail.dataset.thumbnailKey;
      if (!key) return;
      const cached = state.thumbnailCache.get(key);
      if (cached && cached.ready) setThumbnail(thumbnail, cached.dataUrl);
      else if (state.thumbnailObserver) state.thumbnailObserver.observe(thumbnail);
      else queueThumbnail(thumbnail);
    });
  }

  function queueThumbnail(thumbnail) {
    const key = thumbnail.dataset.thumbnailKey;
    if (!key || state.thumbnailCache.has(key)) return;
    state.thumbnailCache.set(key, { ready: false, dataUrl: '' });
    state.thumbnailQueue.push({ key: key, code: thumbnail.dataset.thumbnailCode });
    loadNextThumbnails();
  }

  function loadNextThumbnails() {
    while (state.thumbnailRequests < 3 && state.thumbnailQueue.length) {
      const item = state.thumbnailQueue.shift();
      state.thumbnailRequests += 1;
      serverCall('getProductThumbnail', item.code).then(function (result) {
        const dataUrl = result && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl || '') ? result.dataUrl : '';
        state.thumbnailCache.set(item.key, { ready: true, dataUrl: dataUrl });
        el.groups.querySelectorAll('[data-thumbnail-key]').forEach(function (thumbnail) {
          if (thumbnail.dataset.thumbnailKey === item.key) setThumbnail(thumbnail, dataUrl);
        });
      }).catch(function () {
        state.thumbnailCache.set(item.key, { ready: true, dataUrl: '' });
      }).finally(function () { state.thumbnailRequests -= 1; loadNextThumbnails(); });
    }
  }

  function setThumbnail(thumbnail, dataUrl) {
    if (!dataUrl) return;
    const img = document.createElement('img');
    img.alt = '';
    img.width = 66; img.height = 66;
    img.decoding = 'async';
    img.addEventListener('error', function () { thumbnail.innerHTML = thumbnailPlaceholder; });
    img.src = dataUrl;
    thumbnail.replaceChildren(img);
  }

  // Keep the synchronous popup opening and existing PDF generation flow.
  async function openProductInNewTab(code, model) {
    // Capture once: changing the catalogue while requests run must not mix standards.
    const standard = state.standard;
    const pdfWindow = window.open('', '_blank');

    if (!pdfWindow) {
      showToast(
        'The browser blocked the PDF tab. ' +
        'Allow pop-ups for this Apps Script application and try again.'
      );
      return;
    }

    writeLoadingPage(pdfWindow, model, code, standard);
    showLoading(
      'Generating ' +
      (model || code) +
      ' ' + standard.replace(/_/g, ' ') + ' PDF datasheet…'
    );

    try {
      if (
        !window.TemplateMappingService ||
        typeof window.TemplateMappingService.buildReplacementMap !==
          'function'
      ) {
        throw new Error(
          'TemplateMappingService.js is not loaded.'
        );
      }

      const context = await serverCall(
        'getProductTemplateContext',
        code,
        standard
      );

      const mapping =
        window.APP_RUNTIME &&
        window.APP_RUNTIME.parameterMapping;

      const replacements =
        window.TemplateMappingService.buildReplacementMap(
          context,
          mapping
        );

      const result = await serverCall(
        'generateProductDatasheetPdf',
        code,
        replacements,
        standard
      );

      if (!result || !result.base64) {
        throw new Error(
          'The server did not return PDF data.'
        );
      }

      const pdfBlob = base64ToBlob(
        result.base64,
        result.mimeType || 'application/pdf'
      );

      const pdfUrl = URL.createObjectURL(pdfBlob);
      state.activePdfUrls.push(pdfUrl);

      // The browser's native PDF viewer works when the Blob URL is loaded in
      // a top-level tab. It may be blocked only when nested in an Apps Script
      // iframe.
      pdfWindow.location.replace(pdfUrl);

      showWarnings(result.warnings || [], result);
      schedulePdfUrlCleanup(pdfUrl);
    } catch (error) {
      writeErrorPage(
        pdfWindow,
        error.message || String(error)
      );
      showToast(error.message || String(error));
    } finally {
      hideLoading();
    }
  }

  function writeLoadingPage(targetWindow, model, code, standard) {
    try {
      targetWindow.document.open();
      targetWindow.document.write(
        '<!doctype html>' +
        '<html lang="en"><head><meta charset="utf-8">' +
        '<title>Generating datasheet</title>' +
        '<style>' +
          'body{' +
            'margin:0;min-height:100vh;display:flex;' +
            'align-items:center;justify-content:center;' +
            'font-family:Arial,Helvetica,sans-serif;' +
            'background:#eef2f3;color:#293437;' +
          '}' +
          '.box{text-align:center;padding:32px;}' +
          '.spinner{' +
            'width:42px;height:42px;margin:0 auto 18px;' +
            'border:4px solid #cbd7d9;' +
            'border-top-color:#078a98;border-radius:50%;' +
            'animation:spin .8s linear infinite;' +
          '}' +
          '@keyframes spin{to{transform:rotate(360deg)}}' +
          'h1{font-size:20px;margin:0 0 8px;}' +
          'p{margin:0;color:#69787b;}' +
        '</style></head><body>' +
        '<div class="box">' +
          '<div class="spinner"></div>' +
          '<h1>Generating PDF datasheet</h1>' +
          '<p>' +
            escapeHtml(
              [model, code, standard && standard.replace(/_/g, ' ')].filter(Boolean).join(' — ')
            ) +
          '</p>' +
        '</div>' +
        '</body></html>'
      );
      targetWindow.document.close();
    } catch (error) {
      console.warn(
        'Could not write the PDF loading page:',
        error
      );
    }
  }

  function writeErrorPage(targetWindow, message) {
    try {
      targetWindow.document.open();
      targetWindow.document.write(
        '<!doctype html>' +
        '<html lang="en"><head><meta charset="utf-8">' +
        '<title>Datasheet generation failed</title>' +
        '<style>' +
          'body{' +
            'margin:0;min-height:100vh;display:flex;' +
            'align-items:center;justify-content:center;' +
            'font-family:Arial,Helvetica,sans-serif;' +
            'background:#f7f0f0;color:#502929;' +
          '}' +
          '.box{' +
            'max-width:700px;padding:32px;' +
            'background:#fff;border:1px solid #d9bcbc;' +
            'border-radius:8px;' +
          '}' +
          'h1{margin:0 0 12px;font-size:22px;}' +
          'p{white-space:pre-wrap;line-height:1.5;}' +
        '</style></head><body>' +
        '<div class="box">' +
          '<h1>Datasheet generation failed</h1>' +
          '<p>' + escapeHtml(message) + '</p>' +
        '</div>' +
        '</body></html>'
      );
      targetWindow.document.close();
    } catch (error) {
      console.warn(
        'Could not write the PDF error page:',
        error
      );
    }
  }

  function showWarnings(warnings, result) {
    if (!warnings.length) return;

    console.warn(
      'Datasheet generated with warnings:',
      {
        model: result.model,
        engineeringCode: result.engineeringCode,
        warnings: warnings
      }
    );

    showToast(
      'PDF opened with ' +
      warnings.length +
      (
        warnings.length === 1
          ? ' template warning. '
          : ' template warnings. '
      ) +
      'Check the browser console for details.'
    );
  }

  function schedulePdfUrlCleanup(pdfUrl) {
    // Keep the Blob URL available long enough for the native PDF viewer and
    // printing. It is also revoked when the catalogue tab is closed.
    window.setTimeout(function () {
      const index = state.activePdfUrls.indexOf(pdfUrl);

      if (index !== -1) {
        URL.revokeObjectURL(pdfUrl);
        state.activePdfUrls.splice(index, 1);
      }
    }, 30 * 60 * 1000);
  }

  function revokeAllPdfUrls() {
    state.activePdfUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });

    state.activePdfUrls = [];
  }

  function base64ToBlob(base64, mimeType) {
    const binary = window.atob(base64);
    const chunkSize = 1024 * 1024;
    const chunks = [];

    for (
      let offset = 0;
      offset < binary.length;
      offset += chunkSize
    ) {
      const slice = binary.slice(
        offset,
        offset + chunkSize
      );

      const bytes = new Uint8Array(slice.length);

      for (
        let index = 0;
        index < slice.length;
        index += 1
      ) {
        bytes[index] = slice.charCodeAt(index);
      }

      chunks.push(bytes);
    }

    return new Blob(chunks, {
      type: mimeType
    });
  }

  function serverCall(functionName) {
    const args =
      Array.prototype.slice.call(arguments, 1);

    return new Promise(function (resolve, reject) {
      if (
        !window.google ||
        !google.script ||
        !google.script.run
      ) {
        reject(
          new Error(
            'This page must be opened through ' +
            'the deployed Google Apps Script web app.'
          )
        );
        return;
      }

      let runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (error) {
          reject(
            new Error(
              error && error.message
                ? error.message
                : String(error)
            )
          );
        });

      runner[functionName].apply(
        runner,
        args
      );
    });
  }

  function showLoading(text) {
    el.loadingText.textContent =
      text || 'Loading…';

    el.loading.classList.remove('hidden');
  }

  function hideLoading() {
    el.loading.classList.add('hidden');
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove('hidden');

    window.setTimeout(function () {
      el.toast.classList.add('hidden');
    }, 7000);
  }

  function showFatal(error) {
    el.loadingText.textContent =
      'Application error: ' +
      (error.message || String(error));
  }

  function escapeHtml(value) {
    return String(
      value === null ||
      value === undefined
        ? ''
        : value
    )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
