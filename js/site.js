(function () {
  "use strict";

  const menuSearch = document.querySelector('.search-bar input[type="search"]');
  const menuGrid = document.getElementById("menu-grid");
  const searchResults = document.getElementById("menu-search-results");

  const getSearchableText = (card) => {
    const content = card.cloneNode(true);
    content
      .querySelectorAll(".quantity-control")
      .forEach((control) => control.remove());
    return content.textContent.toLocaleLowerCase();
  };

  if (menuSearch && menuGrid && searchResults) {
    const menuCards = [...menuGrid.querySelectorAll(".menu-card")];
    const homepagePizzaDetails = menuGrid.querySelector(".homepage-pizzas-details");
    const homepagePizzaRows = homepagePizzaDetails
      ? [...homepagePizzaDetails.querySelectorAll(".related-pizza-row")]
      : [];
    const homepagePizzaGroups = homepagePizzaDetails
      ? [...homepagePizzaDetails.querySelectorAll(".homepage-pizza-group")]
      : [];

    const filterPreview = () => {
      const query = menuSearch.value.trim().toLocaleLowerCase();
      let visibleCount = 0;

      if (homepagePizzaDetails && homepagePizzaRows.length > 0) {
        let matchingPizzaRows = 0;
        for (const row of homepagePizzaRows) {
          const rowMatches = !query || row.textContent.toLocaleLowerCase().includes(query);
          row.hidden = Boolean(query) && !rowMatches;
          if (query && rowMatches) {
            matchingPizzaRows += 1;
          }
        }
        for (const group of homepagePizzaGroups) {
          const hasVisibleRow = Boolean(group.querySelector(".related-pizza-row:not([hidden])"));
          group.hidden = Boolean(query) && !hasVisibleRow;
        }
        homepagePizzaDetails.open = Boolean(query) && matchingPizzaRows > 0;
      }

      for (const card of menuCards) {
        const matches = getSearchableText(card).includes(query);
        card.hidden = !matches;
        visibleCount += Number(matches);
      }

      searchResults.hidden = !query;
      searchResults.textContent =
        query && visibleCount === 0
          ? `No preview items match “${menuSearch.value.trim()}”. Press Enter to search the full menu.`
          : query
            ? `${visibleCount} preview ${visibleCount === 1 ? "item" : "items"} found. Press Enter to search the full menu.`
            : "";
    };

    menuSearch.addEventListener("input", filterPreview);
    menuSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !menuSearch.value.trim()) return;

      event.preventDefault();
      const search = encodeURIComponent(menuSearch.value.trim());
      window.location.href = `890b.html?search=${search}#full-menu-search-results`;
    });
  }

  const fullMenuSearch = document.getElementById("full-menu-search");
  const fullMenuResults = document.getElementById("full-menu-search-results");

  if (fullMenuSearch && fullMenuResults) {
    const searchableProducts = [
      ...document.querySelectorAll(".pizza-card, .deals-preview .deal-card"),
    ].map((card) => ({ card, text: getSearchableText(card) }));
    const productSections = [
      ...document.querySelectorAll(".menu-section:not(.deals-preview)"),
    ];
    const dealsPreview = document.querySelector(".deals-preview");

    const filterFullMenu = () => {
      const query = fullMenuSearch.value.trim().toLocaleLowerCase();
      let visibleCount = 0;

      for (const product of searchableProducts) {
        const matches = product.text.includes(query);
        product.card.hidden = !matches;
        visibleCount += Number(matches);
      }

      for (const section of productSections) {
        const sectionHasResults = section.querySelector(
          ".pizza-card:not([hidden])",
        );
        section.hidden = Boolean(query) && !sectionHasResults;
      }

      if (dealsPreview) {
        dealsPreview.hidden =
          Boolean(query) && !dealsPreview.querySelector(".deal-card:not([hidden])");
      }

      fullMenuResults.hidden = !query;
      fullMenuResults.textContent =
        query && visibleCount === 0
          ? `No menu items match “${fullMenuSearch.value.trim()}”. Try another search.`
          : query
            ? `${visibleCount} menu ${visibleCount === 1 ? "item" : "items"} found.`
            : "";
    };

    fullMenuSearch.addEventListener("input", filterFullMenu);

    const initialSearch = new URLSearchParams(window.location.search).get(
      "search",
    );
    if (initialSearch?.trim()) {
      fullMenuSearch.value = initialSearch.trim();
      filterFullMenu();
    }
  }

  // Interactive Unified Theme Controller (Cross-tab synchronized dark/light switcher)
  const THEME_STORAGE_KEY = "romeos-theme";
  const THEME_CHANNEL_NAME = "romeos_theme_channel";

  let themeChannel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      themeChannel = new BroadcastChannel(THEME_CHANNEL_NAME);
    }
  } catch (_) {}

  const getPreferredTheme = () => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch (_) {}

    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  };

  const updateThemeMeta = (isDark) => {
    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag && document.head) {
      metaTag = document.createElement("meta");
      metaTag.name = "theme-color";
      document.head.appendChild(metaTag);
    }
    if (metaTag) {
      metaTag.setAttribute("content", isDark ? "#161114" : "#5C1A2B");
    }
  };

  const applyTheme = (theme, broadcast = true) => {
    const isDark = theme === "dark";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeMeta(isDark);

    const toggleButtons = document.querySelectorAll(".theme-toggle");
    toggleButtons.forEach((btn) => {
      btn.setAttribute(
        "aria-label",
        isDark ? "Switch to light theme" : "Switch to dark theme"
      );
      btn.setAttribute("aria-pressed", String(isDark));
      btn.setAttribute(
        "title",
        isDark ? "Switch to light theme" : "Switch to dark theme"
      );
      const icon = btn.querySelector("i");
      if (icon && icon.classList) {
        if (isDark) {
          icon.classList.remove("fa-moon");
          icon.classList.add("fa-sun");
        } else {
          icon.classList.remove("fa-sun");
          icon.classList.add("fa-moon");
        }
      }
    });

    if (broadcast && themeChannel) {
      try {
        themeChannel.postMessage({ theme });
      } catch (_) {}
    }

    document.dispatchEvent(
      new CustomEvent("theme:change", { detail: { theme, isDark } })
    );
  };

  // Global ThemeController instance shared across all tabs and pages
  const ThemeController = {
    getTheme: () =>
      document.documentElement.getAttribute("data-theme") || getPreferredTheme(),
    setTheme: (theme, broadcast = true) => {
      if (theme !== "dark" && theme !== "light") return;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (_) {}
      applyTheme(theme, broadcast);
    },
    toggleTheme: () => {
      const current = ThemeController.getTheme();
      const nextTheme = current === "dark" ? "light" : "dark";
      ThemeController.setTheme(nextTheme, true);
      return nextTheme;
    },
    sync: () => {
      applyTheme(getPreferredTheme(), false);
    },
  };

  window.ThemeController = ThemeController;

  const handleThemeToggle = (e) => {
    e.preventDefault();
    ThemeController.toggleTheme();
  };

  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest(".theme-toggle, #theme-toggle") : null;
    if (!btn || e.__themeHandled) return;
    e.__themeHandled = true;
    handleThemeToggle(e);
  });

  const initThemeSwitcher = () => {
    const currentTheme = getPreferredTheme();
    applyTheme(currentTheme, false);

    // Cross-tab synchronization via BroadcastChannel
    if (themeChannel) {
      themeChannel.onmessage = (event) => {
        if (event.data && (event.data.theme === "dark" || event.data.theme === "light")) {
          applyTheme(event.data.theme, false);
        }
      };
    }

    // Cross-tab synchronization fallback via storage event
    window.addEventListener("storage", (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        const newTheme =
          event.newValue === "dark" || event.newValue === "light"
            ? event.newValue
            : getPreferredTheme();
        applyTheme(newTheme, false);
      }
    });

    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemChange = (e) => {
        try {
          if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            applyTheme(e.matches ? "dark" : "light", true);
          }
        } catch (_) {}
      };

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleSystemChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleSystemChange);
      }
    }
  };

  // Immediate application on execution to prevent FOUC
  try {
    const initialTheme = getPreferredTheme();
    document.documentElement.setAttribute("data-theme", initialTheme);
    updateThemeMeta(initialTheme === "dark");
  } catch (_) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeSwitcher);
  } else {
    initThemeSwitcher();
  }

  // Three-Dots ("Burger") Navigation Controller for Client Storefront
  const initDotsNavigation = () => {
    const navBar = document.querySelector(".nav-bar");
    const navMenu = document.getElementById("nav-links-menu") || (navBar && navBar.querySelector(".nav-links"));
    let dotsBtn = document.getElementById("nav-dots-toggle");

    if (navBar && navMenu && !dotsBtn && document.createElement) {
      dotsBtn = document.createElement("button");
      dotsBtn.type = "button";
      dotsBtn.id = "nav-dots-toggle";
      dotsBtn.className = "nav-dots-toggle";
      dotsBtn.setAttribute("aria-label", "Open navigation menu");
      dotsBtn.setAttribute("aria-haspopup", "true");
      dotsBtn.setAttribute("aria-expanded", "false");
      dotsBtn.setAttribute("aria-controls", navMenu.id || "nav-links-menu");
      dotsBtn.innerHTML = "<i class=\"fa-solid fa-ellipsis-vertical\" aria-hidden=\"true\"></i>";
      navBar.appendChild(dotsBtn);
    }

    let openState = false;
    const setOpen = (nextOpen) => {
      openState = Boolean(nextOpen);
      if (navMenu && navMenu.classList) {
        navMenu.classList.toggle("is-open", openState);
      }
      if (dotsBtn) {
        dotsBtn.setAttribute("aria-expanded", String(openState));
        dotsBtn.setAttribute("aria-label", openState ? "Close navigation menu" : "Open navigation menu");
      }
      return openState;
    };

    const DotsMenuController = {
      isOpen: () => openState,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!openState),
    };
    window.DotsMenuController = DotsMenuController;

    document.addEventListener("click", (e) => {
      const toggleTarget = e.target && e.target.closest ? e.target.closest("#nav-dots-toggle, .nav-dots-toggle") : null;
      if (toggleTarget) {
        e.preventDefault();
        DotsMenuController.toggle();
        return;
      }
      if (!openState) return;
      const clickedLink = e.target && e.target.closest ? e.target.closest("#nav-links-menu a, .nav-links a") : null;
      if (clickedLink) {
        DotsMenuController.close();
        return;
      }
      const insideMenu = e.target && e.target.closest ? e.target.closest("#nav-links-menu, .nav-links") : null;
      if (!insideMenu) {
        DotsMenuController.close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openState) {
        DotsMenuController.close();
        if (dotsBtn && typeof dotsBtn.focus === "function") dotsBtn.focus();
      }
    });
  };
  initDotsNavigation();

})();
