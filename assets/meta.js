/*
 * Meta Pixel + Conversions API glue for rotwurm.com
 *
 * ONE thing to configure: paste the Pixel ID below (from Meta Events Manager).
 * Leave it empty and everything degrades gracefully — buttons still work,
 * no pixel loads, no CAPI calls are made.
 *
 * The server side (CAPI relay) is configured separately via Netlify
 * environment variables: META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE.
 */
(function () {
  var PIXEL_ID = '3340124956175264'; // "rotwurm.com" dataset in Kimmo Ihanus Management portfolio

  if (PIXEL_ID) {
    /* Meta Pixel base code */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  /* If the pixel hasn't set _fbc yet but we arrived via an ad click,
     reconstruct fbc from the fbclid URL param for better CAPI matching. */
  function getFbc() {
    var fbc = getCookie('_fbc');
    if (fbc) return fbc;
    var fbclid = new URLSearchParams(location.search).get('fbclid');
    return fbclid ? 'fb.1.' + Date.now() + '.' + fbclid : '';
  }

  function uuid() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  /*
   * Track an outbound platform click, then navigate.
   *   metaTrackOutbound({ platform: 'spotify', contentName: 'thread by thread – spotify', url: '...' })
   *
   * Spotify  -> ViewContent (the ad-optimization event)
   * Others   -> OtherPlatformClick (custom, kept out of optimization)
   *
   * The same event_id goes to both the browser pixel and the CAPI relay,
   * so Meta deduplicates the pair.
   */
  window.metaTrackOutbound = function (opts) {
    var isSpotify = opts.platform === 'spotify';
    var eventName = isSpotify ? 'ViewContent' : 'OtherPlatformClick';
    var eventId = uuid();

    if (PIXEL_ID && window.fbq) {
      window.fbq(
        isSpotify ? 'track' : 'trackCustom',
        eventName,
        { content_name: opts.contentName, content_category: 'music' },
        { eventID: eventId }
      );
    }

    try {
      var payload = JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        content_name: opts.contentName,
        source_url: location.href,
        fbp: getCookie('_fbp'),
        fbc: getFbc()
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/.netlify/functions/capi',
          new Blob([payload], { type: 'application/json' })
        );
      } else {
        fetch('/.netlify/functions/capi', {
          method: 'POST',
          body: payload,
          keepalive: true
        });
      }
    } catch (e) { /* tracking must never block navigation */ }

    /* Give the pixel request ~250ms to leave, then go. */
    setTimeout(function () { window.location.href = opts.url; }, 250);
  };
})();
