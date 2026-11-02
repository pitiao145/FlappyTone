-- FlappyTone visitor journeys: one row per person who loaded a flappytone.com page in the window.
-- Replace {{START}} and {{END}} with UTC datetimes, e.g. '2026-11-01 16:00:00' (= 2 Nov 00:00 Taipei).
-- Run with PostHog execute-sql. Returns at most 500 rows; for longer windows, split by day.
-- `class` is the verdict: pierre | bot | bounce | real. Report only `real`; count the others.
SELECT
  person_id,
  multiIf(
    is_pierre, 'pierre',
    ph_bot OR meta_ip OR cloud_ip, 'bot',
    pageviews <= 1 AND span_s < 10 AND ctas = 0 AND app_events = 0 AND tools = '[]', 'bounce',
    'real'
  ) AS class,
  multiIf(is_pierre, 'pierre-device', ph_bot, 'posthog-bot-flag', meta_ip, 'meta-link-preview', cloud_ip, 'cloud-ip', '') AS class_reason,
  returning,
  ip,  -- merge key only: rows with the same ip are one person on two devices or IDs. Never print it.
  first_pv, last_seen, round(span_s) AS span_s,
  cc, city, device, os, browser,
  -- Which app's in-app browser: the `in_app_browser` super property (every event since brief 27),
  -- else the first page view's user agent, with the rules of src/lib/inAppBrowser.ts.
  coalesce(nullIf(iab_prop, ''), multiIf(
    match(first_ua, 'Barcelona'), 'threads',
    match(first_ua, '(?i)Instagram'), 'instagram',
    match(first_ua, 'FBAN|FBAV|FB_IAB|FB4A'), 'facebook',
    match(first_ua, '[^A-Za-z]Line/'), 'line',
    match(first_ua, '(?i)MicroMessenger'), 'wechat',
    match(first_ua, '(?i)musical_ly|BytedanceWebview|TikTok|trill_'), 'tiktok',
    match(first_ua, '(?i)LinkedInApp'), 'linkedin',
    match(first_ua, '(?i)Snapchat'), 'snapchat',
    match(first_ua, '(?i)Pinterest'), 'pinterest',
    match(first_ua, '(?i)Reddit'), 'reddit',
    match(first_ua, '(?i)Twitter'), 'x',
    match(first_ua, '(?i)KAKAOTALK'), 'kakaotalk',
    match(first_ua, '[^A-Za-z]GSA/'), 'google-app',
    match(first_ua, 'Android') AND match(first_ua, '; wv[)]'), 'webview-android',
    match(first_ua, 'iPhone|iPad|iPod') AND NOT match(first_ua, 'Safari/')
      AND NOT match(first_ua, 'CriOS|FxiOS|EdgiOS|OPiOS|OPT/|DuckDuckGo|Brave|YaBrowser'), 'webview-ios',
    'none'
  )) AS in_app,
  entry_path, first_ref, utm_source, utm_medium, utm_campaign, social_hint, seo_src,
  paths, pageviews,
  landing_ctas, seo_ctas, tool_ctas, app_opens, tools,
  demo_opened, demo_finished, demo_ctas,
  reached_app, auth_screens, signup_started, signup_completed, login_completed,
  mic_ok, mic_denied, mic_perm_first, mic_errors, mic_help, calib_done, game_runs, tutorial_runs, run_ends, best_score, score_submitted,
  toneder_rounds, visualiser_sessions, leaderboard_views,
  daily_limit, earlybird_shown, earlybird_clicks, feedback
