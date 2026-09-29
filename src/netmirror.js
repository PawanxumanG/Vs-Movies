const axios = require('axios');

const FIREBASE_COOKIE_URL = 'https://shinzoverseapk-default-rtdb.firebaseio.com/netmirror_cookie.json';
const MOBILE_BASE_URL = 'https://net52.cc';
const TV_BASE_URL = 'https://tv.imgcdn.kim';

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 /OS.Gatu v3.0',
  'X-Requested-With': 'app.netmirror.netmirrornew',
  'Referer': 'https://net52.cc/mobile/home?app=1',
  'Accept': 'application/json, text/plain, */*',
};

let cachedFirebaseCookie = null;
let lastCookieFetch = 0;

/**
 * Fetch active, verified bypass cookie and decoded usertoken from ShinzoApk Firebase Realtime DB
 */
async function getActiveCookie(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedFirebaseCookie && now - lastCookieFetch < 60000) {
    return cachedFirebaseCookie;
  }

  try {
    const res = await axios.get(FIREBASE_COOKIE_URL, { timeout: 5000 });
    if (res.data && res.data.cookie) {
      cachedFirebaseCookie = res.data.cookie;
      lastCookieFetch = now;
      return cachedFirebaseCookie;
    }
  } catch (e) {
    console.error('[Firebase Cookie Error]:', e.message);
  }

  return cachedFirebaseCookie || 't_hash_t=none';
}

function getDecodedToken(cookieStr) {
  if (!cookieStr) return 'none';
  const raw = cookieStr.replace('t_hash_t=', '').trim();
  try {
    return decodeURIComponent(raw);
  } catch (e) {
    return raw;
  }
}

/**
 * Search movies & TV series across NetMirror streaming engine
 */
async function searchContent(query, retry = true) {
  const cookie = await getActiveCookie(!retry);
  const tokenVal = getDecodedToken(cookie);

  const cleanQuery = query.trim();
  const tvUrl = `${TV_BASE_URL}/newtv/search.php?s=${encodeURIComponent(cleanQuery)}`;

  try {
    const res = await axios.get(tvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
        'X-Requested-With': 'NetmirrorNewTV v1.0',
        'Referer': 'https://net52.cc',
        'Cookie': cookie,
        'Usertoken': tokenVal,
        'Ott': 'nf',
      },
      timeout: 8000,
    });

    const data = res.data;
    if (data && data.searchResult && Array.isArray(data.searchResult) && data.searchResult.length > 0) {
      return data.searchResult.map(item => ({
        id: item.id,
        title: (item.t || '').trim(),
        ott: item.ott || data.ott || 'nf',
        poster: item.id ? `https://imgcdn.kim/poster/v/${item.id}.jpg` : '',
      }));
    }
  } catch (tvErr) {
    console.warn('[TV Search Warn]:', tvErr.message);
  }

  // If no results on 'nf', try multi-OTT search (Prime Video, Disney+)
  for (const ott of ['pv', 'ds', 'zee', 'hbo']) {
    try {
      const res = await axios.get(tvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
          'X-Requested-With': 'NetmirrorNewTV v1.0',
          'Referer': 'https://net52.cc',
          'Cookie': cookie,
          'Usertoken': tokenVal,
          'Ott': ott,
        },
        timeout: 6000,
      });
      if (res.data && res.data.searchResult && Array.isArray(res.data.searchResult) && res.data.searchResult.length > 0) {
        return res.data.searchResult.map(item => ({
          id: item.id,
          title: (item.t || '').trim(),
          ott: ott,
          poster: item.id ? `https://imgcdn.kim/poster/v/${item.id}.jpg` : '',
        }));
      }
    } catch (e) {}
  }

  return [];
}

/**
 * Get full metadata for a movie or TV show
 */
