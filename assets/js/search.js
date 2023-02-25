import {searchConfig, i18n} from '@params';

let pagesIndex, searchIndex;

async function initSearchIndex() {
  try {
    const response = await fetch(searchConfig.indexURI);

    if (!response.ok) return;

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

      // Make the ranking "softer" for local hot words and document length.
      this.k1(1.05);
      this.b(0.6);

      pagesIndex.forEach((page) => this.add(page));
    });
    document.dispatchEvent(new CustomEvent('indexed'));
  } catch (e) {
    console.log(e); // eslint-disable-line no-console
  }
}

// See https://lunrjs.com/guides/customising.html#pipeline-functions
const RE_DIA = new RegExp(/[\u0300-\u036f]/g);

function _dediac(str) {
  return str.normalize("NFD").replace(RE_DIA, "");
}

function normalizeDiac(builder) {
  function pipelineFunction(token) {
    let s = token.toString();
    return token.update(() => _dediac(s));
  };
  lunr.Pipeline.registerFunction(pipelineFunction, "normalizeDiac");
  builder.pipeline.before(lunr.stemmer, pipelineFunction);
  // Not necessary to add this to search input pipeline.
}

// Fixed elements by ID
const ITEM_PROTO = document.getElementById('search-display-tpl')
                           .content.querySelector("article");
const MARK_PROTO = document.createElement("mark");
MARK_PROTO.className = "search-hit";
const SR_REGION = document.getElementById('search-output-region');
const SF_CONTAINER = document.getElementById('search-input-container');
const SERR_CONTAINER = document.getElementById('search-error-container');
const SERR_CONTENT = document.getElementById('search-error-content');
const SRES_CONTAINER = document.getElementById('search-results');
const SRES_COUNT = document.getElementById('results-count');
const SRES_B = document.getElementById('search-results-body');
const SINPUT = document.getElementById('search');

let _handledquery;  // Previously handled query input to handleSearchQuery()
let _lastbad = false;

