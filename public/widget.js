/**
 * Roster — embeddable website chat widget.
 *
 * Drop this on any site:
 *   <script src="https://your-roster/widget.js"
 *           data-roster-workspace="acme-plumbing"
 *           data-roster-host="https://your-roster"
 *           async></script>
 *
 * Self-contained on purpose: no framework, no CSS file, no third-party
 * request. Everything is scoped inside a shadow root so the host site's
 * stylesheet can't break it and this can't break the host site.
 */
(function () {
  'use strict';

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();

  var WORKSPACE = script.getAttribute('data-roster-workspace');
  var HOST = (script.getAttribute('data-roster-host') || '').replace(/\/$/, '');

  if (!WORKSPACE) {
    console.warn('[roster] data-roster-workspace is required on the widget script tag.');
    return;
  }
  if (!HOST) {
    try {
      HOST = new URL(script.src).origin;
    } catch (e) {
      console.warn('[roster] could not determine the Roster host.');
      return;
    }
  }

  // One session per browser tab-set, so a returning visitor resumes their thread.
  var SESSION_KEY = 'roster-session-' + WORKSPACE;
  var sessionId;
  try {
    sessionId = localStorage.getItem(SESSION_KEY);
  } catch (e) {
    sessionId = null;
  }
  if (!sessionId) {
    sessionId =
      'w_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      localStorage.setItem(SESSION_KEY, sessionId);
    } catch (e) {
      /* private browsing — the session lives for this page view only */
    }
  }

  var config = null;
  var open = false;
  var busy = false;
  var messages = [];

  // ── Shell ──────────────────────────────────────────────────────────────────
  var container = document.createElement('div');
  container.setAttribute('data-roster-widget', '');
  container.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;';
  var shadow = container.attachShadow ? container.attachShadow({ mode: 'open' }) : container;

  function css(accent) {
    return (
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      ':host{all:initial;}' +
      '.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;align-items:flex-end;gap:12px;}' +
      '.bubble{width:56px;height:56px;border-radius:999px;border:none;cursor:pointer;' +
      'background:' + accent + ';color:#1C1403;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 4px 16px rgba(15,17,21,.18);transition:transform 150ms ease-out;}' +
      '.bubble:hover{transform:scale(1.04);}' +
      '.panel{width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);' +
      'background:#fff;border:1px solid #E7E9EC;border-radius:12px;display:flex;flex-direction:column;' +
      'overflow:hidden;box-shadow:0 12px 48px rgba(15,17,21,.18);}' +
      '.head{padding:14px 16px;border-bottom:1px solid #E7E9EC;display:flex;align-items:center;gap:10px;}' +
      '.dot{width:8px;height:8px;border-radius:999px;background:#3F8F5F;flex:none;}' +
      '.title{font-size:14px;font-weight:600;color:#0F1115;line-height:1.2;}' +
      '.sub{font-size:11px;color:#5B6472;margin-top:2px;}' +
      '.close{margin-left:auto;background:none;border:none;cursor:pointer;color:#5B6472;font-size:20px;line-height:1;padding:2px 6px;}' +
      '.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}' +
      '.msg{max-width:82%;padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;}' +
      '.them{background:#F4F4F1;color:#0F1115;align-self:flex-start;}' +
      '.me{background:' + accent + ';color:#1C1403;align-self:flex-end;}' +
      '.typing{color:#5B6472;font-size:13px;align-self:flex-start;font-style:italic;}' +
      '.foot{border-top:1px solid #E7E9EC;padding:10px;display:flex;gap:8px;align-items:flex-end;}' +
      'textarea{flex:1;resize:none;border:1px solid #E7E9EC;border-radius:8px;padding:9px 10px;' +
      'font-family:inherit;font-size:14px;line-height:1.4;max-height:96px;color:#0F1115;background:#fff;}' +
      'textarea:focus{outline:none;border-color:' + accent + ';}' +
      '.send{background:' + accent + ';color:#1C1403;border:none;border-radius:8px;width:38px;height:38px;' +
      'cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;}' +
      '.send:disabled{opacity:.45;cursor:default;}' +
      '.brand{text-align:center;font-size:10px;color:#5B6472;padding:0 0 8px;}' +
      '@media (max-width:420px){.panel{width:calc(100vw - 24px);height:calc(100vh - 100px);}}'
    );
  }

  var style = document.createElement('style');
  var wrap = document.createElement('div');
  wrap.className = 'wrap';
  shadow.appendChild(style);
  shadow.appendChild(wrap);

  var CHAT_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var SEND_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // The panel chrome is built once and kept. Rebuilding innerHTML on every
  // streamed token destroyed the <textarea> the visitor was typing into and
  // stole focus dozens of times per reply.
  var els = null;

  function buildPanel() {
    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Chat with ' + config.businessName);
    panel.innerHTML =
      '<div class="head"><span class="dot"></span><div>' +
      '<div class="title"></div>' +
      '<div class="sub">Usually replies in a moment</div>' +
      '</div><button class="close" type="button" aria-label="Close chat">&times;</button></div>' +
      '<div class="log" role="log" aria-live="polite" aria-relevant="additions text"></div>' +
      '<div class="foot">' +
      '<textarea rows="1" placeholder="Type a message…" aria-label="Your message"></textarea>' +
      '<button class="send" type="button" aria-label="Send message">' + SEND_ICON + '</button>' +
      '</div>' +
      '<div class="brand">Powered by Roster</div>';

    panel.querySelector('.title').textContent = config.businessName;

    var logEl = panel.querySelector('.log');
    var input = panel.querySelector('textarea');
    var sendBtn = panel.querySelector('.send');

    panel.querySelector('.close').addEventListener('click', close);

    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
        input.value = '';
        input.style.height = 'auto';
      }
    });

    sendBtn.addEventListener('click', function () {
      send(input.value);
      input.value = '';
      input.style.height = 'auto';
      input.focus();
    });

    els = { panel: panel, log: logEl, input: input, send: sendBtn };
    return panel;
  }

  function close() {
    open = false;
    els = null;
    render();
    var bubble = wrap.querySelector('.bubble');
    if (bubble) bubble.focus();
  }

  /** Repaints only the transcript; the composer keeps its value and focus. */
  function paintLog() {
    if (!els) return;

    var logEl = els.log;
    while (logEl.childNodes.length > messages.length) {
      logEl.removeChild(logEl.lastChild);
    }

    messages.forEach(function (m, i) {
      var node = logEl.childNodes[i];
      var cls = m.role === 'typing' ? 'typing' : 'msg ' + (m.role === 'me' ? 'me' : 'them');

      if (!node) {
        node = document.createElement('div');
        logEl.appendChild(node);
      }
      if (node.className !== cls) node.className = cls;

      var text = m.role === 'typing' ? 'typing…' : m.text;
      if (node.textContent !== text) node.textContent = text;
    });

    logEl.scrollTop = logEl.scrollHeight;
    els.send.disabled = busy;
  }

  function render() {
    if (!config) return;

    if (!open) {
      wrap.innerHTML =
        '<button class="bubble" type="button" aria-label="Open chat">' + CHAT_ICON + '</button>';
      wrap.querySelector('.bubble').addEventListener('click', function () {
        open = true;
        if (!messages.length && config.greeting) {
          messages.push({ role: 'them', text: config.greeting });
        }
        render();
      });
      return;
    }

    if (!els) {
      wrap.innerHTML = '';
      wrap.appendChild(buildPanel());
      paintLog();
      els.input.focus();
      return;
    }

    paintLog();
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;

    messages.push({ role: 'me', text: text });
    messages.push({ role: 'typing' });
    busy = true;
    paintLog();

    fetch(HOST + '/api/widget/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: WORKSPACE,
        sessionId: sessionId,
        message: text,
      }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              throw new Error(data.error || 'Could not send that message.');
            });
        }

        // Replace the typing indicator with a streaming reply bubble.
        messages[messages.length - 1] = { role: 'them', text: '' };
        paintLog();

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) return;

            buffer += decoder.decode(result.value, { stream: true });
            var frames = buffer.split('\n\n');
            buffer = frames.pop();

            frames.forEach(function (frame) {
              var lines = frame.split('\n');
              var event = '';
              var payload = '';
              lines.forEach(function (line) {
                if (line.indexOf('event: ') === 0) event = line.slice(7).trim();
                if (line.indexOf('data: ') === 0) payload = line.slice(6);
              });
              if (!event || !payload) return;

              var data;
              try {
                data = JSON.parse(payload);
              } catch (e) {
                return;
              }

              if (event === 'token') {
                messages[messages.length - 1].text += data.text;
                paintLog();
              }
              if (event === 'error') {
                messages[messages.length - 1].text = data.message;
                paintLog();
              }
            });

            return pump();
          });
        }

        return pump();
      })
      .catch(function (error) {
        var last = messages[messages.length - 1];
        var text = error.message || 'Something went wrong. Please try again.';
        if (last && (last.role === 'typing' || (last.role === 'them' && !last.text))) {
          messages[messages.length - 1] = { role: 'them', text: text };
        } else {
          messages.push({ role: 'them', text: text });
        }
      })
      .then(function () {
        busy = false;
        paintLog();
      });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  fetch(HOST + '/api/widget/config?workspace=' + encodeURIComponent(WORKSPACE))
    .then(function (res) {
      if (!res.ok) throw new Error('config');
      return res.json();
    })
    .then(function (data) {
      config = data;
      style.textContent = css(data.accentColor || '#E8A33D');
      document.body.appendChild(container);
      render();
    })
    .catch(function () {
      // No agent configured, or the workspace slug is wrong — stay invisible
      // rather than putting a broken bubble on the buyer's website.
      console.warn('[roster] chat widget is not available for this workspace.');
    });
})();
