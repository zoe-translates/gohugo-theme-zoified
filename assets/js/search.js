import {searchConfig, i18n} from '@params';

let pagesIndex, searchIndex;

async function initSearchIndex() {
  try {
    const response = await fetch(searchConfig.indexURI);

    if (response.status !== 200) return;

    pagesIndex = await response.json();

    // Create the lunr index for the search
    searchIndex = lunr(function () { // eslint-disable-line no-undef
      // Set up the pipeline for indexing content in multiple languages
      if (Array.isArray(searchConfig.lunrLanguages)) {
        let langs = new Set();
        searchConfig.lunrLanguages.forEach(item => langs.add(item));
        langs.add('en');
        const pipeline = lunr.multiLanguage( // eslint-disable-line no-undef
          ...langs
        );

        this.use(pipeline);
      }
      this.use(normalizeDiac);

      this.field('author');
      this.field('title');
      this.field('content');

      this.ref('revid');
      this.metadataWhitelist = ['position']

      pagesIndex.forEach((page) => this.add(page));
    });
    document.dispatchEvent(new CustomEvent('indexed'));
  } catch (e) {
    console.log(e); // eslint-disable-line no-console
  }
}

// See https://lunrjs.com/guides/customising.html#pipeline-functions
const RE_DIA = new RegExp(/[\u0300-\u036f]/g);
function normalizeDiac(builder) {
  function pipelineFunction(token) {
    let s = token.toString();
    return token.update(() => s.normalize("NFD").replace(RE_DIA, ""));
  };
  lunr.Pipeline.registerFunction(pipelineFunction, "normalizeDiac");
  builder.pipeline.before(lunr.stemmer, pipelineFunction);
  builder.searchPipeline.before(lunr.stemmer, pipelineFunction);
}

// Fixed elements by ID
const TEMPLATE = document.getElementById('search-display-tpl').content;
const SF_CONTAINER = document.getElementById('search-input-container');
const SERR_CONTAINER = document.getElementById('search-error-container');
const SERR_CONTENT = document.getElementById('search-error-content');
const SRES_COUNT = document.getElementById('results-count');
const SRES_B = document.getElementById('search-results-body');
const SINPUT = document.getElementById('search');

let _handledquery;  // Previously handled query input to handleSearchQuery()
let _lastbad = false;

function handleSearchQuery(query) {
  const results = searchSite(query);
  _handledquery = query;
  if (!results.length) {
    _lastbad = true;
    displayErrorMessage(i18n.noResults);
    hideSearchResults();
    return;
  }
  _lastbad = false;
  hideErrorMessage();
  renderSearchResults(query, results);
}

function searchSite(query) {
  const lunrQuery = getLunrSearchQuery(query);
  if (!lunrQuery) {
    return [];
  }

  let results;
  try {
    results = getSearchResults(lunrQuery);
  } catch (e) {
    if (e instanceof lunr.QueryParseError) {
      return [];
    }
    throw e;
  }
  return results;
}

function getSearchResults(query) {
  if (typeof searchIndex === 'undefined') return [];

  return searchIndex.search(query).map((hit) => {
    const pageMatch = pagesIndex[hit.ref];
    pageMatch.score = hit.score;
    pageMatch.metadata = hit.matchData.metadata;
    return pageMatch;
  });
}

const RE_HAN = new RegExp("\\p{sc=Han}", "u");

function _notTooShort(text) {
  if (!RE_HAN.test(text)) {
    if (text.startsWith("+") || text.startsWith("-")) {
      return text.length > 2;
    }
    return text.length > 1;
  }
  return true;
}

function getLunrSearchQuery(query) {
  // Filter out terms that are too short (one letter).
  const searchTerms = query.split(' ').filter(_notTooShort);
  // If all of them starts with the minus, it is almost guaranteed there will be
  // too many hits.
  if (searchTerms.every((w) => w.startsWith("-"))) {
    return "";
  }
  return searchTerms.join(" ");
}

function displayErrorMessage(message) {
  SF_CONTAINER.classList.add('form-item-error');
  SF_CONTAINER.classList.remove('focused');
  SERR_CONTENT.textContent = message;
  SERR_CONTAINER.classList.remove('hide-element');
}

