(() => {
  const prefersReducedMotion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // =========================
  // /gallery/ Album Index Filter & Sort
  // =========================
  const albumGrid = document.querySelector("#gallery-album-grid");
  const albumFilter = document.querySelector("#gallery-album-filter");
  const albumSort = document.querySelector("#gallery-album-sort");
  const albumStatus = document.querySelector("#gallery-album-status");
  const albumEmpty = document.querySelector("#gallery-album-empty");

  if (albumGrid) {
    const albumItems = [...albumGrid.querySelectorAll(".album-card-item")];

    const updateAlbumGrid = () => {
      const q = (albumFilter?.value ?? "").trim().toLowerCase();
      const sortMode = albumSort?.value ?? "build";

      const sorted = [...albumItems].sort((left, right) => {
        if (sortMode === "alpha") {
          return (left.dataset.title ?? "").localeCompare(
            right.dataset.title ?? "",
          );
        }
        if (sortMode === "count") {
          return (
            Number(right.dataset.count) - Number(left.dataset.count) ||
            Number(left.dataset.order) - Number(right.dataset.order)
          );
        }
        return Number(left.dataset.order) - Number(right.dataset.order);
      });

      let visible = 0;
      for (const item of sorted) {
        const haystack = item.dataset.search ?? item.dataset.title ?? "";
        const match =
          !q ||
          q
            .split(/\s+/)
            .filter(Boolean)
            .every((word) => haystack.includes(word));
        item.hidden = !match;
        if (match) visible += 1;
      }

      albumGrid.replaceChildren(...sorted);
      if (albumEmpty) albumEmpty.hidden = visible > 0;
      if (albumStatus) {
        if (q) {
          albumStatus.hidden = false;
          albumStatus.textContent = `Showing ${visible} of ${albumItems.length} albums.`;
        } else {
          albumStatus.hidden = true;
          albumStatus.textContent = "";
        }
      }
    };

    albumFilter?.addEventListener("input", updateAlbumGrid);
    albumSort?.addEventListener("change", updateAlbumGrid);
  }

  // =========================
  // Album Grid Density Toggle
  // =========================
  const photoGrid = document.querySelector("#album-photo-grid");
  const densityToggle = document.querySelector("#album-density-toggle");
  if (photoGrid && densityToggle) {
    densityToggle.addEventListener("click", () => {
      const compact = densityToggle.dataset.density !== "compact";
      densityToggle.dataset.density = compact ? "compact" : "comfortable";
      densityToggle.setAttribute("aria-pressed", String(compact));
      densityToggle.textContent = compact ? "Comfortable grid" : "Compact grid";
      photoGrid.classList.toggle("is-compact", compact);
    });
  }

  // =========================
  // Unified Native <dialog> Lightbox (Gallery Albums + Single Posts)
  // =========================
  const lightbox = document.querySelector("#photo-lightbox");
  const lightboxImage = document.querySelector("#lightbox-image");
  const lightboxCaption = document.querySelector("#lightbox-caption");
  const lightboxCounter = document.querySelector("#lightbox-counter");
  const lightboxMeta = document.querySelector("#lightbox-meta");
  const lightboxOriginal = document.querySelector("#lightbox-original");
  const lightboxPrev = document.querySelector("#lightbox-prev");
  const lightboxNext = document.querySelector("#lightbox-next");
  const lightboxSlideshow = document.querySelector("#lightbox-slideshow");
  const lightboxFilmstrip = document.querySelector("#lightbox-filmstrip");
  const lightboxStage = lightbox?.querySelector(".lightbox-stage");

  const galleryLinks = [
    ...document.querySelectorAll("[data-lightbox-gallery] a[href]"),
  ];
  const isAlbumGallery = galleryLinks.length > 0;

  const photoLinks = isAlbumGallery
    ? galleryLinks
    : [
        ...document.querySelectorAll(".single-post .entry-content a[href]"),
      ].filter(
        (link) =>
          link.querySelector("img") &&
          /\.(jpe?g|png|webp)$/i.test(link.getAttribute("href") ?? ""),
      );

  if (lightbox && lightboxImage && photoLinks.length) {
    let activeIndex = 0;
    let slideshowTimer = null;
    let filmstripBuilt = false;
    let filmstripButtons = [];
    const preloadedUrls = new Set();

    const preloadIndex = (index) => {
      if (photoLinks.length <= 1) return;
      const wrapped = (index + photoLinks.length) % photoLinks.length;
      const href = photoLinks[wrapped]?.getAttribute("href");
      if (!href || preloadedUrls.has(href)) return;
      preloadedUrls.add(href);
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.src = href;
    };

    const stopSlideshow = () => {
      if (slideshowTimer !== null) {
        clearInterval(slideshowTimer);
        slideshowTimer = null;
      }
      if (lightboxSlideshow) {
        lightboxSlideshow.setAttribute("aria-pressed", "false");
        lightboxSlideshow.textContent = "Slideshow";
      }
    };

    const startSlideshow = () => {
      if (photoLinks.length <= 1) return;
      stopSlideshow();
      if (lightboxSlideshow) {
        lightboxSlideshow.setAttribute("aria-pressed", "true");
        lightboxSlideshow.textContent = "Pause";
      }
      slideshowTimer = setInterval(() => {
        if (!lightbox.open) {
          stopSlideshow();
          return;
        }
        showPhoto(activeIndex + 1, { fromSlideshow: true });
      }, 4000);
    };

    const buildFilmstrip = () => {
      if (filmstripBuilt || !lightboxFilmstrip || photoLinks.length <= 1)
        return;
      filmstripBuilt = true;
      const fragment = document.createDocumentFragment();
      filmstripButtons = photoLinks.map((link, idx) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lightbox-thumb";
        button.setAttribute(
          "aria-label",
          `View photo ${idx + 1} of ${photoLinks.length}`,
        );
        const img = document.createElement("img");
        const thumbSrc =
          link.dataset.thumb || link.querySelector("img")?.getAttribute("src");
        img.src = thumbSrc || link.getAttribute("href") || "";
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        button.append(img);
        button.addEventListener("click", () => {
          stopSlideshow();
          showPhoto(idx);
        });
        fragment.append(button);
        return button;
      });
      lightboxFilmstrip.replaceChildren(fragment);
      lightboxFilmstrip.hidden = false;
    };

    const syncHash = (photoId) => {
      if (!isAlbumGallery) return;
      const targetHash = photoId ? `#${photoId}` : "";
      if (location.hash === targetHash) return;
      const nextUrl = `${location.pathname}${location.search}${targetHash}`;
      history.replaceState(null, "", nextUrl);
    };

    const showPhoto = (index, { fromSlideshow = false } = {}) => {
      if (!fromSlideshow) stopSlideshow();
      activeIndex = (index + photoLinks.length) % photoLinks.length;
      const link = photoLinks[activeIndex];
      const img = link.querySelector("img");
      const href = link.getAttribute("href") ?? "";
      const alt = img?.getAttribute("alt") ?? "";
      const caption = link.dataset.caption || alt;
      const meta = link.dataset.meta || "";

      lightboxImage.src = href;
      lightboxImage.alt = alt;
      if (lightboxCaption) {
        lightboxCaption.textContent = caption;
        lightboxCaption.hidden = !caption;
      }
      if (lightboxCounter) {
        lightboxCounter.textContent = `Photo ${activeIndex + 1} of ${photoLinks.length}`;
      }
      if (lightboxMeta) {
        const dateOnly = meta.includes(" · ")
          ? meta.split(" · ").slice(1).join(" · ")
          : "";
        lightboxMeta.textContent = dateOnly;
        lightboxMeta.hidden = !dateOnly;
      }
      if (lightboxOriginal) lightboxOriginal.href = href;

      const multiple = photoLinks.length > 1;
      if (lightboxPrev) lightboxPrev.hidden = !multiple;
      if (lightboxNext) lightboxNext.hidden = !multiple;
      if (lightboxSlideshow) lightboxSlideshow.hidden = !multiple;

      if (filmstripButtons.length) {
        filmstripButtons.forEach((button, idx) => {
          const isCurrent = idx === activeIndex;
          if (isCurrent) {
            button.setAttribute("aria-current", "true");
            button.scrollIntoView({
              inline: "center",
              block: "nearest",
              behavior: prefersReducedMotion() ? "auto" : "smooth",
            });
          } else {
            button.removeAttribute("aria-current");
          }
        });
      }

      if (isAlbumGallery && link.dataset.photoId) {
        syncHash(link.dataset.photoId);
      }

      preloadIndex(activeIndex + 1);
      preloadIndex(activeIndex - 1);
    };

    const openAt = (index, { autoplay = false } = {}) => {
      buildFilmstrip();
      showPhoto(index);
      if (!lightbox.open) lightbox.showModal();
      if (autoplay) startSlideshow();
    };

    photoLinks.forEach((link, index) => {
      link.dataset.lightboxIndex = String(index);
      link.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        openAt(index);
      });
    });

    document
      .querySelector("#album-open-viewer")
      ?.addEventListener("click", () => openAt(activeIndex));

    document
      .querySelector("#album-start-slideshow")
      ?.addEventListener("click", () =>
        openAt(activeIndex, { autoplay: true }),
      );

    lightboxPrev?.addEventListener("click", () => showPhoto(activeIndex - 1));
    lightboxNext?.addEventListener("click", () => showPhoto(activeIndex + 1));

    lightboxSlideshow?.addEventListener("click", () => {
      if (slideshowTimer !== null) stopSlideshow();
      else startSlideshow();
    });

    lightbox.addEventListener("keydown", (event) => {
      if (photoLinks.length <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPhoto(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(activeIndex + 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        showPhoto(0);
      } else if (event.key === "End") {
        event.preventDefault();
        showPhoto(photoLinks.length - 1);
      } else if (
        event.key === " " &&
        !event.target.closest("button, a, input, select, textarea")
      ) {
        event.preventDefault();
        if (slideshowTimer !== null) stopSlideshow();
        else startSlideshow();
      }
    });

    // Touch swipe navigation on the lightbox stage
    if (lightboxStage && photoLinks.length > 1) {
      let swipeStartX = 0;
      let swipeStartY = 0;
      let swipePointerId = null;

      lightboxStage.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch" && event.pointerType !== "pen")
          return;
        swipePointerId = event.pointerId;
        swipeStartX = event.clientX;
        swipeStartY = event.clientY;
      });

      lightboxStage.addEventListener("pointerup", (event) => {
        if (event.pointerId !== swipePointerId) return;
        swipePointerId = null;
        const deltaX = event.clientX - swipeStartX;
        const deltaY = event.clientY - swipeStartY;
        if (
          Math.abs(deltaX) > 48 &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.4
        ) {
          showPhoto(deltaX < 0 ? activeIndex + 1 : activeIndex - 1);
        }
      });

      lightboxStage.addEventListener("pointercancel", () => {
        swipePointerId = null;
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopSlideshow();
    });

    lightbox.addEventListener("close", () => {
      stopSlideshow();
      lightbox.returnValue = "";
      if (isAlbumGallery && /^#photo-\d+$/.test(location.hash)) {
        syncHash("");
      }
    });

    // Fallback light-dismiss where <dialog closedby="any"> is unsupported
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const outside = (event) => {
        const rect = lightbox.getBoundingClientRect();
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
      };
      let pressedOutside = false;
      lightbox.addEventListener("pointerdown", (event) => {
        pressedOutside = outside(event);
      });
      lightbox.addEventListener("pointerup", (event) => {
        if (pressedOutside && outside(event)) lightbox.close();
      });
    }

    // Open directly to a deep-linked photo hash (e.g., /gallery/body-buck/#photo-5)
    if (isAlbumGallery && /^#photo-\d+$/.test(location.hash)) {
      const targetId = location.hash.slice(1);
      const targetIndex = photoLinks.findIndex(
        (link) => link.dataset.photoId === targetId,
      );
      if (targetIndex !== -1) {
        openAt(targetIndex);
      }
    }
  }
})();
