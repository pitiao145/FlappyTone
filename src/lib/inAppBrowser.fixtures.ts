// User-agent strings for `detectInAppBrowser`'s tests.
//
// `posthog`: copied from `$raw_user_agent` on flappytone.com page views
// (PostHog project 426310, Aug–Nov 2026). These are what real visitors sent.
// `reference`: apps no visitor has used yet; the string follows the app's
// published UA format, so the rule is ready before the first real visit.
import type { InAppApp, InAppPlatform } from "./inAppBrowser.ts";

export interface UaFixture {
  ua: string;
  app: InAppApp;
  platform: InAppPlatform;
  source: "posthog" | "reference";
}

export const UA_FIXTURES: Record<string, UaFixture> = {
  // ---- in-app browsers seen on flappytone.com ----
  instagramIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/24A446 Instagram 451.0.0.37.60 (iPhone15,2; iOS 27_0_1; fr_FR; fr; scale=3.00; 1179x2556; IABMV/1; 1088109557) Safari/604.1",
    app: "instagram",
    platform: "ios",
    source: "posthog",
  },
  instagramAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 340.0.0.35.109 Android (33/13; 420dpi; 1080x2205; Google/google; Pixel 7; panther; panther; en_US; 600403013)",
    app: "instagram",
    platform: "android",
    source: "reference",
  },
  lineIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.12.1",
    app: "line",
    platform: "ios",
    source: "posthog",
  },
  lineAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 14; ASUS_AI2202 Build/UKQ1.230924.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36 Line/26.16.0/IAB",
    app: "line",
    platform: "android",
    source: "posthog",
  },
  facebookIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90 [FBAN/FBIOS;FBAV/580.0.0.29.107;FBBV/1073972887;FBDV/iPhone14,4;FBMD/iPhone;FBSN/iOS;FBSV/26.6.2;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]",
    app: "facebook",
    platform: "ios",
    source: "posthog",
  },
  facebookAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 12; SM-G973F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/583.0.0.29.95;]",
    app: "facebook",
    platform: "android",
    source: "posthog",
  },
  xIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G83 Twitter for iPhone/12.23",
    app: "x",
    platform: "ios",
    source: "posthog",
  },
  xAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 16; SM-F7660 Build/BP4A.251205.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.200 Mobile Safari/537.36 TwitterAndroid/12.23.1-prod.01 (312231001-r-01) SM-F7660/16 (samsung;SM-F7660;samsung;b7szhx;0;;1;2015)",
    app: "x",
    platform: "android",
    source: "posthog",
  },
  googleAppIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/443.5.997327796 Mobile/15E148 Safari/604.1",
    app: "google-app",
    platform: "ios",
    source: "posthog",
  },

  // ---- in-app browsers not seen yet ----
  threadsIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 389.0.0.41.84 (iPhone15,2; iOS 18_7; en_US; en; scale=3.00; 1179x2556; 712345678)",
    app: "threads",
    platform: "ios",
    source: "reference",
  },
  messengerIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0.0.40.109;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]",
    app: "facebook",
    platform: "ios",
    source: "reference",
  },
  wechatAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 14; 23013RK75C Build/UKQ1.230804.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300333 MMWEBSDK/20241103 MMWEBID/1234 MicroMessenger/8.0.54.2760(0x28003637) WeChat/arm64 Weixin NetType/WIFI Language/zh_TW ABI/arm64",
    app: "wechat",
    platform: "android",
    source: "reference",
  },
  tiktokIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US RevealType/Dialog",
    app: "tiktok",
    platform: "ios",
    source: "reference",
  },
  tiktokAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 trill_340104 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.1.4 ByteLocale/en BytedanceWebview/d8a21c6",
    app: "tiktok",
    platform: "android",
    source: "reference",
  },
  linkedinIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1234",
    app: "linkedin",
    platform: "ios",
    source: "reference",
  },
  snapchatIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.20.0.40 (like Safari/8618.1.15, panda)",
    app: "snapchat",
    platform: "ios",
    source: "reference",
  },
  pinterestAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.88 Mobile Safari/537.36 [Pinterest/Android]",
    app: "pinterest",
    platform: "android",
    source: "reference",
  },
  redditIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Reddit/Version 2024.40.0/Build 579331/iOS Version 18.7",
    app: "reddit",
    platform: "ios",
    source: "reference",
  },
  kakaotalkAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 KAKAOTALK/10.9.0 (INAPP)",
    app: "kakaotalk",
    platform: "android",
    source: "reference",
  },
  webviewAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36",
    app: "webview-android",
    platform: "android",
    source: "reference",
  },
  webviewIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    app: "webview-ios",
    platform: "ios",
    source: "reference",
  },

  // ---- normal browsers: all "none" ----
  safariIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Mobile/23G90 Safari/604.1",
    app: "none",
    platform: "ios",
    source: "posthog",
  },
  chromeIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.8037.55 Mobile/15E148 Safari/604.1",
    app: "none",
    platform: "ios",
    source: "posthog",
  },
  // No `Safari/` token: must not be read as a webview.
  firefoxIos: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/155 Mobile/15E148 Version/26.4",
    app: "none",
    platform: "ios",
    source: "posthog",
  },
  chromeAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    app: "none",
    platform: "android",
    source: "posthog",
  },
  samsungAndroid: {
    ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36",
    app: "none",
    platform: "android",
    source: "posthog",
  },
  firefoxAndroid: {
    ua: "Mozilla/5.0 (Android 14; Mobile; rv:155.0) Gecko/155.0 Firefox/155.0",
    app: "none",
    platform: "android",
    source: "posthog",
  },
  chromeDesktop: {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    app: "none",
    platform: "other",
    source: "posthog",
  },
  firefoxDesktop: {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0",
    app: "none",
    platform: "other",
    source: "posthog",
  },
  edgeDesktop: {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0",
    app: "none",
    platform: "other",
    source: "posthog",
  },
  safariDesktop: {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
    app: "none",
    platform: "other",
    source: "posthog",
  },
};
