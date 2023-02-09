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

      this.field('author');
      this.field('title');
      this.field('tag');
      this.field('section');
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

// Fixed elements by ID
const TEMPLATE = document.getElementById('search-display-tpl').content;
const SF_CONTAINER = document.getElementById('search-input-container');
const SERR_CONTAINER = document.getElementById('search-error-container');
const SERR_CONTENT = document.getElementById('search-error-content');
const SRES_COUNT = document.getElementById('results-count');
const SRES_B = document.getElementById('search-results-body');
const SINPUT = document.getElementById('search');

let _handledquery;  // Previously handled query input to handleSearchQuery()

function handleSearchQuery(query) {
  if (!query) {
    hideSearchResults();
    return;
  }

  if (typeof _handledquery !== 'undefined') {
    if (query === _handledquery) {
      // Do nothing; the stuff is already rendered.
      return;
    }
  }

  const results = searchSite(query);
  _handledquery = query;
  if (!results.length) {
    displayErrorMessage(i18n.noResults);
    hideSearchResults();
    return;
  }

  hideErrorMessage();
  renderSearchResults(query, results);
}

function searchSite(query) {
  const originalQuery = query;
  const lunrQuery = getLunrSearchQuery(query);
  let results;
  try {
    results = getSearchResults(lunrQuery);
  } catch (e) {
    if (e instanceof lunr.QueryParseError) {
      return [];
    }
    throw e;
  }

  if (results.length > 0) {
    return results;
  }

  if (lunrQuery !== originalQuery) {
    return getSearchResults(originalQuery);
  }

  return [];
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

//XXX: This function needs revamp.
function getLunrSearchQuery(query) {
  const searchTerms = query.split(' ');
  if (searchTerms.length === 1) {
    return query;
  }
  const searchQuery = searchTerms.map((e) => `+${e}`).join(" ");
  return searchQuery;
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

    // NOTE: To be replaced by new implementations doing the marking, in all
    // supported search-result fields, using result metadata.
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
    content.innerHTML = createSearchResultBlurb(query, item.content);

    fragment.appendChild(result_node);
  }

  SRES_B.appendChild(fragment);

  SRES_COUNT.textContent = results.length;
}

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
// The array `marks` is an array of two-member arrays [location, length], the
// beginning location and the length of each marked part. It is assumed that
// the indices are non-overlapping and sorted in ascending order. Returns a new
// string.
function markTextAt(text, marks) {
  const acc = [];  // text container
  let cur = 0;  // current index
  for (const [low, high] of marks) {
    acc.push(text.slice(cur, low));
    acc.push('<mark class="search-item">');
    acc.push(text.slice(low, high));
    acc.push('</mark>');
    cur = high;
  }
  acc.push(text.slice(cur));
  return acc.join("");
}

