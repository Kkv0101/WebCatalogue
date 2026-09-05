/** Chunked cache helpers. Cache values are split to stay below per-item limits. */
function cacheGetLarge_(key) {
  const cache = CacheService.getScriptCache();
  const countText = cache.get(key + ':count');
  if (!countText) return null;

  const count = Number(countText);
  if (!Number.isFinite(count) || count < 1) return null;

  const keys = [];
  for (let i = 0; i < count; i += 1) keys.push(key + ':part:' + i);
  const parts = cache.getAll(keys);
  const content = keys.map(function (partKey) { return parts[partKey]; });
  if (content.some(function (part) { return typeof part !== 'string'; })) return null;
  return content.join('');
}

function cachePutLarge_(key, value, seconds) {
  if (typeof value !== 'string') throw new Error('Cache value must be a string.');
  const cache = CacheService.getScriptCache();
  const size = CATALOGUE_CONFIG.CACHE_CHUNK_SIZE;
  const count = Math.max(1, Math.ceil(value.length / size));
  const entries = {};
  entries[key + ':count'] = String(count);
  for (let i = 0; i < count; i += 1) {
    entries[key + ':part:' + i] = value.slice(i * size, (i + 1) * size);
  }
  try {
    cache.putAll(entries, seconds || CATALOGUE_CONFIG.CACHE_SECONDS);
  } catch (error) {
    console.warn('Cache write skipped: ' + error.message);
  }
}

function cacheRemoveLarge_(key) {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key + ':count') || 0);
  const keys = [key + ':count'];
  for (let i = 0; i < count; i += 1) keys.push(key + ':part:' + i);
  cache.removeAll(keys);
}

function clearAllCatalogueCaches_() {
  cacheRemoveLarge_('catalogue:snapshot');
  CacheService.getScriptCache().removeAll([
    'catalogue:web-index',
    'catalogue:data-index',
    'catalogue:graphic-3d-index',
    'catalogue:graphic-dimensions-index',
    'catalogue:graphic-electrical-index',
    'catalogue:graphic-envelope-index'
  ]);
}
