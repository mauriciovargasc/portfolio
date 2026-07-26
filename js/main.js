/* ===================================================================
 * Augustine 1.0.0 - Main JS
 *
 *
 * ------------------------------------------------------------------- */

(function(html) {

    'use strict';


   /* motion preference
    * -------------------------------------------------- */
    const SS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');


   /* animations
    * -------------------------------------------------- */
    /* The preloader is deliberately NOT animated here. Its teardown is
     * driven by the .ss-loaded class in CSS so that a failure in this
     * library can never leave the overlay covering the page.
     */
    const tl = anime.timeline( {
        easing: 'easeInOutCubic',
        duration: 800,
        autoplay: false
    })
    .add({
        targets: '.s-header',
        translateY: [-100, 0],
        opacity: [0, 1]
    })
    .add({
        targets: '.s-intro__plate',
        opacity: [0, 1],
        duration: 1000,
    })
    .add({
        targets: ['.animate-on-load'],
        translateY: [100, 0],
        opacity: [0, 1],
        delay: anime.stagger(400)
    });



   /* preloader
    *
    * Deliberately NOT gated on window 'load'. That event waits for every
    * subresource, so the overlay used to sit there until the multi-MB
    * intro photo had finished downloading. Wait on the hero only, cap it,
    * and keep 'load' as an idempotent failsafe.
    * -------------------------------------------------- */
    const ssPreloader = function() {

        const preloader = document.querySelector('#preloader');
        if (!preloader) return;

        html.classList.add('ss-preload');

        let finished = false;

        function revealIntro() {
            document.querySelectorAll('.animate-on-load').forEach(function(el) {
                el.style.opacity = 1;
                el.style.transform = 'none';
            });
        }

        function done() {

            if (finished) return;
            finished = true;

            window.scrollTo(0, 0);

            // CSS takes the overlay down from here - see .ss-loaded #preloader
            html.classList.remove('ss-preload');
            html.classList.add('ss-loaded');

            // reduced motion: reveal instantly, skip the timeline entirely
            if (SS_REDUCED.matches) {
                revealIntro();
                return;
            }

            // anime.js drives the decorative intro only. If it fails, the
            // content must still end up visible rather than stuck at the
            // opacity:0 the timeline sets on its first tick.
            try {
                tl.play();
            } catch (e) {
                revealIntro();
            }
        }

        // wait on the LCP hero if there is a real <img> for it
        const hero = document.querySelector('.s-intro__plate img');
        let heroReady;

        if (!hero || hero.complete) {
            heroReady = Promise.resolve();
        } else if (typeof hero.decode === 'function') {
            heroReady = hero.decode().catch(function() {});
        } else {
            heroReady = new Promise(function(resolve) {
                hero.addEventListener('load', resolve, { once: true });
                hero.addEventListener('error', resolve, { once: true });
            });
        }

        Promise.race([
            heroReady,
            new Promise(function(resolve) { setTimeout(resolve, 1200); })
        ]).then(done);

        window.addEventListener('load', done);   // failsafe only

    }; // end ssPreloader



   /* theme toggle
    *
    * The theme itself is applied by an inline script in <head> so it is
    * set before first paint. This only wires the button to that API.
    * ---------------------------------------------------- */
    const ssThemeToggle = function() {

        const btn = document.querySelector('.theme-toggle');
        if (!btn || !window.__ssTheme) return;

        btn.setAttribute('aria-pressed', String(window.__ssTheme.current() === 'dark'));

        btn.addEventListener('click', function() {
            window.__ssTheme.set(
                window.__ssTheme.current() === 'dark' ? 'light' : 'dark'
            );
        });

    }; // end ssThemeToggle



   /* mobile menu
    * ---------------------------------------------------- */
    const ssMobileMenu = function() {

        const toggleButton = document.querySelector('.s-header__menu-toggle');
        const mainNavWrap = document.querySelector('.s-header__nav-wrap');
        const siteBody = document.querySelector('body');

        if (!(toggleButton && mainNavWrap)) return;

        toggleButton.addEventListener('click', function(e) {
            e.preventDefault();
            toggleButton.classList.toggle('is-clicked');
            siteBody.classList.toggle('menu-is-open');
        });

        mainNavWrap.querySelectorAll('.s-header__nav a').forEach(function(link) {

            link.addEventListener("click", function(e) {

                // at 900px and below
                if (window.matchMedia('(max-width: 900px)').matches) {
                    toggleButton.classList.toggle('is-clicked');
                    siteBody.classList.toggle('menu-is-open');
                }
            });
        });

        window.addEventListener('resize', function() {

            // above 900px
            if (window.matchMedia('(min-width: 901px)').matches) {
                if (siteBody.classList.contains('menu-is-open')) siteBody.classList.remove('menu-is-open');
                if (toggleButton.classList.contains('is-clicked')) toggleButton.classList.remove('is-clicked');
            }
        });

    }; // end ssMobileMenu



   /* scroll state - sticky header + back-to-top
    *
    * Replaces two separate unthrottled listeners. Reads only scrollY
    * (no layout), coalesced into one rAF, and registered passive so it
    * never blocks scrolling.
    * ------------------------------------------------------ */
    const ssScrollState = function() {

        const hdr = document.querySelector('.s-header');
        const goTopButton = document.querySelector('.ss-go-top');
        const pxShow = 900;

        if (!(hdr || goTopButton)) return;

        let ticking = false;

        function apply() {
            const loc = window.scrollY;
            if (hdr) hdr.classList.toggle('sticky', loc > 1);
            if (goTopButton) goTopButton.classList.toggle('link-is-visible', loc >= pxShow);
            ticking = false;
        }

        apply();   // set initial state (e.g. reload part-way down the page)

        window.addEventListener('scroll', function() {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(apply);
            }
        }, { passive: true });

    }; // end ssScrollState



   /* animate elements if in viewport
    *
    * IntersectionObserver instead of a scroll handler that recomputed
    * offsetTop/offsetHeight for every block on every event. Each block
    * is unobserved once revealed, so the cost after first paint is zero.
    * ------------------------------------------------------ */
    const ssAnimateOnScroll = function() {

        const blocks = document.querySelectorAll('[data-animate-block]');
        if (!blocks.length) return;

        function revealNow(block) {
            block.classList.add('ss-animated');
            block.querySelectorAll('[data-animate-el]').forEach(function(el) {
                el.style.opacity = 1;
            });
        }

        // no animation wanted, or no observer available: just show it
        if (SS_REDUCED.matches || !('IntersectionObserver' in window)) {
            blocks.forEach(revealNow);
            return;
        }

        const observer = new IntersectionObserver(function(entries, obs) {

            entries.forEach(function(entry) {

                if (!entry.isIntersecting) return;

                const block = entry.target;
                obs.unobserve(block);

                // set the flag here rather than in an anime callback so a
                // failure inside anime can't leave the block half-hidden
                block.classList.add('ss-animated');

                anime({
                    targets: block.querySelectorAll('[data-animate-el]'),
                    opacity: [0, 1],
                    translateY: [40, 0],
                    delay: anime.stagger(110, {start: 60}),
                    duration: 700,
                    easing: 'cubicBezier(0.215, 0.61, 0.355, 1)'
                });
            });

        }, {
            rootMargin: '0px 0px -12% 0px',
            threshold: 0
        });

        blocks.forEach(function(block) {
            observer.observe(block);
        });

    }; // end ssAnimateOnScroll



   /* swiper
    * ------------------------------------------------------ */
    const ssSwiper = function() {

        const mySwiper = new Swiper('.swiper', {

            slidesPerView: 1,
            effect: 'slide',
            spaceBetween: 160,
            centeredSlides: true,
            speed: SS_REDUCED.matches ? 0 : 900,
            navigation: {
                nextEl: ".testimonial-slider__next",
                prevEl: ".testimonial-slider__prev",
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            }

        });

    }; // end ssSwiper



   /* alert boxes
    * ------------------------------------------------------ */
    const ssAlertBoxes = function() {

        const boxes = document.querySelectorAll('.alert-box');

        boxes.forEach(function(box){

            box.addEventListener('click', function(e) {
                if (e.target.matches('.alert-box__close')) {
                    e.stopPropagation();
                    e.target.parentElement.classList.add('hideit');

                    setTimeout(function(){
                        box.style.display = 'none';
                    }, 500)
                }
            });
        })

    }; // end ssAlertBoxes



   /* initialize
    *
    * Smooth scrolling is now CSS (`scroll-behavior`), which honours
    * prefers-reduced-motion for free - the MoveTo dependency is gone.
    * ------------------------------------------------------ */
    (function ssInit() {

        ssThemeToggle();
        ssPreloader();
        ssMobileMenu();
        ssScrollState();
        ssAnimateOnScroll();
        ssSwiper();
        ssAlertBoxes();

    })();

})(document.documentElement);
