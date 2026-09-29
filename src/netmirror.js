const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
  'X-Requested-With': 'NetmirrorNewTV v1.0',
  'Referer': 'https://net52.cc',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const DISCOVERY_DOMAINS = [
  'https://mobiledetects.com',
  'https://mobiledetect.app',
  'https://mobidetect.art',
  'https://mobidetect.cc',
  'https://mobidetect.pro',
  'https://mobidetect.site',
  'https://mobidetects.live',
];

let cachedBaseUrl = 'https://tv.imgcdn.kim';
let lastBaseUrlCheck = 0;
let cachedUserToken = null;
let lastTokenFetch = 0;

/**
 * Get or auto-refresh valid NetMirror User Token
 */
async function getUserToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedUserToken && now - lastTokenFetch < 3600000) {
    return cachedUserToken;
  }

  const baseUrl = await getApiBaseUrl();
  const otps = ['111111', '843381', '000000', '123456'];

  for (const otp of otps) {
    try {
      const res = await axios.get(`${baseUrl}/newtv/otp.php`, {
        headers: {
          ...HEADERS,
          'Otp': otp,
        },
        timeout: 5000,
      });

      if (res.data && res.data.status === 'ok' && res.data.usertoken) {
        cachedUserToken = res.data.usertoken;
        lastTokenFetch = now;
        console.log('[NetMirror] ✅ Generated verified User Token session.');
        return cachedUserToken;
      }
    } catch (e) {}
  }

  return cachedUserToken || 'none';
}

/**
 * Get active NetMirror API base URL
 */
async function getApiBaseUrl(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedBaseUrl && now - lastBaseUrlCheck < 600000) {
    return cachedBaseUrl;
  }

  for (const domain of DISCOVERY_DOMAINS) {
    try {
      const res = await axios.get(`${domain}/checknewtv.php`, {
        headers: HEADERS,
        timeout: 5000,
      });
      if (res.data && res.data.token_hash) {
        const decoded = Buffer.from(res.data.token_hash, 'base64').toString('utf8');
        if (decoded.startsWith('http')) {
          cachedBaseUrl = decoded;
          lastBaseUrlCheck = now;
          return cachedBaseUrl;
        }
      }
    } catch (e) {
      // Continue to next domain
    }
  }

  return cachedBaseUrl || 'https://tv.imgcdn.kim';
}

/**
 * Search movies & TV series on NetMirror
 */
async function searchContent(query) {
  const baseUrl = await getApiBaseUrl();
  const token = await getUserToken();
  const url = `${baseUrl}/newtv/search.php?s=${encodeURIComponent(query.trim())}`;
  
  const res = await axios.get(url, {
    headers: {
      ...HEADERS,
      'Ott': 'nf',
      'Usertoken': token,
    },
    timeout: 10000,
  });
  const data = res.data;

  if (!data || !data.searchResult || !Array.isArray(data.searchResult)) {
    return [];
  }

  const ott = data.ott || 'nf';
  const imgcdn = data.imgcdn || 'https://imgcdn.kim/poster/341/';

  return data.searchResult.map(item => {
    let poster = '';
    if (item.id) {
      poster = imgcdn.replace('------------------', item.id);
    }
    return {
      id: item.id,
      title: item.t,
      ott: item.ott || ott,
      poster,
    };
  });
}

/**
 * Get full metadata for a movie or TV show
 */
async function getContentDetails(id, ott = 'nf') {
  const baseUrl = await getApiBaseUrl();
  const token = await getUserToken();
  const url = `${baseUrl}/newtv/post.php?id=${id}`;

  const res = await axios.get(url, {
    headers: {
      ...HEADERS,
      'Ott': ott,
      'Usertoken': token,
    },
    timeout: 10000,
  });

  const data = res.data || {};
  let poster = data.main_poster || '';
  if (poster.includes('------------------')) {
    poster = poster.replace('------------------', id);
  }

  return {
    id: data.main_id || id,
    title: data.title || 'Unknown Title',
    year: data.year || '',
    runtime: data.runtime || '',
    rating: data.ua || '',
    quality: data.hdsd || 'HD',
    type: data.type || 'm', // 'm' = Movie, 's' = Series
    synopsis: data.desc || '',
    poster: poster,
    languages: data.lang || [{ l: 'English', s: 'eng' }, { l: 'Hindi', s: 'hin' }],
    moreDetails: data.moredetails || [],
    ott: data.ott || ott,
  };
}

/**
 * Fetch seasons and episodes for TV Series
 */
async function getEpisodes(id, ott = 'nf') {
  const baseUrl = await getApiBaseUrl();
  const token = await getUserToken();
  const url = `${baseUrl}/newtv/episodes.php?id=${id}`;

  const res = await axios.get(url, {
    headers: {
      ...HEADERS,
      'Ott': ott,
      'Usertoken': token,
    },
    timeout: 10000,
  });

  const data = res.data || {};
  return {
    episodes: Array.isArray(data.episodes) ? data.episodes : [],
    nextPage: data.nextPage || null,
    nextPageSeason: data.nextPageSeason || null,
  };
}

let cachedUserToken = null;
let lastTokenFetch = 0;

/**
 * Get or auto-refresh valid NetMirror User Token
 */
async function getUserToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedUserToken && now - lastTokenFetch < 3600000) {
    return cachedUserToken;
  }

  const baseUrl = await getApiBaseUrl();
  const otps = ['111111', '843381', '000000', '123456'];

  for (const otp of otps) {
    try {
      const res = await axios.get(`${baseUrl}/newtv/otp.php`, {
        headers: {
          ...HEADERS,
          'Otp': otp,
        },
        timeout: 5000,
      });

      if (res.data && res.data.status === 'ok' && res.data.usertoken) {
        cachedUserToken = res.data.usertoken;
        lastTokenFetch = now;
        console.log('[NetMirror] ✅ Generated verified User Token session.');
        return cachedUserToken;
      }
    } catch (e) {}
  }

  return cachedUserToken || 'none';
}

/**
 * Parse Master M3U8 Playlist and extract all streams & audio tracks
 */
async function getStreamDetails(id, ott = 'nf') {
  const baseUrl = await getApiBaseUrl();
  const token = await getUserToken();

  const playerUrl = `${baseUrl}/newtv/player.php?id=${id}`;

  const playerRes = await axios.get(playerUrl, {
    headers: {
      ...HEADERS,
      'Ott': ott,
      'Usertoken': token,
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
      ...HEADERS,
      'Referer': referer,
    },
    timeout: 10000,
  });

  const m3u8Content = m3u8Res.data;
  const lines = m3u8Content.split('\n');

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
  getApiBaseUrl,
  searchContent,
  getContentDetails,
  getEpisodes,
  getStreamDetails,
  HEADERS,
};