function createSearchResultBlurb(query, pageContent) {
  // g: Global search
  // m: Multi-line search
  // i: Case-insensitive search
  const searchQueryRegex = new RegExp(createQueryStringRegex(query), 'gmi');

  // Since the blurb is comprised of full sentences containing any search
  // term, we need a way to identify where each sentence begins/ends. This
  // regex will be used to produce a list of all sentences from the page
  // content.
  const sentenceBoundaryRegex = new RegExp(/(?=[^])(?:\P{Sentence_Terminal}|\p{Sentence_Terminal}(?!['"`\p{Close_Punctuation}\p{Final_Punctuation}\s]))*(?:\p{Sentence_Terminal}+['"`\p{Close_Punctuation}\p{Final_Punctuation}]*|$)/, 'guy');
  const searchQueryHits = Array.from(
    pageContent.matchAll(searchQueryRegex),
    (m) => m.index
  );

  const sentenceBoundaries = Array.from(
    pageContent.matchAll(sentenceBoundaryRegex),
    (m) => m.index
  );

  let parsedSentence = '';
  let searchResultText = '';
  let lastEndOfSentence = 0;
  for (const hitLocation of searchQueryHits) {
    if (hitLocation > lastEndOfSentence) {
      for (let i = 0; i < sentenceBoundaries.length; i++) {
        if (sentenceBoundaries[i] > hitLocation) {
          const startOfSentence = i > 0 ? sentenceBoundaries[i - 1] + 1 : 0;
          const endOfSentence = sentenceBoundaries[i];
          lastEndOfSentence = endOfSentence;
          parsedSentence = pageContent.slice(startOfSentence, endOfSentence).trim();
          searchResultText += `${parsedSentence} ... `;
          break;
        }
      }
    }
    const searchResultWords = tokenize(searchResultText);
    const pageBreakers = searchResultWords.filter((word) => word.length > 50);
    if (pageBreakers.length > 0) {
      searchResultText = fixPageBreakers(searchResultText, pageBreakers);
    }
    if (searchResultWords.length >= searchConfig.maxSummaryLength) break;
  }
  return ellipsize(searchResultText, searchConfig.maxSummaryLength).replace(
    searchQueryRegex,
    '<mark class="search-item">$&</mark>'
  );
}

function createQueryStringRegex(query) {
  const escaped = RegExp.escape(query);
  return escaped.split(' ').length === 1 ? `(${escaped})` : `(${escaped.split(' ').join('|')})`;
}

function tokenize(input) {
  // This is a simple regex that produces a list of words from the text
  // it is applied to. This will be used to check the number of total words
  // in the blurb as it is being built.
  const wordRegex = /\b(\w*)[\W|\s|\b]?/gm;

  const wordMatches = Array.from(input.matchAll(wordRegex), (m) => m);
  return wordMatches.map((m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
    length: m[0].length
  }));
}

function fixPageBreakers(input, largeWords) {
  largeWords.forEach((word) => {
    const chunked = chunkify(word.word, 20);
    input = input.replace(word.word, chunked);
  });
  return input;
}

function chunkify(input, chunkSize) {
  let output = '';
  let totalChunks = (input.length / chunkSize) | 0;
  let lastChunkIsUneven = input.length % chunkSize > 0;
  if (lastChunkIsUneven) {
    totalChunks += 1;
  }
  for (let i = 0; i < totalChunks; i++) {
    let start = i * chunkSize;
    let end = start + chunkSize;
    if (lastChunkIsUneven && i === totalChunks - 1) {
      end = input.length;
    }
    output += input.slice(start, end) + ' ';
  }
  return output;
}

function showSearchResults() {
  document.getElementById('search-results').classList.remove('hide-element');
}

function ellipsize(input, maxLength) {
  const words = tokenize(input);
  if (words.length <= maxLength) {
    return input;
  }
  return input.slice(0, words[maxLength].end) + '...';
}

// RegExp.escape() polyfill
//
// For more see:
// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
// - https://github.com/benjamingr/RegExp.escape/issues/37
if (!Object.prototype.hasOwnProperty.call(RegExp, 'escape')) {
  RegExp.escape = function(str) {
    // $& means the whole matched string
    return str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  };
}

// 'string'.matchAll(str, regex) polyfill
if (!String.prototype.matchAll) {
  String.prototype.matchAll = function (regex) {
    function ensureFlag(flags, flag) {
      return flags.includes(flag) ? flags : flags + flag;
    }
    function* matchAll(str, regex) {
      const localCopy = new RegExp(regex, ensureFlag(regex.flags, 'g'));
      let match;
      while ((match = localCopy.exec(str))) {
        match.index = localCopy.lastIndex - match[0].length;
        yield match;
      }
    }
    return matchAll(this, regex);
  };
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

  SINPUT.addEventListener('keyup', (e) => {
    e.preventDefault();
    const query = preNormalizeInput(SINPUT.value);
    handleSearchQuery(query);
  });

  SINPUT.addEventListener('input', e => {
    if (!e.currentTarget.value) {
      hideSearchResults();
      hideErrorMessage();
    }
  });
});

// Handle search input passed from URL query part.
document.addEventListener('indexed', () => {
  const query = getQueryParam('q');

  if (query) {
    SINPUT.value = query;
    handleSearchQuery(query);
  }
});
