// ==UserScript==
// @name        OpenVideoData Uploader
// @namespace   openvideodata
// @match       http*://*.youtube.com/*
// @match       https://openvideodata.org
// @noframes
// @grant       GM_xmlhttpRequest
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @grant       GM_unregisterMenuCommand
// @grant       GM_addStyle
// @version     0.0.1
// @author      rjeli
// @require     https://raw.github.com/odyniec/MonkeyConfig/master/monkeyconfig.js
// ==/UserScript==

log('info:', GM_info);

const cfg = new MonkeyConfig({
  title: 'Config',
  menuCommand: true,
  params: {
    uploadKey: {
      type: 'text',
    },
    devMode: {
      type: 'checkbox',
    },
  },
});

const VERSION = 0;
const BACKEND = cfg.get('devMode') ? 'http://localhost:8000' : 'https://openvideodata.org';

switch (window.location.host) {
case 'www.youtube.com':
  log('loading youtube');
  loadYoutube();
  break;
default:
}

// YOUTUBE

async function loadYoutube() {
  injectXhrProxy();
  for (;;) {
    if (unsafeWindow.ytInitialData) {
      log('initialData:', unsafeWindow.ytInitialData);
      extractYoutubeResponse(unsafeWindow.ytInitialData);
      return;
    }
    await sleep(100);
  }
}

function injectXhrProxy() {
  const realOpen = unsafeWindow.XMLHttpRequest.prototype.open;
  unsafeWindow.XMLHttpRequest.prototype.open = function() {
    const url = arguments[1];
    if (url.startsWith('https://www.youtube.com/watch')) {
      log('proxying watch xhr', url);
      this.addEventListener('load', () => {
        log('loaded watch xhr', url, this.responseText.length);
        const parsed = JSON.parse(this.responseText);
        log('watch xhr:', parsed);
        parsed.forEach(item => {
          if (item.response) {
            extractYoutubeResponse(item.response);
          }
        });
        // compressAndUpload({ type: 'yt-watch-xhr', payload: this.responseText });
      });
    }
    realOpen.apply(this, arguments);

  };
}

async function extractYoutubeResponse(resp) {
  const videoId = resp.currentVideoEndpoint.watchEndpoint.videoId;
  const vidInfos = [];

  const videoInfoRenderers = resp.contents.twoColumnWatchNextResults.results.results.contents;
  const currentVideoInfo = extractVideoInfoRenderer(videoId, videoInfoRenderers);
  console.log('currentVideoInfo:', currentVideoInfo);
  vidInfos.push(currentVideoInfo);

  const sidebarContents = resp.contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results; 
  sidebarContents.forEach(c => {
    let cvr = null;
    if (c.compactVideoRenderer) {
      cvr = c.compactVideoRenderer;
    } else if (c.compactAutoplayRenderer) {
      cvr = c.compactAutoplayRenderer.contents[0].compactVideoRenderer;
    }
    if (cvr) {
      try {
        vidInfos.push(extractCompactVideoRenderer(cvr));
      } catch (e) {}
    }
  });

  console.log('vidInfos:', vidInfos);

  const fd = new FormData();
  fd.append('agent', 'gm');
  fd.append('version', VERSION);
  fd.append('key', cfg.get('uploadKey'));
  fd.append('site', 'yt');
  fd.append('payload', JSON.stringify({
    videos: vidInfos,
  }));
  await gmXhr({
    url: BACKEND+'/api/v1/upload',
    method: 'POST',
    data: fd,
  });
}

function extractVideoInfoRenderer(videoId, rens) {
  const primaryInfo = rens[0].videoPrimaryInfoRenderer;
  const secondInfo = rens[1].videoSecondaryInfoRenderer;
  const ownerRen = secondInfo.owner.videoOwnerRenderer;
  const ownerChannelUrl = ownerRen.title.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
  return {
    videoId,
    title: primaryInfo.title.runs[0].text,
    channelId: ownerChannelUrl.split('/')[2],
    channelTitle: ownerRen.title.runs[0].text,
    viewCount: parseViewCountText(primaryInfo.viewCount.videoViewCountRenderer.viewCount.simpleText),
    desc: secondInfo.description.runs[0].text,
    uploadDate: new Date(primaryInfo.dateText.simpleText),
  };
}

function extractCompactVideoRenderer(ren) {
  return {
    videoId: ren.videoId,
    title: ren.title.simpleText,
    channelId: ren.channelId,
    channelTitle: ren.longBylineText.runs[0].text,
    viewCount: parseViewCountText(ren.viewCountText.simpleText),
  };
}

function parseViewCountText(s) {
  return parseInt(s.split(' ')[0].replace(/,/g, ''));
}

// Utility functions

function log() {
  const prefix = ['%cOpenVideoData:', 'background: green; color: white;'];
  console.log.apply(null, prefix.concat(Array.from(arguments)));
}

async function gmXhr(opts) {
  return new Promise((res, rej) => {
    GM_xmlhttpRequest(Object.assign({}, opts, {
      onload: evt => res(evt),
      onerror: evt => rej(evt),
    }));
  });
}

async function compressAndUpload(data) {
  const enc = new TextEncoder();
  const utf8 = enc.encode(data.payload);
  const gzipped = pako.gzip(utf8, { level: 9 });
  const blob = new Blob([gzipped], { type: 'application/octet-stream' });
  const fd = new FormData();
  fd.append('location', window.location);
  fd.append('type', data.type);
  fd.append('payload', blob);
  await gmXhr({
    url: BACKEND+'/api/upload',
    method: 'POST',
    data: fd,
  });
  log('compressAndUpload done');
}

function waitForSelector(sel) {
  return new Promise((res, rej) => {
    innerWait(sel, 200);
    function innerWait(sel, time) {
      const el = document.querySelector(sel);
      if (el !== null) {
        res(el);
      } else {
        setTimeout(() => innerWait(sel, time), time);
      }
    };
  });
}

function waitUntil(test) {
  return new Promise((res, rej) => {
    innerWait();
    function innerWait() {
      if (test()) {
        res();
      } else {
        setTimeout(() => innerWait(), 200);
      }
    }
  });
}

function sleep(ms) {
  return new Promise((res, rej) => {
    setTimeout(() => res(), ms);
  });
}

function postMsg(msg) {
  window.postMessage({ neettvsidecar: true, ...msg });
}


