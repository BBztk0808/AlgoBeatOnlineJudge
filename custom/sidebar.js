(function(){
  'use strict';
  var STORAGE_KEY = 'algobeat_sidebar_collapsed';
  var THEME_KEY = 'algobeat_theme';
  var BREAKPOINT = 900;

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return document.documentElement.getAttribute('data-ab-theme') === 'dark' ? 'dark' : 'light';
    }
  }

  function applyTheme(theme) {
    var dark = theme === 'dark';
    if (dark) {
      document.documentElement.setAttribute('data-ab-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-ab-theme');
    }
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
    updateThemeToggle();
  }

  function updateThemeToggle() {
    var toggle = document.getElementById('ab-theme-toggle');
    if (!toggle) return;
    var dark = document.documentElement.getAttribute('data-ab-theme') === 'dark';
    var icon = toggle.querySelector('i.icon');
    if (icon) icon.className = dark ? 'lightbulb outline icon' : 'moon outline icon';
    toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    toggle.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到暗色模式');
    toggle.setAttribute('title', dark ? '切换到浅色模式' : '切换到暗色模式');
  }

  function initThemeToggle() {
    if (!document.documentElement.hasAttribute('data-ab-theme')) {
      applyTheme(readStoredTheme());
    } else {
      updateThemeToggle();
    }
    var toggle = document.getElementById('ab-theme-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      var dark = document.documentElement.getAttribute('data-ab-theme') === 'dark';
      applyTheme(dark ? 'light' : 'dark');
    });
  }

  function isMobile() {
    return window.matchMedia ? window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches : window.innerWidth <= BREAKPOINT;
  }

  function setExpandedState() {
    var toggleBtn = document.querySelector('.ab-topbar-toggle');
    if (!toggleBtn) return;
    var expanded = isMobile()
      ? document.body.classList.contains('algobeat-sidebar-mobile-open')
      : !document.body.classList.contains('algobeat-sidebar-collapsed');
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function applyCollapseState() {
    if (isMobile()) {
      document.documentElement.removeAttribute('data-ab-sidebar-collapsed');
      document.body.classList.remove('algobeat-sidebar-collapsed');
      setExpandedState();
      return;
    }
    var collapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    document.body.classList.toggle('algobeat-sidebar-collapsed', collapsed);
    if (collapsed) {
      document.documentElement.setAttribute('data-ab-sidebar-collapsed', 'true');
    } else {
      document.documentElement.removeAttribute('data-ab-sidebar-collapsed');
    }
    setExpandedState();
  }

  function toggleSidebar() {
    if (isMobile()) {
      document.body.classList.toggle('algobeat-sidebar-mobile-open');
      setExpandedState();
    } else {
      var nowCollapsed = !document.body.classList.contains('algobeat-sidebar-collapsed');
      document.body.classList.toggle('algobeat-sidebar-collapsed', nowCollapsed);
      if (nowCollapsed) {
        document.documentElement.setAttribute('data-ab-sidebar-collapsed', 'true');
      } else {
        document.documentElement.removeAttribute('data-ab-sidebar-collapsed');
      }
      try { localStorage.setItem(STORAGE_KEY, nowCollapsed ? 'true' : 'false'); } catch (e) {}
      setExpandedState();
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove('algobeat-sidebar-mobile-open');
    setExpandedState();
  }

  function init() {
    initThemeToggle();
    applyCollapseState();
    var toggleBtn = document.querySelector('.ab-topbar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e){ e.preventDefault(); toggleSidebar(); });
    }
    var backdrop = document.querySelector('.ab-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isMobile()) closeMobileSidebar();
    });
    var items = document.querySelectorAll('.ab-sidebar-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function(){
        if (isMobile()) setTimeout(closeMobileSidebar, 100);
      });
    }
    var lastMobile = isMobile();
    window.addEventListener('resize', function(){
      var nowMobile = isMobile();
      if (nowMobile !== lastMobile) {
        lastMobile = nowMobile;
        if (nowMobile) {
          document.body.classList.remove('algobeat-sidebar-collapsed');
        } else {
          document.body.classList.remove('algobeat-sidebar-mobile-open');
          applyCollapseState();
        }
        setExpandedState();
      }
    });
    setExpandedState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
