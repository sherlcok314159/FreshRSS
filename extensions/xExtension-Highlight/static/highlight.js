'use strict';

/* globals context */

(function () {
	var CONF = null;
	var toolbar = null;
	var removePopup = null;
	var notice = null;
	var noticeTimer = null;
	var pendingEntryId = null;
	var pendingRange = null;
	var CONTEXT_RADIUS = 80;
	var initDebounce = null;

	function scheduleInit() {
		if (initDebounce) clearTimeout(initDebounce);
		initDebounce = setTimeout(function () {
			initDebounce = null;
			var deferred = document.querySelectorAll('.highlight-data[data-hl-deferred]');
			for (var d = 0; d < deferred.length; d++) {
				deferred[d].removeAttribute('data-hl-deferred');
			}
			initHighlights();
		}, 200);
	}

	function getConf() {
		if (CONF) return CONF;
		if (typeof context !== 'undefined' && context.extensions && context.extensions.highlight) {
			CONF = context.extensions.highlight;
		}
		return CONF;
	}

	function getBaseUrl() {
		var base = document.querySelector('base');
		if (base && base.href) {
			return base.href.replace(/\/$/, '');
		}
		return location.origin + location.pathname.replace(/\/i\/.*$/, '').replace(/\/$/, '');
	}

	function getSaveUrl() {
		return getBaseUrl() + '/i/?c=highlight&a=save';
	}

	function getDeleteUrl() {
		return getBaseUrl() + '/i/?c=highlight&a=delete';
	}

	function getMessage(key, fallback) {
		var conf = getConf();
		if (conf && conf.i18n && conf.i18n[key]) {
			return conf.i18n[key];
		}
		return fallback;
	}

	function createNotice() {
		if (notice) return notice;

		notice = document.createElement('div');
		notice.setAttribute('role', 'status');
		notice.setAttribute('aria-live', 'polite');
		notice.style.display = 'none';
		notice.style.position = 'fixed';
		notice.style.right = '16px';
		notice.style.bottom = '16px';
		notice.style.zIndex = '100001';
		notice.style.maxWidth = '320px';
		notice.style.padding = '10px 14px';
		notice.style.borderRadius = '6px';
		notice.style.color = '#fff';
		notice.style.background = 'rgba(185, 28, 28, 0.95)';
		notice.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.22)';
		notice.style.fontSize = '13px';
		notice.style.lineHeight = '1.4';
		notice.style.fontFamily = 'inherit';
		document.body.appendChild(notice);

		return notice;
	}

	function showNotice(message) {
		if (!message) return;

		var el = createNotice();
		el.textContent = message;
		el.style.display = 'block';

		if (noticeTimer) {
			clearTimeout(noticeTimer);
		}
		noticeTimer = window.setTimeout(function () {
			el.style.display = 'none';
		}, 3500);
	}

	// --- Toolbar ---

	function createToolbar() {
		if (toolbar) return toolbar;
		toolbar = document.createElement('div');
		toolbar.className = 'hl-toolbar';
		toolbar.innerHTML = '<button class="hl-btn-add" type="button"></button>';
		toolbar.style.display = 'none';
		document.body.appendChild(toolbar);

		toolbar.querySelector('.hl-btn-add').addEventListener('mousedown', function (e) {
			e.preventDefault();
			e.stopPropagation();
			applyHighlight();
		});

		return toolbar;
	}

	function showToolbar(x, y) {
		var conf = getConf();
		if (!toolbar) createToolbar();
		var btn = toolbar.querySelector('.hl-btn-add');
		btn.textContent = (conf && conf.i18n && conf.i18n.highlight) || 'Highlight';
		toolbar.style.display = 'block';
		var tw = toolbar.offsetWidth;
		var th = toolbar.offsetHeight;
		var left = Math.max(4, Math.min(x - tw / 2, window.innerWidth - tw - 4));
		var top = y - th - 8;
		if (top < 4) top = y + 8;
		toolbar.style.left = left + 'px';
		toolbar.style.top = top + 'px';
	}

	function hideToolbar() {
		if (toolbar) toolbar.style.display = 'none';
		pendingRange = null;
		pendingEntryId = null;
	}

	// --- Remove popup ---

	function createRemovePopup() {
		if (removePopup) return removePopup;
		removePopup = document.createElement('div');
		removePopup.className = 'hl-remove-popup';
		removePopup.innerHTML = '<button class="hl-btn-remove" type="button"></button>';
		removePopup.style.display = 'none';
		document.body.appendChild(removePopup);
		return removePopup;
	}

	function showRemovePopup(hlSpan) {
		var conf = getConf();
		if (!removePopup) createRemovePopup();
		var btn = removePopup.querySelector('.hl-btn-remove');
		btn.textContent = (conf && conf.i18n && conf.i18n.remove) || 'Remove';

		btn.onclick = function (e) {
			e.preventDefault();
			e.stopPropagation();
			removeHighlight(hlSpan);
			hideRemovePopup();
		};

		removePopup.style.display = 'block';
		var rect = hlSpan.getBoundingClientRect();
		var pw = removePopup.offsetWidth;
		var left = Math.max(4, Math.min(rect.left + rect.width / 2 - pw / 2 + window.scrollX, window.innerWidth - pw - 4));
		var top = rect.top + window.scrollY - removePopup.offsetHeight - 6;
		if (top < window.scrollY + 4) top = rect.bottom + window.scrollY + 6;
		removePopup.style.left = left + 'px';
		removePopup.style.top = top + 'px';
	}

	function hideRemovePopup() {
		if (removePopup) removePopup.style.display = 'none';
	}

	// --- Text node utilities ---

	function getTextNodes(root) {
		var nodes = [];
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
		var node;
		while ((node = walker.nextNode())) {
			nodes.push(node);
		}
		return nodes;
	}

	function getFullText(root) {
		var nodes = getTextNodes(root);
		return nodes.map(function (n) { return n.nodeValue || ''; }).join('');
	}

	function getBoundaryOffset(root, container, offset) {
		var range = document.createRange();
		range.selectNodeContents(root);
		try {
			range.setEnd(container, offset);
		} catch (e) {
			return 0;
		}
		return range.toString().length;
	}

	function buildRangeFromOffsets(contentEl, startOffset, endOffset) {
		if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset < startOffset) {
			return null;
		}

		var textNodes = getTextNodes(contentEl);
		if (!textNodes.length) return null;

		var range = document.createRange();
		var charCount = 0;
		var startSet = false;
		var endSet = false;

		for (var i = 0; i < textNodes.length; i++) {
			var nodeLen = (textNodes[i].nodeValue || '').length;
			if (!startSet && charCount + nodeLen >= startOffset) {
				range.setStart(textNodes[i], Math.max(0, startOffset - charCount));
				startSet = true;
			}
			if (startSet && charCount + nodeLen >= endOffset) {
				range.setEnd(textNodes[i], Math.max(0, endOffset - charCount));
				endSet = true;
				break;
			}
			charCount += nodeLen;
		}

		if (!startSet || !endSet) return null;
		return range;
	}

	function unwrapHighlight(hlSpan) {
		if (!hlSpan || !hlSpan.parentNode) return;

		var parent = hlSpan.parentNode;
		while (hlSpan.firstChild) {
			parent.insertBefore(hlSpan.firstChild, hlSpan);
		}
		parent.removeChild(hlSpan);
		parent.normalize();
	}

	function hasHighlightSpan(contentEl, highlightId) {
		if (!contentEl || !highlightId) return false;

		var spans = contentEl.querySelectorAll('.freshrss-highlight');
		for (var i = 0; i < spans.length; i++) {
			if (spans[i].getAttribute('data-hl-id') === highlightId) {
				return true;
			}
		}
		return false;
	}

	function findContentContainer(el) {
		if (!el || !el.closest) return null;
		if (el.classList && el.classList.contains('content')) {
			return el;
		}

		var content = el.closest('.content');
		if (content) {
			return content;
		}

		var flux = el.closest('.flux');
		if (!flux) return null;
		return flux.querySelector('.content');
	}

	function findEntryId(contentEl) {
		if (!contentEl || !contentEl.closest) return null;

		var marker = contentEl.querySelector('.highlight-data');
		if (marker) return marker.getAttribute('data-entry-id');

		var flux = contentEl.closest('.flux');
		if (!flux) {
			var directEntryId = contentEl.getAttribute('data-entry-id');
			return directEntryId || null;
		}

		var dataEl = flux.querySelector('.highlight-data');
		if (dataEl) return dataEl.getAttribute('data-entry-id');
		var entryId = flux.getAttribute('data-entry-id') || flux.id;
		if (entryId && entryId.indexOf('flux_') === 0) {
			return entryId.substring(5);
		}
		return entryId || null;
	}

	// --- Serialization ---

	function stripMathDuplicates(container) {
		var selectors = [
			'.katex-mathml',
			'mjx-assistive-mml',
			'script[type="math/tex"]',
			'script[type="math/tex; mode=display"]',
			'.MathJax_Preview',
			'.MJX_Assistive_MathML'
		];
		var dupes = container.querySelectorAll(selectors.join(','));
		for (var i = 0; i < dupes.length; i++) {
			dupes[i].parentNode.removeChild(dupes[i]);
		}
		var annotations = container.querySelectorAll('annotation');
		for (var i = 0; i < annotations.length; i++) {
			annotations[i].parentNode.removeChild(annotations[i]);
		}
	}

	function serializeHighlight(range, contentEl) {
		var text = range.toString();
		if (!text || text.trim() === '') return null;

		var fragment = range.cloneContents();
		var tempDiv = document.createElement('div');
		tempDiv.appendChild(fragment);
		stripMathDuplicates(tempDiv);
		var html = tempDiv.innerHTML;

		var fullText = getFullText(contentEl);
		var startGlobalOffset = getBoundaryOffset(contentEl, range.startContainer, range.startOffset);
		var endGlobalOffset = getBoundaryOffset(contentEl, range.endContainer, range.endOffset);
		if (endGlobalOffset < startGlobalOffset) {
			endGlobalOffset = startGlobalOffset + text.length;
		}

		var beforeStart = Math.max(0, startGlobalOffset - CONTEXT_RADIUS);
		var afterEnd = Math.min(fullText.length, endGlobalOffset + CONTEXT_RADIUS);
		var textBefore = fullText.substring(beforeStart, startGlobalOffset);
		var textAfter = fullText.substring(endGlobalOffset, afterEnd);

		return {
			id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
			text: text,
			html: html,
			textBefore: textBefore,
			textAfter: textAfter,
			anchor: {
				startOffset: startGlobalOffset,
				endOffset: endGlobalOffset
			},
			color: (getConf() && getConf().color) || '#4ade80',
			created: Math.floor(Date.now() / 1000)
		};
	}

	// --- Apply highlight to DOM ---

	var MATH_SELECTOR = '.katex, .katex-display, .MathJax, .MathJax_Display, .MathJax_Preview, mjx-container, math, .math, .mjx-chtml';

	function isInsideMath(node) {
		var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
		while (el) {
			if (el.matches && el.matches(MATH_SELECTOR)) return true;
			el = el.parentElement;
		}
		return false;
	}

	// Collect text nodes intersecting the range, splitting boundary nodes so
	// each returned node lies entirely within the selection. Skips anything
	// inside a math container — KaTeX/MathJax layouts are fragile and wrapping
	// their inner text nodes in a styled span reflows/corrupts the formula.
	function collectRangeTextNodes(range) {
		var startContainer = range.startContainer;
		var startOffset = range.startOffset;
		var endContainer = range.endContainer;
		var endOffset = range.endOffset;

		if (startContainer.nodeType === Node.TEXT_NODE && startOffset > 0 && startOffset < startContainer.length) {
			var newStart = startContainer.splitText(startOffset);
			if (endContainer === startContainer) {
				endContainer = newStart;
				endOffset -= startOffset;
			}
			startContainer = newStart;
			startOffset = 0;
		}
		if (endContainer.nodeType === Node.TEXT_NODE && endOffset > 0 && endOffset < endContainer.length) {
			endContainer.splitText(endOffset);
		}

		var root = range.commonAncestorContainer;
		if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);

		var firstTextNode = startContainer.nodeType === Node.TEXT_NODE
			? startContainer
			: (startContainer.childNodes[startOffset] || null);
		var lastTextNode = endContainer.nodeType === Node.TEXT_NODE
			? endContainer
			: (endOffset > 0 ? endContainer.childNodes[endOffset - 1] : null);

		var nodes = [];
		var started = firstTextNode == null;
		var current = walker.nextNode();
		while (current) {
			if (!started && (current === firstTextNode || (firstTextNode && firstTextNode.contains && firstTextNode.contains(current)))) {
				started = true;
			}
			if (started && current.nodeValue && current.nodeValue.length > 0 && !isInsideMath(current)) {
				nodes.push(current);
			}
			if (lastTextNode && (current === lastTextNode || (lastTextNode.contains && lastTextNode.contains(current)))) {
				break;
			}
			current = walker.nextNode();
		}
		return nodes;
	}

	function wrapRangeWithHighlight(range, hlData) {
		var textNodes = collectRangeTextNodes(range);
		var wrappers = [];
		for (var i = 0; i < textNodes.length; i++) {
			var tn = textNodes[i];
			if (!tn.parentNode) continue;
			if (tn.parentNode.classList && tn.parentNode.classList.contains('freshrss-highlight')) continue;
			var span = document.createElement('span');
			span.className = 'freshrss-highlight';
			span.setAttribute('data-hl-id', hlData.id);
			if (hlData.color) {
				span.style.textDecorationColor = hlData.color;
			}
			tn.parentNode.insertBefore(span, tn);
			span.appendChild(tn);
			wrappers.push(span);
		}
		return wrappers;
	}

	function getAnchorOffsets(hl) {
		if (!hl) return null;

		var anchor = hl.anchor;
		if (anchor && typeof anchor.startOffset === 'number') {
			var endOffset = typeof anchor.endOffset === 'number' ? anchor.endOffset : anchor.startOffset + hl.text.length;
			return {
				startOffset: anchor.startOffset,
				endOffset: endOffset
			};
		}

		if (typeof hl.startOffset === 'number') {
			return {
				startOffset: hl.startOffset,
				endOffset: typeof hl.endOffset === 'number' ? hl.endOffset : hl.startOffset + hl.text.length
			};
		}

		return null;
	}

	function countCommonPrefix(a, b) {
		var maxLen = Math.min(a.length, b.length);
		var count = 0;
		for (var i = 0; i < maxLen; i++) {
			if (a.charAt(i) !== b.charAt(i)) break;
			count++;
		}
		return count;
	}

	function countCommonSuffix(a, b) {
		var maxLen = Math.min(a.length, b.length);
		var count = 0;
		for (var i = 1; i <= maxLen; i++) {
			if (a.charAt(a.length - i) !== b.charAt(b.length - i)) break;
			count++;
		}
		return count;
	}

	function scoreTextCandidate(fullText, startOffset, hl, expectedStartOffset) {
		var score = 0;
		var contextMatched = false;
		var before = hl.textBefore || '';
		var after = hl.textAfter || '';

		if (before) {
			var candidateBefore = fullText.substring(Math.max(0, startOffset - before.length), startOffset);
			if (candidateBefore === before) {
				score += 1000 + before.length * 4;
				contextMatched = true;
			} else {
				score += countCommonSuffix(candidateBefore, before) * 4;
			}
		}

		if (after) {
			var endOffset = startOffset + hl.text.length;
			var candidateAfter = fullText.substring(endOffset, Math.min(fullText.length, endOffset + after.length));
			if (candidateAfter === after) {
				score += 1000 + after.length * 4;
				contextMatched = true;
			} else {
				score += countCommonPrefix(candidateAfter, after) * 4;
			}
		}

		if (typeof expectedStartOffset === 'number') {
			score += Math.max(0, 400 - Math.min(Math.abs(startOffset - expectedStartOffset), 400));
		}

		return {
			score: score,
			contextMatched: contextMatched
		};
	}

	function findRestoreMatch(fullText, hl) {
		if (!hl || !hl.text) return null;

		var anchorOffsets = getAnchorOffsets(hl);
		if (anchorOffsets &&
			anchorOffsets.startOffset >= 0 &&
			anchorOffsets.endOffset <= fullText.length &&
			anchorOffsets.endOffset >= anchorOffsets.startOffset &&
			fullText.substring(anchorOffsets.startOffset, anchorOffsets.endOffset) === hl.text) {
			return {
				startOffset: anchorOffsets.startOffset,
				endOffset: anchorOffsets.endOffset,
				source: 'anchor-offset'
			};
		}

		var expectedStartOffset = anchorOffsets ? anchorOffsets.startOffset : null;
		var idx = fullText.indexOf(hl.text);
		if (idx === -1) return null;

		var bestMatch = null;
		while (idx !== -1) {
			var candidate = scoreTextCandidate(fullText, idx, hl, expectedStartOffset);
			var current = {
				startOffset: idx,
				endOffset: idx + hl.text.length,
				score: candidate.score,
				source: candidate.contextMatched ? 'context-match' : 'text-match'
			};

			var isBetterMatch = !bestMatch || current.score > bestMatch.score;
			if (!isBetterMatch && current.score === bestMatch.score && typeof expectedStartOffset === 'number') {
				isBetterMatch = Math.abs(current.startOffset - expectedStartOffset) < Math.abs(bestMatch.startOffset - expectedStartOffset);
			}
			if (!isBetterMatch && current.score === bestMatch.score && typeof expectedStartOffset !== 'number') {
				isBetterMatch = current.startOffset < bestMatch.startOffset;
			}

			if (isBetterMatch) {
				bestMatch = current;
			}

			idx = fullText.indexOf(hl.text, idx + 1);
		}

		return bestMatch;
	}

	// --- Restore highlights ---

	function restoreHighlights(contentEl, highlights, entryId) {
		if (!highlights || !highlights.length) return;

		var fullText = getFullText(contentEl);
		var failures = [];
		var restoredCount = 0;
		for (var h = 0; h < highlights.length; h++) {
			var result = restoreSingleHighlight(contentEl, highlights[h], fullText);
			if (!result.ok) {
				failures.push({
					id: highlights[h] && highlights[h].id ? highlights[h].id : 'unknown',
					reason: result.reason
				});
			} else {
				restoredCount++;
			}
		}

		if (failures.length) {
			console.warn('[Highlight] failed to restore some highlights for entry:', entryId || 'unknown', failures);
		}

		return {
			ok: failures.length === 0,
			failures: failures,
			restoredCount: restoredCount
		};
	}

	function restoreSingleHighlight(contentEl, hl, fullText) {
		if (!hl || !hl.text) {
			return {
				ok: false,
				reason: 'missing-text'
			};
		}

		if (hl.id && hasHighlightSpan(contentEl, hl.id)) {
			return {
				ok: true,
				source: 'already-restored'
			};
		}

		var match = findRestoreMatch(fullText, hl);
		if (!match) {
			return {
				ok: false,
				reason: 'no-text-match'
			};
		}

		var range = buildRangeFromOffsets(contentEl, match.startOffset, match.endOffset);
		if (!range) {
			return {
				ok: false,
				reason: 'range-build-failed'
			};
		}

		try {
			var wrappers = wrapRangeWithHighlight(range, hl);
			if (!wrappers.length) {
				return { ok: false, reason: 'dom-wrap-empty' };
			}
			return {
				ok: true,
				source: match.source
			};
		} catch (e) {
			console.warn('[Highlight] restore failed:', hl.id || 'unknown', e);
			return {
				ok: false,
				reason: 'dom-wrap-failed'
			};
		}
	}

	// --- AJAX ---

	function ajaxPost(url, params, onDone) {
		params['_csrf'] = context.csrf;
		params['ajax'] = '1';
		var body = new URLSearchParams(params).toString();

		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
			body: body,
			credentials: 'same-origin'
		}).then(function (resp) {
			if (!resp.ok) console.warn('[Highlight] HTTP error:', resp.status);
			return resp.text();
		}).then(function (text) {
			try {
				var data = JSON.parse(text);
				if (onDone) onDone(data.status === 'ok');
			} catch (e) {
				console.warn('[Highlight] response parse error:', text.substring(0, 200));
				if (onDone) onDone(false);
			}
		}).catch(function (err) {
			console.warn('[Highlight] network error:', err);
			if (onDone) onDone(false);
		});
	}

	function ajaxSave(entryId, hlData, onDone) {
		ajaxPost(getSaveUrl(), {
			'entry_id': entryId,
			'highlight': JSON.stringify(hlData)
		}, onDone);
	}

	function ajaxDelete(entryId, highlightId, onDone) {
		ajaxPost(getDeleteUrl(), {
			'entry_id': entryId,
			'highlight_id': highlightId
		}, onDone);
	}

	// --- Core actions ---

	function applyHighlight() {
		if (!pendingRange || !pendingEntryId) {
			hideToolbar();
			return;
		}

		var contentEl = pendingRange.commonAncestorContainer;
		if (contentEl.nodeType === Node.TEXT_NODE) contentEl = contentEl.parentNode;
		contentEl = findContentContainer(contentEl);
		if (!contentEl) {
			hideToolbar();
			return;
		}

		var hlData = serializeHighlight(pendingRange, contentEl);
		if (!hlData) {
			hideToolbar();
			return;
		}

		var spans = wrapRangeWithHighlight(pendingRange, hlData);
		if (!spans.length) {
			hideToolbar();
			return;
		}
		for (var si = 0; si < spans.length; si++) spans[si].setAttribute('data-hl-persisting', '1');

		var eid = pendingEntryId;
		hideToolbar();
		window.getSelection().removeAllRanges();

		ajaxSave(eid, hlData, function (ok) {
			invalidateCache();
			if (ok) {
				for (var k = 0; k < spans.length; k++) {
					if (spans[k].parentNode) spans[k].removeAttribute('data-hl-persisting');
				}
				return;
			}

			for (var k2 = 0; k2 < spans.length; k2++) unwrapHighlight(spans[k2]);
			showNotice(getMessage('save_failed', 'Highlight could not be saved. Please try again.'));
		});
	}

	function removeHighlight(hlSpan) {
		var hlId = hlSpan.getAttribute('data-hl-id');
		var contentEl = findContentContainer(hlSpan);
		var entryId = contentEl ? findEntryId(contentEl) : null;

		if (contentEl && hlId) {
			var siblings = contentEl.querySelectorAll('.freshrss-highlight[data-hl-id="' + hlId.replace(/"/g, '\\"') + '"]');
			for (var i = 0; i < siblings.length; i++) unwrapHighlight(siblings[i]);
		} else {
			unwrapHighlight(hlSpan);
		}
		invalidateCache();

		if (entryId && hlId) {
			ajaxDelete(entryId, hlId);
		}
	}

	// --- Event listeners ---

	function onMouseUp(e) {
		var target = e.target;
		window.setTimeout(function () {
			hideRemovePopup();

			if (target.closest && (target.closest('.hl-toolbar') || target.closest('.hl-remove-popup'))) {
				return;
			}

			var hlSpan = target.closest ? target.closest('.freshrss-highlight') : null;
			if (hlSpan && window.getSelection().toString().trim() === '') {
				showRemovePopup(hlSpan);
				return;
			}

			var sel = window.getSelection();
			if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
				hideToolbar();
				return;
			}

			var conf = getConf();
			if (conf && conf.enabled === false) {
				return;
			}

			var range = sel.getRangeAt(0);
			var container = range.commonAncestorContainer;
			if (container.nodeType === Node.TEXT_NODE) container = container.parentNode;

			var contentEl = findContentContainer(container);
			if (!contentEl) {
				console.warn('[Highlight] could not resolve content container for selection.');
				hideToolbar();
				return;
			}

			var entryId = findEntryId(contentEl);
			if (!entryId) {
				console.warn('[Highlight] could not resolve entry id for selection.');
				hideToolbar();
				return;
			}

			pendingRange = range;
			pendingEntryId = entryId;

			var rect = range.getBoundingClientRect();
			showToolbar(rect.left + rect.width / 2 + window.scrollX, rect.top + window.scrollY);
		}, 0);
	}

	function onMouseDown(e) {
		if (e.target.closest && (e.target.closest('.hl-toolbar') || e.target.closest('.hl-remove-popup'))) {
			return;
		}
		hideToolbar();
		hideRemovePopup();
	}

	// --- Initialization ---

	function retryRestoreEntry(dataEl) {
		var retries = parseInt(dataEl.getAttribute('data-hl-retries') || '0', 10) || 0;
		if (retries >= 5) {
			dataEl.setAttribute('data-hl-deferred', '1');
			dataEl.removeAttribute('data-hl-retries');
			return;
		}
		dataEl.setAttribute('data-hl-retries', String(retries + 1));
		window.setTimeout(function () {
			if (dataEl.getAttribute('data-hl-restored') || dataEl.getAttribute('data-hl-deferred')) return;
			restoreEntry(dataEl);
		}, 250);
	}

	function restoreEntry(dataEl) {
		var highlightsJson = dataEl.getAttribute('data-highlights');
		if (!highlightsJson) return;

		try {
			var highlights = JSON.parse(highlightsJson);
			if (!highlights || !highlights.length) return;

			var flux = dataEl.closest('.flux');
			if (!flux) return;
			var contentEl = flux.querySelector('.content');
			if (!contentEl) return;

			var result = restoreHighlights(contentEl, highlights, dataEl.getAttribute('data-entry-id'));
			if (result.ok) {
				dataEl.setAttribute('data-hl-restored', '1');
				dataEl.removeAttribute('data-hl-retries');
			} else {
				retryRestoreEntry(dataEl);
			}
		} catch (e) {
			console.warn('[Highlight] restore parse error for entry:', dataEl.getAttribute('data-entry-id'), e);
		}
	}

	function initHighlights() {
		var dataEls = document.querySelectorAll('.highlight-data');
		for (var i = 0; i < dataEls.length; i++) {
			var dataEl = dataEls[i];
			if (dataEl.getAttribute('data-hl-restored') || dataEl.getAttribute('data-hl-deferred')) continue;
			restoreEntry(dataEl);
		}
	}

	// --- Sidebar link + AJAX list ---

	var hlLoadedEntries = [];
	var hlCurrentPage = 0;
	var hlCache = null;
	var hlCacheTime = 0;
	var hlPrefetchPromise = null;
	var CACHE_TTL_MS = 60000;

	function getListUrl() {
		return getBaseUrl() + '/i/?c=highlight&a=list';
	}

	function getCountUrl() {
		return getBaseUrl() + '/i/?c=highlight&a=count';
	}

	function escapeHtml(str) {
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
			.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function formatDate(ts) {
		var d = new Date(Number(ts) * 1000);
		function pad(n) { return n < 10 ? '0' + n : '' + n; }
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
	}

	function updateSidebarCount(countStr) {
		var item = document.querySelector('.hl-sidebar-item');
		if (!item) return;
		var link = item.querySelector('.tree-folder-title');
		var title = item.querySelector('.title');
		if (link) link.setAttribute('data-unread', countStr);
		if (title) title.setAttribute('data-unread', countStr);
	}

	function loadSidebarCount() {
		fetch(getCountUrl(), { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (data && typeof data.count === 'number' && data.count > 0) {
					updateSidebarCount(String(data.count));
				}
			})
			.catch(function () {});
	}

	function invalidateCache() {
		hlCache = null;
		hlCacheTime = 0;
		hlPrefetchPromise = null;
	}

	function fetchHighlightsPage(page) {
		return fetch(getListUrl() + '&ajax=1&page=' + page, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); });
	}

	function syncSidebarFromListData(data) {
		if (data && typeof data.total === 'number' && data.total > 0) {
			updateSidebarCount(String(data.total));
		}
	}

	function prefetchHighlightsList() {
		if (hlCache && (Date.now() - hlCacheTime) < CACHE_TTL_MS) return;
		if (hlPrefetchPromise) return;
		hlPrefetchPromise = fetchHighlightsPage(1).then(function (data) {
			hlCache = data;
			hlCacheTime = Date.now();
			hlPrefetchPromise = null;
			syncSidebarFromListData(data);
			return data;
		}).catch(function () {
			hlPrefetchPromise = null;
		});
	}

	function loadHighlightsList(page) {
		page = page || 1;
		var stream = document.getElementById('stream');
		if (!stream) { window.location.href = getListUrl(); return; }

		var titleText = getMessage('highlights_title', 'Highlights');

		if (page === 1) {
			hlLoadedEntries = [];
			var actives = document.querySelectorAll('#sidebar .active');
			for (var i = 0; i < actives.length; i++) actives[i].classList.remove('active');
			var hlItem = document.querySelector('.hl-sidebar-item');
			if (hlItem) hlItem.classList.add('active');

			if (hlCache && (Date.now() - hlCacheTime) < CACHE_TTL_MS) {
				var cached = hlCache;
				var newEntries = cached.entries || [];
				for (var i = 0; i < newEntries.length; i++) hlLoadedEntries.push(newEntries[i]);
				hlCurrentPage = 1;
				renderHighlightsList(stream, cached.total || 0, cached.hasMore || false);
				return;
			}

			stream.innerHTML = '<div class="highlights-page"><div class="hl-page-header"><h2>' +
				titleText + '</h2></div><div class="hl-loading-indicator"></div></div>';

			var pending = hlPrefetchPromise || fetchHighlightsPage(1);
			hlPrefetchPromise = null;
			pending.then(function (data) {
				hlCache = data;
				hlCacheTime = Date.now();
				syncSidebarFromListData(data);
				var entries = data.entries || [];
				for (var j = 0; j < entries.length; j++) hlLoadedEntries.push(entries[j]);
				hlCurrentPage = 1;
				renderHighlightsList(stream, data.total || 0, data.hasMore || false);
			}).catch(function () {
				stream.innerHTML = '<div class="highlights-page"><div class="hl-empty-state">' +
					'<p>Failed to load highlights.</p></div></div>';
			});
			return;
		}

		var btn = stream.querySelector('.hl-load-more-btn');
		if (btn) { btn.disabled = true; btn.textContent = '...'; }

		fetchHighlightsPage(page).then(function (data) {
			var newEntries = data.entries || [];
			for (var i = 0; i < newEntries.length; i++) hlLoadedEntries.push(newEntries[i]);
			hlCurrentPage = page;
			renderHighlightsList(stream, data.total || 0, data.hasMore || false);
		}).catch(function () {
			stream.innerHTML = '<div class="highlights-page"><div class="hl-empty-state">' +
				'<p>Failed to load highlights.</p></div></div>';
		});
	}

	function renderHighlightsList(container, total, hasMore) {
		var titleText = getMessage('highlights_title', 'Highlights');
		var countText = total + ' ' + getMessage('entries_count', 'entries');
		var emptyText = getMessage('no_highlights', 'No highlights yet.');
		var moreText = getMessage('load_more', 'Load more');

		var html = '<div class="highlights-page"><div class="hl-page-header"><h2>' +
			titleText + '</h2><span class="hl-page-count">' + countText + '</span></div>';

		if (!hlLoadedEntries.length) {
			html += '<div class="hl-empty-state"><p>' + emptyText + '</p></div>';
		} else {
			html += '<div class="hl-entries">';
			for (var i = 0; i < hlLoadedEntries.length; i++) {
				var entry = hlLoadedEntries[i];
				var hls = [];
				try { hls = JSON.parse(entry.highlights_json || '[]') || []; } catch (e) {}
				if (!hls.length) continue;

				html += '<article class="hl-entry-card hl-collapsed"><header class="hl-entry-header">';
				html += '<button type="button" class="hl-entry-toggle" aria-expanded="false"><span class="hl-entry-chevron" aria-hidden="true">&#9656;</span>' +
					'<span class="hl-entry-title-text">' + escapeHtml(entry.title || '') + '</span></button>';
				html += '<a href="' + escapeHtml(entry.link || '#') + '" class="hl-entry-link" target="_blank" rel="noopener" title="Open original" aria-label="Open original">&#8599;</a>';
				html += '<div class="hl-entry-meta">';
				if (entry.feed_name) {
					html += '<span class="hl-feed-name">' + escapeHtml(entry.feed_name) + '</span><span class="hl-meta-sep">&middot;</span>';
				}
				html += '<time>' + formatDate(entry.date) + '</time>';
				html += '<span class="hl-meta-sep">&middot;</span><span>' + hls.length + ' ' +
					getMessage('highlights_n', 'highlights') + '</span>';
				html += '</div></header><div class="hl-entry-excerpts">';
			for (var j = 0; j < hls.length; j++) {
				html += '<div class="hl-excerpt" style="border-left-color:' +
					escapeHtml(hls[j].color || '#4ade80') + '">' +
					(hls[j].html || escapeHtml(hls[j].text || '')) + '</div>';
			}
				html += '</div></article>';
			}
			html += '</div>';
			if (hasMore) {
				html += '<div class="hl-pagination"><button class="hl-load-more-btn" type="button">' + moreText + '</button></div>';
			}
		}
		html += '</div>';
		container.innerHTML = html;

		// Saved excerpts contain rendered MathJax output (`<span class="mjx-chtml">`
		// trees) that depend on MathJax's runtime CSS. That CSS is only injected
		// once MathJax actually typesets something — old saved highlights lost
		// their `<script type="math/tex">` source tags, so a plain Typeset on
		// the container is a no-op and never loads the CSS.
		//
		// Inject a sentinel `$1$` into the container and force MathJax to
		// process it: that triggers the CommonHTML CSS injection, after which
		// every other `mjx-chtml` node on the page renders correctly. The
		// sentinel is hidden and removed once typesetting finishes. The queue
		// flushes lazily if MathJax is still loading from CDN.
		if (window.MathJax && window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
			try {
				var sentinel = document.createElement('span');
				sentinel.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
				sentinel.textContent = '$1$';
				container.appendChild(sentinel);
				window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, sentinel]);
				window.MathJax.Hub.Queue(function () {
					if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
				});
			} catch (e) {}
		}

		var toggles = container.querySelectorAll('.hl-entry-toggle');
		for (var t = 0; t < toggles.length; t++) {
			toggles[t].addEventListener('click', function () {
				var card = this.closest('.hl-entry-card');
				if (!card) return;
				var collapsed = card.classList.toggle('hl-collapsed');
				this.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
			});
		}

		if (hasMore) {
			var loadBtn = container.querySelector('.hl-load-more-btn');
			if (loadBtn) {
				loadBtn.addEventListener('click', function () { loadHighlightsList(hlCurrentPage + 1); });
			}
		}
	}

	function addSidebarLink() {
		var aside = document.getElementById('aside_feed');
		if (!aside) return;
		if (aside.querySelector('.hl-sidebar-item')) return;

		// Only render on the reader view. Configure pages reuse id="aside_feed"
		// but never contain the favorites entry, so gate on it — this is the
		// same signal the built-in favorites item uses to decide when to show.
		var favLi = aside.querySelector('.favorites');
		if (!favLi || !favLi.parentNode) return;

		// Clone the native favorites <li> to inherit the theme's icon markup
		// (emoji vs <img>), data-unread attributes, class hierarchy, etc. —
		// then only swap the fields that actually differ.
		var item = favLi.cloneNode(true);
		item.className = 'tree-folder category highlights hl-sidebar-item';

		var link = item.querySelector('a.tree-folder-title');
		if (!link) return;
		link.href = getListUrl();
		link.removeAttribute('data-unread');

		var titleSpan = link.querySelector('.title');
		if (titleSpan) {
			titleSpan.removeAttribute('data-unread');
			titleSpan.textContent = getMessage('highlights_title', 'Highlights');
		}

		// Swap the icon. If the extension config provided a custom iconUrl we
		// render an <img>; otherwise fall back to the native glyph the theme
		// used (emoji span or starred img), only replacing its visible text.
		var conf = getConf();
		var iconUrl = '';
		if (conf && conf.iconUrl) {
			iconUrl = conf.iconUrl;
			while (iconUrl.indexOf('&amp;') !== -1) {
				iconUrl = iconUrl.replace(/&amp;/g, '&');
			}
		}
		var icon = link.querySelector('.icon');
		if (icon) {
			if (iconUrl) {
				var img = document.createElement('img');
				img.className = 'icon';
				img.src = iconUrl;
				img.alt = '✦';
				img.loading = 'lazy';
				icon.parentNode.replaceChild(img, icon);
			} else if (icon.tagName === 'IMG') {
				icon.alt = '✦';
				icon.removeAttribute('title');
			} else {
				icon.textContent = '✦';
				icon.removeAttribute('title');
			}
		}

		link.addEventListener('mouseenter', function () {
			prefetchHighlightsList();
		}, { once: true });
		link.addEventListener('click', function (e) {
			e.preventDefault();
			loadHighlightsList(1);
		});

		favLi.parentNode.insertBefore(item, favLi.nextSibling);

		loadSidebarCount();
	}

	function setup() {
		createToolbar();
		createRemovePopup();
		document.addEventListener('mouseup', onMouseUp, true);
		document.addEventListener('mousedown', onMouseDown, true);
		initHighlights();
		addSidebarLink();

		var observer = new MutationObserver(function (mutations) {
			for (var i = 0; i < mutations.length; i++) {
				if (mutations[i].addedNodes.length > 0) {
					scheduleInit();
					return;
				}
			}
		});

		var currentStream = document.getElementById('stream');
		if (currentStream) {
			observer.observe(currentStream, { childList: true, subtree: true });
		}

		var parentObserver = new MutationObserver(function () {
			var newStream = document.getElementById('stream');
			if (newStream !== currentStream) {
				observer.disconnect();
				currentStream = newStream;
				if (currentStream) {
					observer.observe(currentStream, { childList: true, subtree: true });
				}
				scheduleInit();
			}
		});
		var streamParent = (currentStream && currentStream.parentNode) || document.body;
		parentObserver.observe(streamParent, { childList: true, subtree: !currentStream });
	}

	function boot() {
		if (typeof context !== 'undefined' && context.extensions) {
			setup();
			return;
		}

		var setupDone = false;
		function doSetup() {
			if (setupDone) return;
			setupDone = true;
			setup();
		}

		document.addEventListener('freshrss:globalContextLoaded', doSetup, false);

		var pollCount = 0;
		var pollTimer = setInterval(function () {
			pollCount++;
			if (setupDone) {
				clearInterval(pollTimer);
				return;
			}
			if (typeof context !== 'undefined' && context.extensions) {
				clearInterval(pollTimer);
				doSetup();
			} else if (pollCount >= 20) {
				clearInterval(pollTimer);
				doSetup();
			}
		}, 500);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot, false);
	} else {
		boot();
	}
})();
