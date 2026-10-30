(function () {
  const phrase = 'payments feel safer',
    samples = [],
    swipes = [];
  let consent = false,
    typingMean = null,
    swipeSpeed = null,
    times = [],
    valid = true;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  function widget() {
    if (!document.getElementById('sendForm') || document.getElementById('behaviorWidget')) return;
    const root = document.createElement('details');
    root.id = 'behaviorWidget';
    root.className = 'banner';
    root.innerHTML = `<summary>Experimental interaction check</summary><p class="hint">Optional: enrol a typing baseline and compare a new sample before payment. Only derived timing features are sent. This never observes the payment keypad or real credentials.</p><label class="check"><input id="behaviorConsent" type="checkbox">I consent to storing derived experimental timing features and using them for payments until I clear the baseline or withdraw consent.</label><p id="behaviorStatus" role="status">Behavioral Data Unavailable</p><p class="hint">Type this fixed non sensitive phrase manually: <b>${phrase}</b></p><input id="behaviorPhrase" class="typinginput" aria-label="Interaction experiment phrase" placeholder="payments feel safer" autocomplete="off" style="width:100%;padding:12px;font-size:16px"><button type="button" id="captureInteraction" class="btn" style="margin-top:10px">Capture typing sample</button><div id="behaviorSwipe" class="banner" tabindex="0" role="group" aria-label="Swipe timing experiment" style="margin-top:12px;touch-action:none;user-select:none">Swipe left to right across this strip →</div><p class="hint" id="swipeHint">Optional: three swipes for baseline, a fourth for comparison.</p><div class="actions"><button type="button" class="btn" id="enrolInteraction">Save baseline after 3 samples</button><button type="button" class="btn" id="clearInteraction">Clear baseline</button></div>`;
    document.getElementById('sendForm').append(root);
    const $ = (id) => document.getElementById(id);
    $('behaviorConsent').checked = consent;
    $('behaviorConsent').onchange = async (e) => {
      consent = e.target.checked;
      if (!consent) {
        typingMean = null;
        swipeSpeed = null;
        times = [];
        samples.length = 0;
        swipes.length = 0;
        try {
          if (customerShared.data?.account?.baseline) {
            await customerShared.api({ action: 'baseline', consent: true, clear: true });
            await customerShared.pull(true);
          }
        } catch (error) {
          const el = $('behaviorStatus');
          if (el)
            el.textContent =
              'Behavioral Data Unavailable. Consent withdrawn in this tab; reconnect and clear the saved baseline: ' +
              error.message;
          return;
        }
      }
      status();
    };
    const input = $('behaviorPhrase');
    input.onbeforeinput = (e) => {
      if (!consent) return;
      if (e.inputType === 'insertText' && e.data?.length === 1) times.push(performance.now());
      else valid = false;
    };
    input.onpaste = () => {
      valid = false;
    };
    input.oninput = () => {
      if (!input.value) {
        times = [];
        valid = true;
      }
    };
    $('captureInteraction').onclick = () => {
      if (!consent) return ($('behaviorStatus').textContent = 'Consent is required.');
      if (input.value !== phrase || !valid || times.length !== phrase.length)
        return ($('behaviorStatus').textContent =
          'Type the complete phrase manually without corrections. Clear the field to restart.');
      const gaps = times.slice(1).map((x, i) => x - times[i]),
        m = mean(gaps);
      if (m < 20 || m > 3000)
        return ($('behaviorStatus').textContent =
          'Timing is outside the experiment range. Try again.');
      if (samples.length < 3) samples.push(m);
      else typingMean = m;
      input.value = '';
      times = [];
      valid = true;
      status();
    };
    let drag = null;
    const pad = $('behaviorSwipe');
    pad.onpointerdown = (e) => {
      if (!consent) return;
      let r = pad.getBoundingClientRect();
      if (e.clientX - r.left > r.width * 0.35) return;
      drag = { start: e.clientX, time: performance.now(), width: r.width };
      pad.setPointerCapture(e.pointerId);
    };
    pad.onpointerup = (e) => {
      if (!drag) return;
      let d = drag;
      drag = null;
      let ms = performance.now() - d.time,
        travel = (e.clientX - d.start) / d.width;
      if (ms < 100 || ms > 5000 || travel < 0.5)
        return ($('swipeHint').textContent = 'Start left, cross most of the strip and release.');
      const speed = travel / (ms / 1000);
      if (swipes.length < 3) swipes.push(speed);
      else swipeSpeed = speed;
      $('swipeHint').textContent =
        swipes.length < 3
          ? swipes.length + '/3 swipe samples'
          : 'Swipe baseline ready' + (swipeSpeed ? '; comparison captured' : '');
    };
    pad.onpointercancel = () => {
      drag = null;
    };
    $('enrolInteraction').onclick = async () => {
      if (!consent || samples.length < 3)
        return ($('behaviorStatus').textContent = 'Consent and 3 typing samples required.');
      const m = mean(samples),
        spread = Math.sqrt(mean(samples.map((v) => (v - m) ** 2)));
      try {
        await customerShared.api({
          action: 'baseline',
          consent: true,
          baseline: {
            typingMean: m,
            typingSpread: spread,
            swipeSpeed: swipes.length === 3 ? mean(swipes) : null,
          },
        });
        await customerShared.pull(true);
        status();
      } catch (e) {
        $('behaviorStatus').textContent = e.message;
      }
    };
    $('clearInteraction').onclick = async () => {
      try {
        await customerShared.api({ action: 'baseline', consent: true, clear: true });
        samples.length = 0;
        swipes.length = 0;
        typingMean = null;
        swipeSpeed = null;
        await customerShared.pull(true);
        status();
      } catch (e) {
        $('behaviorStatus').textContent = e.message;
      }
    };
    status();
  }
  function status() {
    const el = document.getElementById('behaviorStatus');
    if (!el) return;
    const enrolled = customerShared.data?.account?.baseline;
    el.textContent = !consent
      ? 'Behavioral Data Unavailable · consent not granted'
      : !enrolled
        ? 'Behavioral Data Unavailable · ' + samples.length + '/3 baseline samples captured'
        : typingMean === null
          ? 'Baseline saved. Capture another typing sample for comparison.'
          : 'Experimental comparison available for the next payment.';
  }
  window.ShieldPayBehavior = {
    comparison() {
      return consent && typingMean !== null && customerShared.data?.account?.baseline
        ? { consent: true, typingMean, swipeSpeed }
        : undefined;
    },
  };
  const old = render;
  render = function () {
    old();
    widget();
  };
  render();
})();
