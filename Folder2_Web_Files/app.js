(function () {
  'use strict';

  const state = {
    products: [],
    filtered: [],
    activePdfUrls: []
  };

  const ui =
    window.APP_RUNTIME &&
    window.APP_RUNTIME.ui
      ? window.APP_RUNTIME.ui
      : {};

  const el = {};

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', revokeAllPdfUrls);

  async function init() {
    Object.assign(el, {
      loading: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      grid: document.getElementById('product-grid'),
      empty: document.getElementById('empty-state'),
      resultCount: document.getElementById('result-count'),
      search: document.getElementById('search-input'),
      refrigerant: document.getElementById('filter-refrigerant'),
      application: document.getElementById('filter-application'),
      motor: document.getElementById('filter-motor'),
      clear: document.getElementById('clear-filters'),
      title: document.getElementById('app-title'),
      toast: document.getElementById('toast')
    });

    el.title.textContent =
      ui.appTitle ||
      'Condensing Unit Product Catalogue';

    bindEvents();

    try {
      const bootstrap =
        await serverCall('getCatalogueBootstrap');

      state.products = bootstrap.products || [];

      populateSelect(
        el.refrigerant,
        bootstrap.filters &&
        bootstrap.filters.refrigerants
      );

      populateSelect(
        el.application,
        bootstrap.filters &&
        bootstrap.filters.applications
      );

      populateSelect(
        el.motor,
        bootstrap.filters &&
        bootstrap.filters.motorTypes
      );

      applyFilters();
      hideLoading();

      const initial =
        window.APP_RUNTIME &&
        window.APP_RUNTIME.initialProduct;

      if (initial) {
        showToast(
          'Direct product links require a user click to open the PDF tab. ' +
          'Select the matching product from the catalogue.'
        );
        el.search.value = initial;
        applyFilters();
      }
    } catch (error) {
      showFatal(error);
    }
  }

  function bindEvents() {
    [
      el.search,
      el.refrigerant,
      el.application,
      el.motor
    ].forEach(function (control) {
      control.addEventListener(
        control.tagName === 'INPUT'
          ? 'input'
          : 'change',
        applyFilters
      );
    });

    el.clear.addEventListener('click', function () {
      el.search.value = '';
      el.refrigerant.value = '';
      el.application.value = '';
      el.motor.value = '';
      applyFilters();
    });
  }

  function applyFilters() {
    const search =
      el.search.value.trim().toLowerCase();

    state.filtered = state.products.filter(
      function (product) {
        const searchable = [
          product.model,
          product.engineeringCode,
          product.powerSupply
        ].join(' ').toLowerCase();

        return (
          (!search || searchable.includes(search)) &&
          (
            !el.refrigerant.value ||
            product.refrigerant ===
              el.refrigerant.value
          ) &&
          (
            !el.application.value ||
            product.application ===
              el.application.value
          ) &&
          (
            !el.motor.value ||
            product.motorType === el.motor.value
          )
        );
      }
    );

    renderProductGrid();
  }

  function renderProductGrid() {
    el.grid.innerHTML = state.filtered.map(
      function (product) {
        return (
          '<button class="product-card" ' +
          'type="button" data-code="' +
          escapeHtml(product.engineeringCode) +
          '" data-model="' +
          escapeHtml(product.model) +
          '">' +
            '<span class="model">' +
              escapeHtml(product.model) +
            '</span>' +
            '<span class="code">' +
              escapeHtml(product.engineeringCode) +
            '</span>' +
            '<span class="specs">' +
              cardSpec(
                'Refrigerant',
                product.refrigerant
              ) +
              cardSpec(
                'Application',
                product.application
              ) +
              cardSpec(
                'Motor',
                product.motorType
              ) +
              cardSpec(
                'Power supply',
                product.powerSupply
              ) +
              cardSpec(
                'Capacity (W)',
                formatCapacity(
                  product.performance
                )
              ) +
              cardSpec(
                'COP (W/W)',
                formatCop(
                  product.performance
                )
              ) +
            '</span>' +
            '<span class="open-label">' +
              'Open PDF datasheet in new tab →' +
            '</span>' +
          '</button>'
        );
      }
    ).join('');

    el.grid.querySelectorAll(
      '.product-card'
    ).forEach(function (button) {
      button.addEventListener('click', function () {
        openProductInNewTab(
          button.dataset.code,
          button.dataset.model
        );
      });
    });

    el.resultCount.textContent =
      state.filtered.length +
      (
        state.filtered.length === 1
          ? ' product'
          : ' products'
      );

    el.empty.classList.toggle(
      'hidden',
      state.filtered.length !== 0
    );
  }

  /**
   * Opens a blank tab synchronously during the click event. This prevents the
   * browser popup blocker from rejecting the later asynchronous PDF result.
   */
  async function openProductInNewTab(code, model) {
    const pdfWindow = window.open('', '_blank');

    if (!pdfWindow) {
      showToast(
        'The browser blocked the PDF tab. ' +
        'Allow pop-ups for this Apps Script application and try again.'
      );
      return;
    }

    writeLoadingPage(pdfWindow, model, code);
    showLoading(
      'Generating ' +
      (model || code) +
      ' PDF datasheet…'
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
        code
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
        replacements
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

  function writeLoadingPage(targetWindow, model, code) {
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
              [model, code].filter(Boolean).join(' — ')
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

  function populateSelect(select, values) {
    (values || []).forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function formatCapacity(performance) {
    if (
      !performance ||
      performance.available !== true ||
      !Number.isFinite(
        Number(
          performance.coolingCapacityW
        )
      )
    ) {
      return '—';
    }

    return String(
      Math.round(
        Number(
          performance.coolingCapacityW
        )
      )
    );
  }

  function formatCop(performance) {
    if (
      !performance ||
      performance.available !== true ||
      !Number.isFinite(
        Number(performance.copWW)
      )
    ) {
      return '—';
    }

    return Number(
      performance.copWW
    ).toFixed(2);
  }

  function cardSpec(label, value) {
    return (
      '<span class="spec">' +
        '<span>' +
          escapeHtml(label) +
        '</span>' +
        '<strong>' +
          escapeHtml(value || '—') +
        '</strong>' +
      '</span>'
    );
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
