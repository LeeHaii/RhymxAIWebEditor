const TEMPLATE_IDS = new Set(['kinetic_title', 'product_card', 'end_card'])

function scriptJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}

function safeColor(value) {
  const color = String(value || '')
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ec4899'
}

export function validateMotionRenderRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('A motion render request is required.')
  if (!TEMPLATE_IDS.has(input.templateId)) throw new Error(`Unsupported HyperFrames template: ${String(input.templateId)}`)
  const templateVersion = Number(input.templateVersion)
  const durationSec = Number(input.durationSec)
  const width = Number(input.width)
  const height = Number(input.height)
  const fps = Number(input.fps)
  if (!Number.isInteger(templateVersion) || templateVersion < 1) throw new Error('Template version must be a positive integer.')
  if (!Number.isFinite(durationSec) || durationSec < 0.5 || durationSec > 60) throw new Error('Motion duration must be between 0.5 and 60 seconds.')
  if (!Number.isInteger(width) || width < 640 || width > 3840) throw new Error('Motion width must be between 640 and 3840 pixels.')
  if (!Number.isInteger(height) || height < 360 || height > 3840) throw new Error('Motion height must be between 360 and 3840 pixels.')
  if (![24, 30, 60].includes(fps)) throw new Error('Motion FPS must be 24, 30, or 60.')
  if (Math.max(width / height, height / width) > 3) throw new Error('Motion render aspect ratio is outside the supported range.')
  const incomingValues = input.values && typeof input.values === 'object' && !Array.isArray(input.values)
    ? input.values
    : {}
  const values = {}
  for (const [key, value] of Object.entries(incomingValues).slice(0, 24)) {
    if (!/^[a-z][a-z0-9_-]{0,48}$/i.test(key)) continue
    if (typeof value === 'string') values[key] = value.slice(0, 500)
    else if (typeof value === 'number' && Number.isFinite(value)) values[key] = value
    else if (typeof value === 'boolean') values[key] = value
  }
  return {
    templateId: input.templateId,
    templateVersion,
    values,
    accentColor: safeColor(input.accentColor || values.accent),
    durationSec: Math.round(durationSec * 1000) / 1000,
    width,
    height,
    fps,
  }
}

export function canonicalMotionRenderRequest(request) {
  const sortedValues = Object.fromEntries(
    Object.entries(request.values).sort(([first], [second]) => first.localeCompare(second))
  )
  return JSON.stringify({ ...request, values: sortedValues })
}