FROM (
  SELECT
    person_id,
    -- Pierre: any device that was ever in Yilan, on a Yilan IP, on a Vercel preview host, or in the internal cohort.
    person_id IN (
      SELECT person_id FROM events
      WHERE timestamp >= toDateTime({{START}}) - INTERVAL 90 DAY AND timestamp < toDateTime({{END}})
        AND (
          properties.$geoip_city_name = 'Yilan'
          OR properties.$host LIKE 'flappy-tone%.vercel.app'
          OR properties.$ip IN (
            SELECT DISTINCT properties.$ip FROM events
            WHERE timestamp >= toDateTime({{START}}) - INTERVAL 90 DAY AND timestamp < toDateTime({{END}})
              AND properties.$geoip_city_name = 'Yilan'
          )
        )
    ) OR any(person.properties.$internal_or_test_user) = true AS is_pierre,
    -- Read PostHog's bot flag on page views only: app events from before the 2026-10-29 deploy
    -- carry no user agent, so PostHog flags real players' gameplay as "Automation".
    maxIf(coalesce(properties.$virt_is_bot, false), event = '$pageview') AS ph_bot,
    -- Meta (Facebook/Instagram) link-preview fetchers. PostHog does not flag them.
    max(match(coalesce(properties.$ip, ''), '^(66[.]220[.]|69[.]63[.]|69[.]171[.]|173[.]252[.]|31[.]13[.]|157[.]240[.]|129[.]134[.])')) AS meta_ip,
    -- Cloud hosts: AWS, Google Cloud, Scaleway. People do not browse from these.
    max(match(coalesce(properties.$ip, ''), '^(3[.]|18[.]|44[.]|52[.]|54[.]|34[.]|35[.]|62[.]210[.]|51[.]15[.]|51[.]158[.]|151[.]115[.]|163[.]172[.])')) AS cloud_ip,
    person_id IN (
      SELECT person_id FROM events
      WHERE timestamp >= toDateTime({{START}}) - INTERVAL 90 DAY AND timestamp < toDateTime({{START}})
        AND event = '$pageview' AND properties.$host IN ('flappytone.com', 'www.flappytone.com')
    ) AS returning,
    anyIf(properties.$ip, event = '$pageview') AS ip,
    minIf(timestamp, event = '$pageview') AS first_pv,
    max(timestamp) AS last_seen,
    dateDiff('second', min(timestamp), max(timestamp)) AS span_s,
    anyIf(properties.$geoip_country_code, event = '$pageview') AS cc,
    anyIf(properties.$geoip_city_name, event = '$pageview' AND properties.$geoip_city_name != '') AS city,
    anyIf(properties.$device_type, event = '$pageview') AS device,
    anyIf(properties.$os, event = '$pageview') AS os,
    anyIf(properties.$browser, event = '$pageview') AS browser,
    anyIf(properties.in_app_browser, coalesce(properties.in_app_browser, '') != '') AS iab_prop,
    argMinIf(properties.$raw_user_agent, timestamp, event = '$pageview') AS first_ua,
    argMinIf(properties.$pathname, timestamp, event = '$pageview') AS entry_path,
    argMinIf(properties.$referring_domain, timestamp, event = '$pageview') AS first_ref,
    argMinIf(properties.utm_source, timestamp, event = '$pageview') AS utm_source,
    argMinIf(properties.utm_medium, timestamp, event = '$pageview') AS utm_medium,
    argMinIf(properties.utm_campaign, timestamp, event = '$pageview') AS utm_campaign,
    -- Instagram/Facebook in-app browsers can lose the landing page view and its referrer;
    -- the app still records the in-app browser and the fbclid.
    multiIf(
      anyIf(properties.in_app_browser, coalesce(properties.in_app_browser, '') != '') != '', anyIf(properties.in_app_browser, coalesce(properties.in_app_browser, '') != ''),
      countIf(coalesce(properties.fbclid, '') != '') > 0, 'fbclid',
      ''
    ) AS social_hint,
    anyIf(properties.seoPage, event = 'landed' AND properties.seoPage != '') AS seo_src,
    toString(groupUniqArrayIf(properties.$pathname, event = '$pageview')) AS paths,
    countIf(event = '$pageview') AS pageviews,
    toString(groupUniqArrayIf(concat(toString(properties.cta), '@', toString(properties.location)), event = 'landing_cta_clicked')) AS landing_ctas,
    toString(groupUniqArrayIf(concat(toString(properties.page), ':', toString(properties.cta)), event = 'seo_cta_click')) AS seo_ctas,
    toString(groupUniqArrayIf(concat(toString(properties.tool), ':', toString(properties.placement)), event = 'tool_cta_click')) AS tool_ctas,
    countIf(event = 'app_open') AS app_opens,
    countIf(event IN ('landing_cta_clicked', 'seo_cta_click', 'tool_cta_click', 'app_open')) AS ctas,
    toString(groupUniqArrayIf(concat(toString(properties.tool), ':', toString(properties.action)), event = 'tool_used' AND properties.tool != 'try-now')) AS tools,
    countIf(event = 'tool_used' AND properties.tool = 'try-now' AND properties.action = 'opened') AS demo_opened,
    countIf(event = 'tool_used' AND properties.tool = 'try-now' AND properties.action = 'finished') AS demo_finished,
    toString(groupUniqArrayIf(toString(properties.placement), event = 'tool_cta_click' AND properties.tool = 'try-now')) AS demo_ctas,
    countIf(event = '$pageview' AND properties.$pathname = '/app') + countIf(event = 'landed') > 0 AS reached_app,
    toString(groupUniqArrayIf(toString(properties.screen), event = 'auth_screen_viewed')) AS auth_screens,
    countIf(event = 'signup_started') AS signup_started,
    countIf(event = 'signup_completed') AS signup_completed,
    countIf(event = 'login_completed') AS login_completed,
    -- `mic` fires with ok=false on a failure (reason e.g. permission-denied); count the two apart.
    -- Game only: since brief 27 the demo and the tone visualizer send `surface` = demo / visualizer-tool.
    -- Before it, every surface sent `mic` with no `surface`.
    countIf(event = 'mic' AND properties.ok = true AND coalesce(properties.surface, 'app') = 'app') AS mic_ok,
    countIf(event = 'mic' AND properties.ok = false AND coalesce(properties.surface, 'app') = 'app') AS mic_denied,
    -- Brief 27 fields, all surfaces: the permission state before the first request,
    -- each failure as surface:error_name, each help action as surface:reason:action.
    argMinIf(properties.perm_before, timestamp, event = 'mic' AND coalesce(properties.perm_before, '') != '') AS mic_perm_first,
    toString(groupUniqArrayIf(concat(toString(properties.surface), ':', toString(properties.error_name)), event = 'mic' AND properties.ok = false AND coalesce(properties.error_name, '') != '')) AS mic_errors,
    toString(groupUniqArrayIf(concat(toString(properties.surface), ':', toString(properties.reason), ':', toString(properties.action)), event = 'mic_help')) AS mic_help,
    countIf(event = 'calib_done') AS calib_done,
    countIf(event = 'run_start' AND properties.mode != 'tutorial') AS game_runs,
    countIf(event = 'run_start' AND properties.mode = 'tutorial') AS tutorial_runs,
    countIf(event = 'run_end') AS run_ends,
    maxIf(toFloat(properties.score), event = 'run_end') AS best_score,
    countIf(event = 'score_submitted') AS score_submitted,
    countIf(event = 'toneder_round_done') AS toneder_rounds,
    countIf(event = 'visualiser_session') AS visualiser_sessions,
    countIf(event = 'leaderboard_viewed') AS leaderboard_views,
    countIf(event = 'daily_limit_reached') AS daily_limit,
    countIf(event = 'earlybird_modal_shown') AS earlybird_shown,
    countIf(event IN ('earlybird_create_account_click', 'earlybird_pay_click', 'earlybird_checkout_opened', 'profile_earlybird_cta_click', 'progress_earlybird_pricing_click', 'progress_locked_cta_click')) AS earlybird_clicks,
    countIf(event = 'feedback_submitted') + countIf(event = 'run_feedback') AS feedback,
    countIf(event NOT IN ('$pageview', '$pageleave', '$web_vitals', '$set', 'landed', 'calib_numbers', 'update_banner', 'screen_viewed', 'tool_used', 'tool_summary', 'landing_cta_clicked', 'seo_cta_click', 'tool_cta_click', 'app_open')) AS app_events
  FROM events
  WHERE timestamp >= toDateTime({{START}}) AND timestamp < toDateTime({{END}})
    -- App events before the 2026-10-29 deploy have no $host; they still belong to these people.
    AND (properties.$host IN ('flappytone.com', 'www.flappytone.com') OR coalesce(properties.$host, '') = '')
    AND person_id IN (
      SELECT person_id FROM events
      WHERE timestamp >= toDateTime({{START}}) AND timestamp < toDateTime({{END}})
        AND event = '$pageview' AND properties.$host IN ('flappytone.com', 'www.flappytone.com')
    )
  GROUP BY person_id
)
ORDER BY class DESC, first_pv
LIMIT 500