function hideErrorMessage() {
  SF_CONTAINER.classList.add('focused');
  SF_CONTAINER.classList.remove('form-item-error');
  SERR_CONTAINER.classList.add('hide-element');
  SERR_CONTENT.textContent = '';
}

function showSearchResults() {
  document.getElementById('search-results').classList.remove('hide-element');
}

function hideSearchResults() {
  document.getElementById('search-results').classList.add('hide-element');
}

function renderSearchResults(query, results) {
  clearSearchResults();
  updateSearchResults(query, results);
  showSearchResults();
}

function clearSearchResults() {
  SRES_B.innerHTML = '';
  SRES_COUNT.textContent = '';
}

function updateSearchResults(query, results) {
  const fragment = document.createDocumentFragment();

  SRES_B.innerHTML = '';

  for (const id in results) {
    const item = results[id];
    const result_node = TEMPLATE.cloneNode(true);

    const minfo = parseForPositions(item.metadata);

    const article = result_node.querySelector('article');
    article.dataset.score = item.score.toFixed(2);

    const a = result_node.querySelector('a');
    a.href = item.href;
    a.innerHTML = minfo.title? markTextAt(item.title, minfo.title): item.title;

    // Date is not a search field.
    const date = result_node.querySelector('.tm-date');
    date.textContent = item.date;

    const author = result_node.querySelector('.tm-author');
    author.innerHTML = minfo.author?
                       markTextAt(item.author, minfo.author):
                       item.author;

    const content = result_node.querySelector('.post-content');
    let excerpt;
    if (minfo.content) {
      // Create excerpt by including the context and the marks within.
      excerpt = processContentHighlight(item.content, minfo.content);
    } else {
      // The search-hit is not in content, create an excerpt anyway.
      excerpt = item.content.slice(0, 100);  // NOTE: hard-coded length
      // NOTE: This excerpt should be right-adjusted too.
      if (item.content.length > 100) {
        excerpt += " …";
      }
    }
    content.innerHTML = excerpt;

    fragment.appendChild(result_node);
  }

  SRES_B.appendChild(fragment);

  SRES_COUNT.textContent = results.length;
}

// Read the per-doc search result to collect the hit-position data, and gather
// them by field (author, title, content, ...);
function parseForPositions(metadata) {
  const result = {};

  // Over each search-query fragment
  for (const [, matchinfo] of Object.entries(metadata)) {
    // Over each search field
    for (const [field, {position: indices}] of Object.entries(matchinfo)) {
      if (!result[field]) {
        result[field] = [];
      }
      // Over each (base + offset) index pair
      for (const [base, offset] of indices) {
        result[field].push([base, base + offset]);
      }
    }
  }

  let val;
  for (const k in result) {
    val = result[k]
    val.sort((a, b) => a[0] - b[0]);
    result[k] = mergeIndices(val);
  }
  return result;
}

// Merge any overlapping brackets.
function mergeIndices(arr) {
  if (!arr.length) {
    return arr;
  }

  const res = [];

  let p = 0;
  let phigh = arr[0][1];
  res[0] = arr[0];

  for (const [low, high] of arr.slice(1)) {
    if (low > phigh) {
      res.push([low, high]);
      phigh = high;
      p++;
    } else if (high > phigh) {
      res[p][1] = high;
      phigh = high;
    }
  }

  return res;
}

// Mark the text using <mark class="search-item">...</mark> at given offsets.
// The array `marks` is an array of two-member arrays [low, high] bracketing the
// marked part. Optionally, each bracket can be interpreted as if it was to be
// shifted back by a base offset. It is assumed that the indices are
// non-overlapping and sorted in ascending order. Returns a new string.
function markTextAt(text, marks, base = 0) {
  const acc = [];  // text container
  let cur = 0;  // current index
  for (let [low, high] of marks) {
    low -= base;
    high -= base;
    acc.push(text.slice(cur, low));
    acc.push('<mark class="search-item">');
    acc.push(text.slice(low, high));
    acc.push('</mark>');
    cur = high;
  }
  acc.push(text.slice(cur));
  return acc.join("");
}

