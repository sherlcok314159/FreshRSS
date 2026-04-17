function geminiEscapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function geminiInlineMarkdown(s) {
  s = s.replace(/`([^`\n]+)`/g, function(_, c) { return '<code>' + geminiEscapeHtml(c) + '</code>'; });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function geminiRenderMarkdown(text) {
  if (!text) return '';
  text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var lines = text.split('\n');
  var out = [];
  var i = 0;
  function flushPara(buf) {
    if (buf.length === 0) return;
    var joined = buf.map(geminiEscapeHtml).join('<br>');
    out.push('<p>' + geminiInlineMarkdown(joined) + '</p>');
  }
  var para = [];
  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.trim();
    if (trimmed === '') { flushPara(para); para = []; i++; continue; }
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushPara(para); para = []; out.push('<hr>'); i++; continue;
    }
    var h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara(para); para = [];
      var lv = h[1].length;
      out.push('<h' + lv + '>' + geminiInlineMarkdown(geminiEscapeHtml(h[2])) + '</h' + lv + '>');
      i++; continue;
    }
    if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
      flushPara(para); para = [];
      var ordered = /^\d+\.\s+/.test(trimmed);
      var items = [];
      while (i < lines.length) {
        var l = lines[i];
        var t = l.trim();
        var m = ordered ? /^\d+\.\s+(.*)$/.exec(t) : /^[-*+]\s+(.*)$/.exec(t);
        if (!m) break;
        items.push('<li>' + geminiInlineMarkdown(geminiEscapeHtml(m[1])) + '</li>');
        i++;
      }
      out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara(para);
  return out.join('');
}

function geminiRenderCached() {
  var nodes = document.querySelectorAll('.gemini-content[data-gemini-raw]');
  for (var i = 0; i < nodes.length; i++) {
    var raw = nodes[i].getAttribute('data-gemini-raw');
    if (raw !== null) {
      nodes[i].innerHTML = geminiRenderMarkdown(raw);
      nodes[i].removeAttribute('data-gemini-raw');
    }
  }
}

if (document.readyState && document.readyState !== 'loading') {
  configureGeminiButtons();
  geminiRenderCached();
} else {
  document.addEventListener('DOMContentLoaded', function() {
    configureGeminiButtons();
    geminiRenderCached();
  }, false);
}
document.addEventListener('freshrss:items-loaded', geminiRenderCached, false);

var gemini_strings = (typeof context !== 'undefined' && context.extensions && context.extensions.gemini_strings)
  ? context.extensions.gemini_strings
  : { loading: 'Calling Gemini...', error: 'Error calling Gemini.' };

function configureGeminiButtons() {
  document.getElementById('global').addEventListener('click', function(e) {
    for (var target = e.target; target && target != this; target = target.parentNode) {
      if (target.matches('.gemini-assistant a.btn')) {
        e.preventDefault();
        e.stopPropagation();
        if (target.href) {
          geminiButtonClick(target);
        }
        break;
      }
    }
  }, false);
}

function setGeminiState(container, statusType, statusMsg, text) {
  var gstatus = container.querySelector('.gemini-status');
  var content = container.querySelector('.gemini-content');
  content.style.cssText = content.dataset.css || '';

  switch(statusType) {
    case 0:
      gstatus.classList.remove('alert-warn');
      gstatus.classList.remove('alert-error');
      gstatus.classList.add('hidden');
      gstatus.innerHTML = '';
      break;
    case 1:
      gstatus.classList.remove('alert-error');
      gstatus.classList.add('alert-warn');
      gstatus.innerHTML = statusMsg;
      gstatus.classList.remove('hidden');
      break;
    case 2:
      gstatus.classList.remove('alert-warn');
      gstatus.classList.add('alert-error');
      gstatus.innerHTML = statusMsg;
      gstatus.classList.remove('hidden');
      break;
  }

  if (text) {
    content.innerHTML = geminiRenderMarkdown(text);
    content.classList.remove('hidden');
  } else {
    content.classList.add('hidden');
    content.innerHTML = '';
  }
}

function geminiButtonClick(button) {
  var root = button.closest('.gemini-assistant');
  var container = root.querySelector('.gemini-result[data-gemini-type="summary"]');

  if (button.classList.contains('gemini-loading')) {
    return;
  }

  button.classList.add('gemini-loading');
  setGeminiState(container, 1, gemini_strings.loading, null);

  var url = button.href;
  var request = new XMLHttpRequest();
  request.open('POST', url, true);
  request.responseType = 'json';

  request.onload = function(e) {
    if (this.status != 200) {
      return request.onerror(e);
    }
    var xresp = xmlHttpRequestJson(this);
    if (!xresp) {
      return request.onerror(e);
    }
    button.classList.remove('gemini-loading');
    if (xresp.status !== 200 || !xresp.response || !xresp.response.output_text) {
      var msg = (xresp.response && xresp.response.output_text) ? xresp.response.output_text : gemini_strings.error;
      setGeminiState(container, 2, msg, null);
      return;
    }
    if (xresp.response.error) {
      setGeminiState(container, 2, xresp.response.output_text, null);
    } else {
      setGeminiState(container, 0, null, xresp.response.output_text);
    }
  };

  request.onerror = function(e) {
    button.classList.remove('gemini-loading');
    badAjax(this.status == 403);
    setGeminiState(container, 2, gemini_strings.error, null);
  };

  request.setRequestHeader('Content-Type', 'application/json');
  request.send(JSON.stringify({
    ajax: true,
    _csrf: context.csrf
  }));
}
