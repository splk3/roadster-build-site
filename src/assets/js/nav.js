(() => {
  const header = document.querySelector(".site-header");
  const inner = header?.querySelector(".header-inner");
  const menu = document.querySelector("#site-menu");
  const searchPanel = document.querySelector("#header-search");
  const searchInput = document.querySelector("#archive-search");
  const dropdowns = [...document.querySelectorAll(".nav-dropdown")].map(
    (item) => ({
      item,
      trigger: item.querySelector(".dropdown-trigger"),
      panel: item.querySelector(".dropdown-panel"),
      hoverPreview: false,
    }),
  );

  const supportsPopover = Object.hasOwn(HTMLElement.prototype, "popover");
  const supportsAnchor = CSS.supports("position-area", "block-end");

  const positionFallbackPanel = (trigger, panel) => {
    if (supportsAnchor || !header.classList.contains("is-wide")) return;
    const rect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 8;
    let top = rect.bottom + gap;
    if (top + panelRect.height > innerHeight - 8) {
      top = Math.max(8, rect.top - panelRect.height - gap);
    }
    const maxLeft = Math.max(8, innerWidth - panelRect.width - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  };

  let lastMeasuredWidth = 0;

  const syncLayout = (force = false) => {
    if (!header || !inner || !menu || !searchPanel) return;
    const width = header.clientWidth;
    const wasWide = header.classList.contains("is-wide");
    if (!force && !wasWide && width <= lastMeasuredWidth) return;
    lastMeasuredWidth = width;

    const menuWasOpen =
      supportsPopover && !wasWide && menu.matches(":popover-open");

    header.classList.add("is-measuring");
    header.classList.add("is-wide");
    menu.removeAttribute("popover");
    searchPanel.removeAttribute("popover");
    for (const { panel } of dropdowns) {
      panel.removeAttribute("popover");
      panel.hidden = true;
    }

    const fits = inner.scrollWidth <= inner.clientWidth + 1;

    if (fits) {
      header.classList.add("is-wide");
      menu.removeAttribute("popover");
      searchPanel.removeAttribute("popover");
      for (const { trigger, panel } of dropdowns) {
        panel.hidden = false;
        panel.setAttribute("popover", "auto");
        trigger.setAttribute("aria-expanded", "false");
      }
    } else {
      header.classList.remove("is-wide");
      menu.setAttribute("popover", "auto");
      searchPanel.setAttribute("popover", "auto");
      for (const { trigger, panel } of dropdowns) {
        panel.removeAttribute("popover");
        panel.style.top = "";
        panel.style.left = "";
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
      if (menuWasOpen) {
        try {
          menu.showPopover();
        } catch {
          // Ignore if already shown or unavailable
        }
      }
    }

    requestAnimationFrame(() => {
      header.classList.remove("is-measuring");
    });
  };

  if (header && inner) {
    syncLayout(true);
    const observer = new ResizeObserver(() => syncLayout(false));
    observer.observe(header);
    if (menu) observer.observe(menu);

    // Compact scroll-hide behavior (stays visible when focused or a popover is open)
    let lastY = scrollY;
    window.addEventListener(
      "scroll",
      () => {
        const y = Math.max(
          0,
          Math.min(
            scrollY,
            document.documentElement.scrollHeight - innerHeight,
          ),
        );
        if (y === lastY) return;
        const anyOpen =
          supportsPopover &&
          Boolean(header.querySelector("[popover]:popover-open"));
        const shouldHide = !anyOpen && y > lastY && y > header.offsetHeight * 2;
        header.classList.toggle("is-hidden", shouldHide);
        lastY = y;
      },
      { passive: true },
    );
  }

  // Dropdown interactions (narrow inline disclosure + wide anchored popover)
  const canHover = matchMedia("(hover: hover)");
  for (const entry of dropdowns) {
    const { item, trigger, panel } = entry;

    trigger.addEventListener("click", (event) => {
      if (!header.classList.contains("is-wide")) {
        event.preventDefault();
        const willOpen = panel.hidden;
        for (const other of dropdowns) {
          if (other !== entry) {
            other.panel.hidden = true;
            other.trigger.setAttribute("aria-expanded", "false");
          }
        }
        panel.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", String(willOpen));
        return;
      }
      if (entry.hoverPreview) {
        entry.hoverPreview = false;
        event.preventDefault();
      }
    });

    panel.addEventListener("toggle", (event) => {
      const open = event.newState === "open";
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        positionFallbackPanel(trigger, panel);
        const activeLink = panel.querySelector('a[aria-current="page"]');
        if (activeLink) {
          activeLink.scrollIntoView({ block: "nearest" });
        }
      } else {
        entry.hoverPreview = false;
      }
    });

    item.addEventListener("pointerenter", (event) => {
      if (
        !supportsPopover ||
        !header.classList.contains("is-wide") ||
        !canHover.matches ||
        event.pointerType === "touch"
      ) {
        return;
      }
      if (!panel.matches(":popover-open")) {
        entry.hoverPreview = true;
        try {
          panel.showPopover({ source: trigger });
        } catch {
          panel.showPopover();
        }
      }
    });

    item.addEventListener("pointerleave", () => {
      if (
        entry.hoverPreview &&
        supportsPopover &&
        panel.matches(":popover-open")
      ) {
        entry.hoverPreview = false;
        panel.hidePopover();
      }
    });

    item.addEventListener("focusout", (event) => {
      if (
        !header.classList.contains("is-wide") ||
        !supportsPopover ||
        !panel.matches(":popover-open")
      ) {
        return;
      }
      if (event.relatedTarget && !item.contains(event.relatedTarget)) {
        panel.hidePopover();
      }
    });
  }

  if (searchPanel && searchInput) {
    searchPanel.addEventListener("toggle", (event) => {
      if (event.newState === "open") {
        searchInput.focus();
      }
    });
  }

  // Reveal progressive-enhancement filter/sort toolbars
  for (const controls of document.querySelectorAll(
    ".panel-controls, .directory-controls",
  )) {
    controls.hidden = false;
  }

  // All Posts dropdown filter & order toggle
  const navPostFilter = document.querySelector("#nav-post-filter");
  const navPostList = document.querySelector("#nav-post-list");
  const navPostEmpty = document.querySelector("#nav-post-empty");
  const navSortToggle = document.querySelector(".panel-sort-toggle");

  if (navPostList && navPostFilter) {
    const items = [...navPostList.querySelectorAll("li")];
    const applyPostFilter = () => {
      const q = navPostFilter.value.trim().toLowerCase().replace(/^#/, "");
      let visible = 0;
      for (const li of items) {
        const num = li.dataset.num ?? "";
        const padded = num.padStart(2, "0");
        const title = li.dataset.title ?? "";
        const match =
          !q || title.includes(q) || num === q || padded.includes(q);
        li.hidden = !match;
        if (match) visible++;
      }
      if (navPostEmpty) navPostEmpty.hidden = visible > 0;
    };
    navPostFilter.addEventListener("input", applyPostFilter);

    if (navSortToggle) {
      navSortToggle.addEventListener("click", () => {
        const nextOrder =
          navSortToggle.dataset.order === "asc" ? "desc" : "asc";
        navSortToggle.dataset.order = nextOrder;
        const total = items.length;
        navSortToggle.textContent =
          nextOrder === "asc" ? `#1 → #${total}` : `#${total} → #1`;
        navSortToggle.setAttribute(
          "aria-label",
          nextOrder === "asc"
            ? "Switch to newest posts first"
            : "Switch to oldest posts first",
        );
        const sorted = [...items].sort((a, b) =>
          nextOrder === "asc"
            ? Number(a.dataset.num) - Number(b.dataset.num)
            : Number(b.dataset.num) - Number(a.dataset.num),
        );
        navPostList.replaceChildren(...sorted);
      });
    }
  }

  // Topics dropdown tabs & filter
  const navTopicFilter = document.querySelector("#nav-topic-filter");
  const navTopicEmpty = document.querySelector("#nav-topic-empty");
  const topicTabs = [...document.querySelectorAll(".topic-tab")];
  const topicSections = [...document.querySelectorAll(".topic-section")];

  if (topicTabs.length && topicSections.length) {
    let activeTab = "categories";

    const updateTopicsPanel = () => {
      const q = (navTopicFilter?.value ?? "").trim().toLowerCase();
      let visible = 0;
      for (const section of topicSections) {
        const kind = section.dataset.topicSection;
        const sectionVisibleByTab = q.length > 0 || kind === activeTab;
        let sectionMatches = 0;
        for (const li of section.querySelectorAll("li")) {
          const match = !q || (li.dataset.term ?? "").includes(q);
          li.hidden = !match;
          if (match) sectionMatches++;
        }
        section.hidden = !sectionVisibleByTab || sectionMatches === 0;
        if (!section.hidden) visible += sectionMatches;
      }
      if (navTopicEmpty) navTopicEmpty.hidden = visible > 0;
    };

    for (const tab of topicTabs) {
      tab.addEventListener("click", () => {
        activeTab = tab.dataset.topicTab;
        for (const button of topicTabs) {
          const isCurrent = button === tab;
          button.classList.toggle("is-active", isCurrent);
          button.setAttribute("aria-pressed", String(isCurrent));
        }
        updateTopicsPanel();
      });
    }

    navTopicFilter?.addEventListener("input", updateTopicsPanel);
    updateTopicsPanel();
  }

  // /all-posts/ timeline filter & order toggle
  const timelineGroups = document.querySelector("#timeline-groups");
  const timelineFilter = document.querySelector("#timeline-filter");
  const timelineOrderToggle = document.querySelector("#timeline-order-toggle");
  const timelineEmpty = document.querySelector("#timeline-empty");

  if (timelineGroups) {
    const yearSections = [...timelineGroups.querySelectorAll(".timeline-year")];
    const applyTimelineFilter = () => {
      const q = (timelineFilter?.value ?? "")
        .trim()
        .toLowerCase()
        .replace(/^#/, "");
      let visible = 0;
      for (const section of yearSections) {
        let sectionVisible = 0;
        for (const li of section.querySelectorAll(".timeline-item")) {
          const num = li.dataset.num ?? "";
          const padded = num.padStart(2, "0");
          const title = li.dataset.title ?? "";
          const match =
            !q || title.includes(q) || num === q || padded.includes(q);
          li.hidden = !match;
          if (match) sectionVisible++;
        }
        section.hidden = sectionVisible === 0;
        visible += sectionVisible;
      }
      if (timelineEmpty) timelineEmpty.hidden = visible > 0;
    };

    timelineFilter?.addEventListener("input", applyTimelineFilter);

    timelineOrderToggle?.addEventListener("click", () => {
      const nextOrder =
        timelineOrderToggle.dataset.order === "asc" ? "desc" : "asc";
      timelineOrderToggle.dataset.order = nextOrder;
      const total = timelineGroups.querySelectorAll(".timeline-item").length;
      timelineOrderToggle.textContent =
        nextOrder === "asc"
          ? `Oldest first (#01 → #${total})`
          : `Newest first (#${total} → #01)`;
      const orderedYears = [...yearSections].sort((a, b) =>
        nextOrder === "asc"
          ? Number(a.dataset.year) - Number(b.dataset.year)
          : Number(b.dataset.year) - Number(a.dataset.year),
      );
      for (const section of orderedYears) {
        const list = section.querySelector(".timeline-list");
        if (!list) continue;
        const items = [...list.querySelectorAll(".timeline-item")].sort(
          (a, b) =>
            nextOrder === "asc"
              ? Number(a.dataset.num) - Number(b.dataset.num)
              : Number(b.dataset.num) - Number(a.dataset.num),
        );
        list.replaceChildren(...items);
      }
      timelineGroups.replaceChildren(...orderedYears);
    });
  }

  // /topics/ directory filter
  const topicsPageFilter = document.querySelector("#topics-page-filter");
  const topicsPageEmpty = document.querySelector("#topics-page-empty");
  if (topicsPageFilter) {
    const blocks = [...document.querySelectorAll(".topics-block")];
    const letterGroups = [...document.querySelectorAll(".letter-group")];
    topicsPageFilter.addEventListener("input", () => {
      const q = topicsPageFilter.value.trim().toLowerCase();
      let totalVisible = 0;
      for (const block of blocks) {
        let blockMatches = 0;
        for (const li of block.querySelectorAll("li[data-term]")) {
          const match = !q || (li.dataset.term ?? "").includes(q);
          li.hidden = !match;
          if (match) blockMatches++;
        }
        totalVisible += blockMatches;
      }
      for (const group of letterGroups) {
        const hasVisible = Boolean(
          group.querySelector("li[data-term]:not([hidden])"),
        );
        group.hidden = !hasVisible;
      }
      if (topicsPageEmpty) topicsPageEmpty.hidden = totalVisible > 0;
    });
  }
})();
