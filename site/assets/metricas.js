/* Métricas do site (PostHog), sem cookies: tudo em memória, IP anonimizado no projeto, sem gravação de sessão. */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset identify setPersonProperties get_distinct_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
(function () {
  if (location.hostname !== 'wacrew.com.br' && location.hostname !== 'www.wacrew.com.br') return; /* não conta testes locais */
  /* Quem mantém o site abre /?interno=1 uma vez em cada navegador e deixa de ser contado; ?interno=0 desfaz. */
  try {
    var interno = /[?&]interno=([01])\b/.exec(location.search);
    if (interno) localStorage.setItem('wacrew-interno', interno[1]);
    if (localStorage.getItem('wacrew-interno') === '1') return;
  } catch (e) { /* sem acesso ao armazenamento: segue contando */ }
  posthog.init('phc_qPw93jqaawvojPSHXWur6wDeG76iSikDJRBfEas2FCzL', {
    api_host: 'https://us.i.posthog.com',
    persistence: 'memory',
    person_profiles: 'identified_only',
    disable_session_recording: true,
    capture_pageview: true,
    capture_pageleave: true
  });
  function lugar(el) {
    var s = el.closest('section[id], header, footer, nav, aside');
    return s ? (s.id || s.tagName.toLowerCase()) : 'pagina';
  }
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return; /* ignora cliques do cursor animado */
    var a = e.target.closest('a, button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/github\.com\/sumioshi\/wacrew/.test(href)) posthog.capture('clique_github', { lugar: lugar(a), destino: href });
    else if (/github\.com\/sponsors/.test(href)) posthog.capture('clique_sponsor', { lugar: lugar(a) });
    else if (/rodrigosumioshi\.com/.test(href)) posthog.capture('clique_portfolio', { lugar: lugar(a) });
    else if (/hostinger\.com/.test(href)) posthog.capture('clique_hostinger', { lugar: lugar(a) });
    else if (/onorca\.dev/.test(href)) posthog.capture('clique_orca', { lugar: lugar(a) });
    else if (a.matches('.copy, [data-copy], .cmd button')) posthog.capture('copiar_comando', { lugar: lugar(a), comando: (a.getAttribute('data-copy') || '').slice(0, 80) });
    else if (a.matches('.auto-toggle')) posthog.capture('toggle_auto', { lugar: lugar(a) });
  }, true);
  if (/^\/blog\/[^/]+\/$/.test(location.pathname)) {
    var marcou = false;
    window.addEventListener('scroll', function () {
      if (marcou) return;
      var f = (scrollY + innerHeight) / document.documentElement.scrollHeight;
      if (f > 0.75) { marcou = true; posthog.capture('post_lido', { post: location.pathname }); }
    }, { passive: true });
  }
})();