export function buildMotionComposition(request) {
  const payload = scriptJson(request)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${request.width}, height=${request.height}" />
    <meta data-composition-id="rhymx-motion" data-width="${request.width}" data-height="${request.height}" data-fps="${request.fps}" />
    <title>Rhymx local motion</title>
    <script src="./gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${request.width}px; height: ${request.height}px; overflow: hidden; background: #070811; }
      body { font-family: Inter, Arial, sans-serif; color: white; }
      #stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: radial-gradient(circle at 76% 18%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 31%), linear-gradient(135deg, #070811, #151126 56%, #08090d); }
      .grain { position: absolute; inset: 0; opacity: .12; background-image: linear-gradient(90deg, transparent 49.5%, rgba(255,255,255,.12) 50%, transparent 50.5%), linear-gradient(transparent 49.5%, rgba(255,255,255,.08) 50%, transparent 50.5%); background-size: 72px 72px; }
      .orb { position: absolute; width: 42%; aspect-ratio: 1; right: -8%; top: -22%; border: max(1px, .08vw) solid color-mix(in srgb, var(--accent) 58%, transparent); border-radius: 46% 54% 61% 39%; box-shadow: inset 0 0 80px color-mix(in srgb, var(--accent) 12%, transparent); }
      .content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 9%; }
      .eyebrow { color: var(--accent); font-size: clamp(14px, 1.15vw, 28px); font-weight: 800; letter-spacing: .28em; text-transform: uppercase; }
      .title { margin: 2.2% 0 0; max-width: 84%; font-size: clamp(56px, 6.6vw, 132px); line-height: .92; letter-spacing: -.055em; font-weight: 900; }
      .body { margin-top: 2.4%; max-width: 68%; color: #bcc3d2; font-size: clamp(22px, 2vw, 42px); line-height: 1.25; }
      .word { display: inline-block; margin-right: .22em; transform-origin: 50% 100%; }
      .product-shell { width: 78%; display: grid; grid-template-columns: 1.05fr .95fr; align-items: center; gap: 7%; }
      .product-card { min-height: 46vh; padding: 10%; border: 1px solid color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,.1)); border-radius: 4vw; background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.025)); box-shadow: 0 4vw 9vw rgba(0,0,0,.45); backdrop-filter: blur(18px); }
      .product-mark { width: 30%; aspect-ratio: 1; border-radius: 28%; background: var(--accent); box-shadow: 0 0 7vw color-mix(in srgb, var(--accent) 55%, transparent); }
      .cta { display: inline-flex; align-items: center; width: max-content; margin-top: 3.2%; padding: 1.2% 2.2%; border-radius: 999px; background: var(--accent); color: #070811; font-size: clamp(18px, 1.45vw, 30px); font-weight: 850; }
      .end-content { align-items: center; text-align: center; }
      .end-content .title, .end-content .body { max-width: 82%; }
      .end-content .orb { right: auto; left: 50%; top: 50%; width: 56%; transform: translate(-50%, -50%); }
    </style>
  </head>
  <body>
    <div id="stage">
      <div class="grain"></div>
      <div class="orb"></div>
      <div id="content" class="content">
        <div id="eyebrow" class="eyebrow"></div>
        <div id="title" class="title"></div>
        <div id="body" class="body"></div>
        <div id="cta" class="cta"></div>
      </div>
    </div>
    <script>
      const request = ${payload};
      const values = request.values || {};
      const title = String(values.title || 'Momentum changes everything');
      const body = String(values.body || 'Designed to move with the story');
      document.documentElement.style.setProperty('--accent', request.accentColor);
      const content = document.querySelector('#content');
      const eyebrow = document.querySelector('#eyebrow');
      const titleNode = document.querySelector('#title');
      const bodyNode = document.querySelector('#body');
      const cta = document.querySelector('#cta');
      cta.style.display = 'none';

      if (request.templateId === 'kinetic_title') {
        eyebrow.textContent = 'Kinetic typography';
        for (const word of title.split(/\\s+/).filter(Boolean)) {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = word;
          titleNode.appendChild(span);
        }
        bodyNode.textContent = body;
      } else if (request.templateId === 'product_card') {
        content.innerHTML = '<div class="product-shell"><div><div id="eyebrow" class="eyebrow"></div><div id="title" class="title"></div><div id="body" class="body"></div></div><div class="product-card"><div class="product-mark"></div><div class="eyebrow" style="margin-top:15%">New release</div><div class="body" style="max-width:100%">A focused launch moment, rendered locally.</div></div></div>';
        content.querySelector('#eyebrow').textContent = 'Product launch';
        content.querySelector('#title').textContent = title;
        content.querySelector('#body').textContent = body;
      } else {
        content.classList.add('end-content');
        eyebrow.textContent = 'One last thing';
        titleNode.textContent = title;
        bodyNode.textContent = body;
        cta.textContent = body;
        bodyNode.style.display = 'none';
        cta.style.display = 'inline-flex';
      }

      const tl = gsap.timeline({ paused: true });
      const clock = { value: 0 };
      const at = (seconds) => seconds * (request.durationSec / 5);
      tl.to(clock, { value: 1, duration: request.durationSec, ease: 'none' }, 0);
      tl.fromTo('.grain', { opacity: 0 }, { opacity: .12, duration: at(.7), ease: 'power2.out' }, 0);
      tl.fromTo('.orb', { opacity: 0, rotation: -22, scale: .72 }, { opacity: 1, rotation: 8, scale: 1, duration: at(1.25), ease: 'power3.out' }, 0);
      tl.to('.orb', { rotation: 42, xPercent: 8, duration: Math.max(.01, request.durationSec - at(1.1)), ease: 'none' }, at(1.1));
      if (request.templateId === 'kinetic_title') {
        const wordCount = Math.max(1, document.querySelectorAll('.word').length);
        tl.fromTo('.word', { opacity: 0, y: 110, rotationX: -62 }, { opacity: 1, y: 0, rotationX: 0, duration: at(.72), stagger: Math.min(at(.1), at(2) / wordCount), ease: 'back.out(1.4)' }, at(.15));
        tl.fromTo('#eyebrow, #body', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: at(.65), stagger: at(.12), ease: 'power2.out' }, at(.55));
      } else if (request.templateId === 'product_card') {
        tl.fromTo('.product-shell > div:first-child', { opacity: 0, x: -90 }, { opacity: 1, x: 0, duration: at(.9), ease: 'power3.out' }, at(.15));
        tl.fromTo('.product-card', { opacity: 0, x: 120, rotationY: -18, scale: .82 }, { opacity: 1, x: 0, rotationY: 0, scale: 1, duration: at(1.15), ease: 'power3.out' }, at(.25));
        tl.to('.product-card', { y: -24, duration: Math.max(.01, (request.durationSec - at(1.5)) / 2), ease: 'sine.inOut', yoyo: true, repeat: 1 }, at(1.25));
      } else {
        tl.fromTo('#eyebrow', { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: at(.65), ease: 'power2.out' }, at(.15));
        tl.fromTo('#title', { opacity: 0, scale: .82, filter: 'blur(18px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: at(1), ease: 'power3.out' }, at(.3));
        tl.fromTo('#cta', { opacity: 0, y: 35 }, { opacity: 1, y: 0, duration: at(.7), ease: 'back.out(1.5)' }, at(.9));
      }
      const exitAt = Math.max(0, request.durationSec - at(.55));
      tl.to('#content', { opacity: 0, y: -24, duration: at(.45), ease: 'power2.in' }, exitAt);
      window.__timelines = window.__timelines || {};
      window.__timelines['rhymx-motion'] = tl;
    </script>
  </body>
</html>`
}