async function getContentDetails(id, ott = 'nf', retry = true) {
  const cookie = await getActiveCookie(!retry);
  const tokenVal = getDecodedToken(cookie);
  const tvUrl = `${TV_BASE_URL}/newtv/post.php?id=${id}`;

  let data = {};
  try {
    const tvRes = await axios.get(tvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
        'X-Requested-With': 'NetmirrorNewTV v1.0',
        'Referer': 'https://net52.cc',
        'Cookie': cookie,
        'Usertoken': tokenVal,
        'Ott': ott,
      },
      timeout: 8000,
    });
    data = tvRes.data || {};
  } catch (tvErr) {
    if (retry) {
      console.warn('[Post Details Retry with Fresh Cookie]...', tvErr.message);
      await getActiveCookie(true);
      return getContentDetails(id, ott, false);
    }
    console.error('[TV Post Error]:', tvErr.message);
  }

  const title = (data.title || data.t || '').trim() || 'Movie';
  const poster = `https://imgcdn.kim/poster/h/${id}.jpg`;
  const isSeries = data.type === 't' || data.type === 's' || data.type === 'tv' || (data.season && data.season.length > 0) || (data.episodes && data.episodes.length > 0);

  return {
    id: data.main_id || id,
    title: title,
    year: data.year || '',
    runtime: data.runtime || '',
    rating: data.ua || '',
    quality: data.hdsd || 'HD',
    type: isSeries ? 's' : 'm', // 'm' = Movie, 's' = Series
    synopsis: data.desc || data.m_desc || '',
    poster: poster,
    languages: Array.isArray(data.lang) && data.lang.length > 0 ? data.lang : [{ l: 'English', s: 'eng' }, { l: 'Hindi', s: 'hin' }],
    moreDetails: data.moredetails || [],
    seasons: data.season || [],
    episodes: data.episodes || [],
    ott: data.ott || ott,
  };
}

/**
 * Fetch seasons and episodes for TV Series
 */
async function getEpisodes(id, ott = 'nf', retry = true) {
  try {
    const details = await getContentDetails(id, ott, retry);
    if (details.episodes && details.episodes.length > 0) {
      return {
        episodes: details.episodes,
        seasons: details.seasons || [],
      };
    }
  } catch (e) {
    console.error('[getEpisodes Error]:', e.message);
  }

  return { episodes: [], seasons: [] };
}

/**
 * Parse Master M3U8 Playlist and extract all streams & audio tracks
 */
async function getStreamDetails(id, ott = 'nf', retry = true) {
  const cookie = await getActiveCookie(!retry);
  const tokenVal = getDecodedToken(cookie);

  const playerUrl = `${TV_BASE_URL}/newtv/player.php?id=${id}`;

  let playerRes;
  try {
    playerRes = await axios.get(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
        'X-Requested-With': 'NetmirrorNewTV v1.0',
        'Referer': 'https://net52.cc',
        'Cookie': cookie,
        'Ott': ott,
        'Usertoken': tokenVal,
      },
      timeout: 10000,
    });
  } catch (err) {
    if (retry) {
      console.warn('[Player Stream Retry with Fresh Cookie]...', err.message);
      await getActiveCookie(true);
      return getStreamDetails(id, ott, false);
    }
    throw err;
  }

  const pData = playerRes.data || {};
  let masterM3u8Url = pData.video_link;
  const referer = pData.referer || 'https://net52.cc';

  if (!masterM3u8Url) {
    throw new Error('Stream URL not found for this title');
  }

  // Fetch Master Playlist
  const m3u8Res = await axios.get(masterM3u8Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
      'X-Requested-With': 'NetmirrorNewTV v1.0',
      'Referer': referer,
    },
    timeout: 10000,
  });

  const m3u8Content = m3u8Res.data;
  const lines = typeof m3u8Content === 'string' ? m3u8Content.split('\n') : [];

  const audioTracks = [];
  const videoQualities = [];
  const subtitles = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Audio Tracks
    if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      const isDefault = line.includes('DEFAULT=YES');

      if (uriMatch) {
        audioTracks.push({
          name: nameMatch ? nameMatch[1] : (langMatch ? langMatch[1] : 'Audio'),
          lang: langMatch ? langMatch[1] : 'und',
          uri: uriMatch[1],
          isDefault,
        });
      }
    }

    // Subtitles
    if (line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) {
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        subtitles.push({
          name: nameMatch ? nameMatch[1] : 'Subtitles',
          lang: langMatch ? langMatch[1] : 'en',
          uri: uriMatch[1],
        });
      }
    }

    // Video Streams
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';

      if (nextLine && !nextLine.startsWith('#')) {
        let label = 'Auto';
        if (resMatch) {
          const height = resMatch[1].split('x')[1];
          label = `${height}p`;
        }
        videoQualities.push({
          label,
          resolution: resMatch ? resMatch[1] : 'Unknown',
          bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0,
          uri: nextLine,
        });
      }
    }
  }

  // Fallback default audio if none parsed
  if (audioTracks.length === 0) {
    audioTracks.push({ name: 'Default Audio', lang: 'und', uri: null, isDefault: true });
  }

  return {
    title: pData.title || '',
    epTitle: pData.ep_title || '',
    masterUrl: masterM3u8Url,
    referer,
    videoQualities,
    audioTracks,
    subtitles,
  };
}

module.exports = {
  getActiveCookie,
  searchContent,
  getContentDetails,
  getEpisodes,
  getStreamDetails,
};
