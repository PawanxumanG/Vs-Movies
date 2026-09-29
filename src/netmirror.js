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
 * Fetch active, verified bypass cookie from ShinzoApk Firebase Realtime DB
 */
async function getActiveCookie(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedFirebaseCookie && now - lastCookieFetch < 120000) {
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

/**
 * Search movies & TV series using NetMirror Mobile API
 */
async function searchContent(query) {
  const cookie = await getActiveCookie();
  const url = `${MOBILE_BASE_URL}/mobile/search.php?s=${encodeURIComponent(query.trim())}`;

  try {
    const res = await axios.get(url, {
      headers: {
        ...MOBILE_HEADERS,
        'Cookie': cookie,
      },
      timeout: 8000,
    });

    const data = res.data;
    if (data && data.searchResult && Array.isArray(data.searchResult)) {
      const imgcdn = 'https://imgcdn.kim/poster/341/';
      return data.searchResult.map(item => ({
        id: item.id,
        title: item.t,
        ott: item.ott || 'nf',
        poster: item.id ? imgcdn.replace('------------------', item.id) : '',
      }));
    }
  } catch (e) {
    console.warn('[Mobile Search Fallback]:', e.message);
  }

  // Fallback to TV search
  try {
    const tvUrl = `${TV_BASE_URL}/newtv/search.php?s=${encodeURIComponent(query.trim())}`;
    const tokenVal = (cookie || '').replace('t_hash_t=', '');
    const res = await axios.get(tvUrl, {
      headers: {
        ...MOBILE_HEADERS,
        'Cookie': cookie,
        'Usertoken': tokenVal,
        'Ott': 'nf',
      },
      timeout: 8000,
    });
    if (res.data && res.data.searchResult && Array.isArray(res.data.searchResult)) {
      const imgcdn = res.data.imgcdn || 'https://imgcdn.kim/poster/341/';
      return res.data.searchResult.map(item => ({
        id: item.id,
        title: item.t,
        ott: item.ott || 'nf',
        poster: item.id ? imgcdn.replace('------------------', item.id) : '',
      }));
    }
  } catch (tvErr) {
    console.error('[TV Search Fallback Error]:', tvErr.message);
  }

  return [];
}

/**
 * Get full metadata for a movie or TV show using NetMirror Mobile API
 */
async function getContentDetails(id, ott = 'nf') {
  const cookie = await getActiveCookie();
  const url = `${MOBILE_BASE_URL}/mobile/post.php?id=${id}`;

  const res = await axios.get(url, {
    headers: {
      ...MOBILE_HEADERS,
      'Cookie': cookie,
      'Ott': ott,
    },
    timeout: 8000,
  });

  const data = res.data || {};
  let poster = `https://imgcdn.kim/poster/h/${id}.jpg`;

  return {
    id: data.main_id || id,
    title: data.title || 'Unknown Title',
    year: data.year || '',
    runtime: data.runtime || '',
    rating: data.ua || '',
    quality: data.hdsd || 'HD',
    type: data.type || 'm', // 'm' = Movie, 's' = Series
    synopsis: data.desc || data.m_desc || '',
    poster: poster,
    languages: data.lang || [{ l: 'English', s: 'eng' }, { l: 'Hindi', s: 'hin' }],
    moreDetails: [],
    ott: data.ott || ott,
  };
}

/**
 * Fetch seasons and episodes for TV Series
 */
async function getEpisodes(id, ott = 'nf') {
  const cookie = await getActiveCookie();
  const url = `${MOBILE_BASE_URL}/mobile/episodes.php?id=${id}`;

  try {
    const res = await axios.get(url, {
      headers: {
        ...MOBILE_HEADERS,
        'Cookie': cookie,
        'Ott': ott,
      },
      timeout: 8000,
    });

    const data = res.data || {};
    return {
      episodes: Array.isArray(data.episodes) ? data.episodes : [],
      nextPage: data.nextPage || null,
      nextPageSeason: data.nextPageSeason || null,
    };
  } catch (e) {
    // TV fallback
    const tvUrl = `${TV_BASE_URL}/newtv/episodes.php?id=${id}`;
    const tokenVal = (cookie || '').replace('t_hash_t=', '');
    const res = await axios.get(tvUrl, {
      headers: {
        ...MOBILE_HEADERS,
        'Usertoken': tokenVal,
        'Ott': ott,
      },
      timeout: 8000,
    });
    const data = res.data || {};
    return {
      episodes: Array.isArray(data.episodes) ? data.episodes : [],
      nextPage: data.nextPage || null,
      nextPageSeason: data.nextPageSeason || null,
    };
  }
}

/**
 * Parse Master M3U8 Playlist and extract all streams & audio tracks
 */
async function getStreamDetails(id, ott = 'nf') {
  const cookie = await getActiveCookie();
  const tokenVal = (cookie || '').replace('t_hash_t=', '');

  const playerUrl = `${TV_BASE_URL}/newtv/player.php?id=${id}`;

  const playerRes = await axios.get(playerUrl, {
    headers: {
      ...MOBILE_HEADERS,
      'Ott': ott,
      'Usertoken': tokenVal,
      'Cookie': cookie,
    },
    timeout: 10000,
  });

  const pData = playerRes.data || {};
  let masterM3u8Url = pData.video_link;
  const referer = pData.referer || 'https://net52.cc';

  if (!masterM3u8Url) {
    throw new Error('Stream URL not found for this title');
  }

  // Fetch Master Playlist
  const m3u8Res = await axios.get(masterM3u8Url, {
    headers: {
      ...MOBILE_HEADERS,
      'Referer': referer,
      'Cookie': cookie,
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