function handleSearchQuery(query) {
  SR_REGION.ariaBusy = "true";
  SR_REGION.setAttribute("aria-busy", "true");
  const results = searchSite(query);
  _handledquery = query;
  if (!results.length) {
    _lastbad = true;
    showErrorMessage(i18n.noResults);
    hideSearchResults();
    SR_REGION.ariaBusy = "false";
    SR_REGION.setAttribute("aria-busy", "false");
    return;
  }
  _lastbad = false;
  hideErrorMessage();
  renderSearchResults(query, results);
  SR_REGION.ariaBusy = "false";
  SR_REGION.setAttribute("aria-busy", "false");
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

  return searchIndex.search(query);
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

function enableForm() {
  SINPUT.removeAttribute("readonly");
  const b = document.getElementById("search-act");
  if (b) {
    b.removeAttribute("disabled");
  }
}

function showErrorMessage(message) {
  SF_CONTAINER.classList.add('form-item-error');
  SERR_CONTENT.textContent = message;
  SERR_CONTAINER.classList.remove('hide-element');
}

function hideErrorMessage() {
  SF_CONTAINER.classList.remove('form-item-error');
  SERR_CONTAINER.classList.add('hide-element');
  SERR_CONTENT.textContent = '';
}

function showSearchResults() {
  SRES_CONTAINER.classList.remove('hide-element');
}

function hideSearchResults() {
  SRES_CONTAINER.classList.add('hide-element');
}

function renderSearchResults(query, results) {
  clearSearchResults();
  updateSearchResults(query, results);
  showSearchResults();
}

function clearSearchResults() {
  SRES_B.textContent = '';
  SRES_COUNT.textContent = '';
}

function _fill_with_text(node, str, marks) {
  const ts = [];
  if (marks) {
    addMarkedTextInto(ts, str, marks);
  } else {
    ts.push(str);
  }
  node.append(...ts);
}

const ARTICLE_COLLECTION = new DocumentFragment();
function updateSearchResults(query, results) {
  let len;
  if (searchConfig.maxResults <= 0) {
    len = results.length;
  } else {
    len = Math.min(results.length, searchConfig.maxResults);
  }

  for (let i = 0; i < len ; i++) {
    const resinfo = results[i];
    const hit = pagesIndex[resinfo.ref];
    const minfo = parseForPositions(resinfo.matchData.metadata);

    const article_node = ITEM_PROTO.cloneNode(true);
    // Title with hyperlink to the page with hits.
    const title_link = article_node.querySelector('a');
    _fill_with_text(title_link, hit.title, minfo.title);
    title_link.href = hit.href;

    // Date is not a search field, simply add text.
    const date_span = article_node.querySelector('.tm-date');
    date_span.textContent = hit.date;

    // Author may be highlighted.
    const author_span = article_node.querySelector('.tm-author');
    _fill_with_text(author_span, hit.author, minfo.author);

    // Excerpt content
    const content_p = article_node.querySelector('.post-content');
    let ts;
    if (minfo.content) {
      ts = processContentHighlight(hit.content, minfo.content);
    } else {
      // The search-hit is not in content, create an excerpt anyway.
      const l = 100;  // NOTE: hard-coded.
      const newl = _adjustForBound(hit.content, l, 0, -1);
      ts = [hit.content.slice(0, newl)];
      if (hit.content.length > newl) {
        ts.push(newEllip(" …"));
      }
    }
    content_p.append(...ts);

    article_node.dataset.score = resinfo.score.toFixed(2);
    article_node.normalize();

    // Collect this article into the frag.
    ARTICLE_COLLECTION.appendChild(article_node);
  }

  SRES_COUNT.textContent = results.length.toString();

  SRES_B.textContent = '';

  SRES_B.appendChild(ARTICLE_COLLECTION);
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

  for (const [k, v] of Object.entries(result)) {
    v.sort((a, b) => a[0] - b[0]);
    result[k] = mergeIndices(v);
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

// Create a node in a <mark class="search-item"> element with the text as its
// content.
function newHighlight(text) {
  const mark = MARK_PROTO.cloneNode(false);
  mark.textContent = text;
  return mark;
}

const SPAN_PROTO = document.createElement("span");
SPAN_PROTO.className = "ell";
function newEllip(txt) {
  const span = SPAN_PROTO.cloneNode(false);
  span.textContent = txt;
  return span;
}

// Mark the text str using <mark class="search-item">...</mark> at given
// offsets. The array `marks` is an array of two-member arrays [low, high]
// bracketing the marked part. Optionally, each bracket can be interpreted as if
// it was to be shifted back by a base offset. It is assumed that the indices
// are non-overlapping and sorted in ascending order.
function addMarkedTextInto(arr, str, marks, base = 0) {
  let cur = 0;  // current index
  for (let [low, high] of marks) {
    low -= base;
    high -= base;
    arr.push(str.slice(cur, low));
    arr.push(newHighlight(str.slice(low, high)));
    cur = high;
  }
  arr.push(str.slice(cur));
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
function createMarkContext(text, raw_marks, c_rad) {
  if (!raw_marks.length) {
    return [];
  }

  const tlen = text.length;

  const end_idx = (searchConfig.maxHitsPerResult <= 0)?
                  raw_marks.length:
                  searchConfig.maxHitsPerResult;

  // Initial object
  let [cur_low, cur_high] = raw_marks[0];
  const res = [{"context": trimContext(cur_low - c_rad, cur_high + c_rad, tlen),
                "mark": [[cur_low, cur_high]]}];
  let cur_obj = res[0];
  let tc_low, tc_high;
  // For the rest of the input raw_marks array
  for (const [low, high] of raw_marks.slice(1, end_idx)) {
    [tc_low, tc_high] = trimContext(low - c_rad, high + c_rad, tlen);
    [cur_low, cur_high] = cur_obj.context;
    if (tc_low <= cur_high) {
      // Extend current context and put this mark in it.
      cur_obj.context[1] = tc_high;
      cur_obj.mark.push([low, high]);
    } else {
      // Should open new context with the mark.
      cur_obj = {};
      cur_obj.context = [tc_low, tc_high];
      cur_obj.mark = [[low, high]];
      res.push(cur_obj);
    }
  }
  res.forEach((cobj) => {
    _cutAtWord(cobj, text);
  });
  return res;
}

const RE_LETT = new RegExp("[\\p{L}\\p{gc=Mark}\\p{gc=Connector_Punctuation}\\p{Join_Control}]", "u");
function _adjustForBound(text, index, bound, step = 1) {
  if ((index === 0 && step > 0) || (index === text.length && step < 0)
       || RE_HAN.test(text[index])) {
    return index;
  }

  if (step > 0) {
    if (RE_LETT.test(text[index]) && !RE_LETT.test(text[index - 1])) {
      return index;
    }
  } else if (step < 0) {
    if (RE_LETT.test(text[index - 1]) && !RE_LETT.test(text[index])) {
      return index;
    }
  }

  let i;
  let first_chunk = true;
  let second_chunk = false;
  for (i = index; step * (i - bound) < 0; i += step) {
    if (first_chunk) {
      if (RE_LETT.test(text[i])) {
        continue;
      }
      first_chunk = false;
      second_chunk = true;
    }

    if (second_chunk) {
      if (!RE_LETT.test(text[i])) {
        continue;
      }
      break;
    }
  }
  return i + (step < 0);
}

function _cutAtWord(cobj, text) {
  let n = cobj.context[0];
  cobj.context[0] = _adjustForBound(text, n, cobj.mark[0][0]);
  n = cobj.context[1];
  cobj.context[1] = _adjustForBound(text, n, cobj.mark.at(-1)[1], -1);
}

function trimContext(low, high, ub) {
  return [Math.max(0, low), Math.min(high, ub)]
}

function processContentHighlight(text, raw_marks, c_rad = 45) {
  const acc = [];
  // Array of contexts-with-marks.
  const carr = createMarkContext(text, raw_marks, c_rad);
  acc.push(newEllip(carr[0].context[0] > 0 ? "… [" : "["));

  const last = carr.length - 1;
  for (let i = 0; i <= last; i++) {
    const cinfo = carr[i];
    const base = cinfo.context[0];
    let tb = text.slice(...cinfo.context);

    addMarkedTextInto(acc, tb, cinfo.mark, base);

    if (i != last) {
      acc.push(newEllip("] … ["));
    }

  }

  acc.push(newEllip(carr.at(-1).context[1] < text.length ?
                    "] …" : "]"));
  return acc;
}

function preNormalizeInput(str) {
  return _dediac(str).split(/\s/)
                     .filter((e) => !!e)
                     .join(" ")  // Remove extra whitespace
                     .toLowerCase();  // Normalize case
}

// Emulate the URL change of search action.
const urlEmulate = new Proxy(new URLSearchParams(location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
  set: (searchParams, prop, value) => {
    searchParams.set(prop, value);
    window.history.replaceState({}, '', `${location.pathname}?${searchParams}`)
  },
  deleteProperty: (searchParams, prop) => {
    searchParams.delete(prop);
    window.history.replaceState({}, '', `${location.pathname}`)
  }
});

function inputEventHandler(e) {
  e.preventDefault();
  // If input empty, output should be empty (made hidden) too.
  if (!SINPUT.value) {
    hideErrorMessage();
    hideSearchResults();
    delete urlEmulate.q;
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
      showErrorMessage(i18n.noResults);
    } else {
      showSearchResults();
    }
    return;
  }

  // Actual, long code-path doing a real search.
  handleSearchQuery(query);
  urlEmulate.q = SINPUT.value;
}

document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');

  if (searchForm === null || SINPUT === null) {
    return;
  }

  // Intercept form submission.
  searchForm.addEventListener('submit', inputEventHandler);
});

// Handle search input passed from URL query part.
document.addEventListener('indexed', () => {
  const query = urlEmulate.q;

  if (query) {
    const pnQuery = preNormalizeInput(query);
    if (pnQuery) {
      handleSearchQuery(pnQuery);
    }
    SINPUT.value = query;
  }
});

initSearchIndex();
enableForm();