// Using an array of sorted and disjoint [low, high] marks, create the following
// data structure:
//   [{
//      "context": [c_low, c_high],
//      "mark": [[low, high], [low, high] ...]
//    }, ...]
// where in each object, the "mark"s belong to the "context" blocked delimited
// by c_low and c_high. The context blocks are kept within the bounds of the
// text itself.
function createMarkContext(tlen, raw_marks, c_rad) {
  if (!raw_marks.length) {
    return [];
  }

  // Initial object
  let [cur_low, cur_high] = raw_marks[0];
  const res = [{"context": trimContext(cur_low - c_rad, cur_high + c_rad, tlen),
                "mark": [[cur_low, cur_high]]}];
  let cur_obj = res[0];
  let tc_low, tc_high;
  // For the rest of the input raw_marks array
  for (const [low, high] of raw_marks.slice(1)) {
    [tc_low, tc_high] = trimContext(low - c_rad, high + c_rad, tlen);
    [cur_low, cur_high] = cur_obj.context;
    if (tc_low <= cur_high) {
      // Extend current context and put this mark in it.
      cur_obj.context[1] = tc_high;
      cur_obj.mark.push([low, high]);
    } else {
      // Should open new context with the mark.
      // But check broken-word at context boundary first (not implemented).
      // Open next context.
      cur_obj = {};
      cur_obj.context = [tc_low, tc_high];
      cur_obj.mark = [[low, high]];
      res.push(cur_obj);
    }
  }
  return res;
}

function trimContext(low, high, ub) {
  return [Math.max(0, low), Math.min(high, ub)]
}

// For the given text string, and an array of raw marks [low, high], each
// bracketing the highlight, generate an excerpt. In each sub-unit (context
// block) of the excerpt, there are roughly c_rad characters at the beginning
// and end each, surrounding any highlighted text. The sub-units are joined by
// the ellipsis, unless it hits either end of the full text.
function processContentHighlight(text, raw_marks, c_rad = 45) {
  const acc = [];
  // Array of contexts-with-marks.
  const carr = createMarkContext(text.length, raw_marks, c_rad);
  if (carr[0].context[0] > 0) {
    acc.push("");
  }
  carr.forEach( (cinfo) => {
    // NOTE: Possibly do context-bound adjustment here.
    const base = cinfo.context[0];
    const tb = text.slice(...cinfo.context);
    const frag = markTextAt(tb, cinfo.mark, base);
    acc.push(frag);
  });
  if (carr[carr.length - 1].context[1] < text.length) {
    acc.push("");
  }
  return acc.join(" … ");
}

function getQueryParam(key) {
  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop)
  });

  return params[key];
}

function preNormalizeInput(str) {
  return str.split(/\s/)
            .filter((e) => !!e)
            .join(" ")  // Remove extra whitespace
            .toLowerCase();  // Normalize case
}

const SCHECKBOX = document.getElementById('sidebar-checkbox');

function inputSoftFocus(e) {
  SCHECKBOX.checked = 0;
}

function inputEventHandler(e) {
  // If still composing, consume event and do nothing.
  if (e.isComposing) {
    return;
  }
  e.preventDefault();

  // If input empty, output should be empty (made hidden) too.
  if (!SINPUT.value) {
    hideErrorMessage();
    hideSearchResults();
    return;
  }

  // Pre-normalize input to intercept trivial modifications such as
  // adding/removing space characters.
  const query = preNormalizeInput(SINPUT.value);
  if (!query) {
    hideErrorMessage();
    hideSearchResults();
    return;
  }
  // If after pre-norm the query stays the same as last-handled.
  if (query === _handledquery) {
    // Result is either "bad" (error) or "not bad" (with results) -- ensured by
    // the actual query function. Here we simulate this by selectively display
    // part of the output elements.
    if (_lastbad) {
      displayErrorMessage(i18n.noResults);
    } else {
      showSearchResults();
    }
    return;
  }

  // Actual, long code-path doing a real search.
  handleSearchQuery(query);
}

initSearchIndex();

document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');

  if (searchForm === null || SINPUT === null) {
    return;
  }

  searchForm.addEventListener('submit', (e) => e.preventDefault());

  if (SCHECKBOX !== null) {
    SINPUT.addEventListener('mouseup', inputSoftFocus);
  }

  SINPUT.addEventListener('input', inputEventHandler);
});

// Handle search input passed from URL query part.
document.addEventListener('indexed', () => {
  const query = getQueryParam('q');

  if (query) {
    SINPUT.value = query;
    const pnQuery = preNormalizeInput(query);
    if (pnQuery) {
      handleSearchQuery(pnQuery);
    }
  }
});
