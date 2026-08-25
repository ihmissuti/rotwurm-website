/*
 * Meta Conversions API relay for rotwurm.com landing pages.
 *
 * Receives the browser-side event (same event_id as the pixel fired) and
 * forwards it to Meta's Graph API with server-side match signals
 * (IP, user agent) that iOS strips from the browser pixel.
 *
 * Required Netlify environment variables (Site settings -> Environment variables):
 *   META_PIXEL_ID         - the pixel/dataset ID from Events Manager
 *   META_CAPI_TOKEN       - Conversions API access token (Events Manager ->
 *                           data source -> Settings -> Generate access token)
 * Optional:
 *   META_TEST_EVENT_CODE  - set temporarily while verifying in Test Events, then remove
 *
 * Until both required vars are set this function is a harmless no-op.
 */

const ALLOWED_EVENTS = new Set(['ViewContent', 'OtherPlatformClick']);

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) {
    return new Response(JSON.stringify({ ok: false, reason: 'capi not configured' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (!ALLOWED_EVENTS.has(body.event_name) || !body.event_id) {
    return new Response('bad request', { status: 400 });
  }

  const userData = {
    client_ip_address: context.ip || req.headers.get('x-nf-client-connection-ip') || undefined,
    client_user_agent: req.headers.get('user-agent') || undefined
  };
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;

  const payload = {
    data: [
      {
        event_name: body.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.event_id,
        event_source_url: body.source_url || 'https://rotwurm.com/',
        action_source: 'website',
        user_data: userData,
        custom_data: body.content_name
          ? { content_name: body.content_name, content_category: 'music' }
          : undefined
      }
    ]
  };
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const result = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, meta: result }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
