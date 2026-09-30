require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  searchContent,
  getContentDetails,
  getEpisodes,
  getStreamDetails,
} = require('./netmirror');
const { downloadAndMuxVideo, cleanupFile } = require('./downloader');

const token = process.env.TELEGRAM_BOT_TOKEN || '8376422363:AAECh6Y_RfzJ5z2xUHR4ebJbtBoWTsMMCoI';
if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Prevent unhandled promise crashes
bot.on('polling_error', (error) => {
  console.error('[Telegram Polling Error]:', error.code, error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
});

// Graceful shutdown on cancellation signals
const shutdown = () => {
  console.log('🛑 Stopping bot polling gracefully...');
  bot.stopPolling().then(() => process.exit(0)).catch(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Lightweight Health Ping Server for Cloud Deployments
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('🏰 Castle APK Downloader & Cinema Bot is Running 24/7 on Cloud!');
});
server.listen(PORT, () => {
  console.log(`🌐 Health server listening on port ${PORT}`);
});

console.log('🤖 ======================================================');
console.log('🏰 CASTLE APK DOWNLOADER & CINEMA BOT RUNNING 24/7');
console.log('🤖 ======================================================');

// CDN Release URLs
const CASTLE_ADFREE_URL = 'https://github.com/PawanxumanG/Vs-Movies/releases/download/v1.0.0-castle/Castle_AdFree_v1.0.apk';
const CASTLE_ORIG_URL = 'https://github.com/PawanxumanG/Vs-Movies/releases/download/v1.0.0-castle/Castle_Original_v1.0.apk';

/**
 * Escape HTML special characters for safe Telegram messaging
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Main Home Menu Keyboard
 */
function getMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🛡️ Download Castle Ad-Free Mod (76MB)', callback_data: 'get_castle_adfree' },
      ],
      [
        { text: '📦 Download Castle Official APK (48MB)', callback_data: 'get_castle_orig' },
      ],
      [
        { text: '✨ Castle Mod Features', callback_data: 'castle_features' },
        { text: '📖 Installation Guide', callback_data: 'castle_guide' },
      ],
      [
        { text: '🔍 Search Movies & TV Series', callback_data: 'search_prompt' },
      ],
    ],
  };
}

// /start & /help Command
bot.onText(/\/start|\/help|\/apk/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Friend';

  const welcomeText = 
    `🏰 <b>Welcome to Castle APK Hub, ${escapeHtml(firstName)}!</b>\n\n` +
    `⚡ <b>Download Castle APK with High-Speed Direct Cloud CDN:</b>\n` +
    `• 🚫 <b>Castle Ad-Free Mod</b> (Zero 30s Ads, No Video Ads, VIP Unlocked)\n` +
    `• 📦 <b>Castle Official Untouched APK</b> (Original Release)\n` +
    `• 🎬 <b>Unlimited HD Movies & Series Downloader</b>\n\n` +
    `👇 <b>Choose an option below to get started:</b>`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(),
  });
});

// Search handler for text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/apk')) return;

  const query = text.startsWith('/search') ? text.replace('/search', '').trim() : text.trim();
  if (!query) {
    return bot.sendMessage(chatId, '⚠️ Please provide a movie or series name to search.');
  }

  let loadingMsg;
  try {
    loadingMsg = await bot.sendMessage(chatId, `🔍 Searching media database for <b>"${escapeHtml(query)}"</b>...`, { parse_mode: 'HTML' });
  } catch (e) {}

  try {
    const results = await searchContent(query);

    if (loadingMsg) {
      try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
    }

    if (!results || results.length === 0) {
      return bot.sendMessage(
        chatId,
        `❌ No results found for <b>"${escapeHtml(query)}"</b>\n\n` +
        `💡 <i>Tip: Search with simplified keywords (e.g. <code>The Batman</code>, <code>Money Heist</code>, <code>Mirzapur</code>) or download the Castle APK below to watch everything live!</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛡️ Download Castle Ad-Free APK', callback_data: 'get_castle_adfree' }],
            ],
          },
        }
      );
    }

    // Render list of results with inline buttons
    const keyboard = results.slice(0, 8).map((item) => ([
      {
        text: `🎬 ${item.title}`,
        callback_data: `view_${item.id}_${item.ott || 'nf'}`,
      },
    ]));

    bot.sendMessage(chatId, `🍿 <b>Found ${results.length} results for "${escapeHtml(query)}":</b>\n<i>Click a title below to view details & downloads:</i>`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (err) {
    console.error('[Search Error]:', err.message);
    bot.sendMessage(chatId, `⚠️ Search failed: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
});

// Handle Inline Keyboard Callback Queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    // 1. Download Castle Ad-Free Mod APK
    if (data === 'get_castle_adfree') {
      bot.answerCallbackQuery(query.id, { text: 'Fetching Castle Ad-Free APK...' }).catch(() => {});

      const adFreeText =
        `🛡️ <b>Castle APK (Ad-Free Modded Edition)</b>\n\n` +
        `✅ <b>Mod Features:</b>\n` +
        `• 🚫 <b>Zero Ads:</b> All 30-second pre-roll & banner ads removed\n` +
        `• ⚡ <b>VIP Unlocked:</b> High-speed streaming server enabled\n` +
        `• 📺 <b>Full HD & 4K:</b> 1080p/720p/480p streaming & downloads\n` +
        `• 📱 <b>Android & TV Support:</b> Works on phones, tablets, FireStick, Android TV\n` +
        `• 📦 <b>File Size:</b> 76.8 MB\n\n` +
        `📥 <b>High-Speed Cloud Download Link (10 Gbps):</b>\n` +
        `<a href="${CASTLE_ADFREE_URL}">👉 Click Here to Download Castle Ad-Free APK</a>\n\n` +
        `🔗 <b>Direct Mirror Link:</b>\n<code>${CASTLE_ADFREE_URL}</code>`;

      const buttons = [
        [{ text: '⚡ Direct Download (1-Tap)', url: CASTLE_ADFREE_URL }],
        [{ text: '📖 How to Install Guide', callback_data: 'castle_guide' }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
      ];

      bot.sendMessage(chatId, adFreeText, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 2. Download Castle Official / Original APK
    else if (data === 'get_castle_orig') {
      bot.answerCallbackQuery(query.id, { text: 'Preparing Original APK...' }).catch(() => {});

      const origText =
        `📦 <b>Castle APK (Official Untouched Release)</b>\n\n` +
        `• 🏷️ <b>Version:</b> Latest v1.0\n` +
        `• 📦 <b>File Size:</b> 48.2 MB\n` +
        `• 🔒 <b>Status:</b> 100% Original, Clean Signature\n\n` +
        `📥 <b>High-Speed Cloud Download Link:</b>\n` +
        `<a href="${CASTLE_ORIG_URL}">👉 Click Here to Download Castle Official APK</a>\n\n` +
        `🔗 <b>Direct Link:</b>\n<code>${CASTLE_ORIG_URL}</code>`;

      const buttons = [
        [{ text: '⚡ Download Official APK (48MB)', url: CASTLE_ORIG_URL }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
      ];

      bot.sendMessage(chatId, origText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 3. Castle Mod Features
    else if (data === 'castle_features') {
      bot.answerCallbackQuery(query.id).catch(() => {});

      const featText =
        `✨ <b>Castle APK Modded Features Overview:</b>\n\n` +
        `1️⃣ <b>Zero Advertisements:</b> No popup ads, no 30s unskippable video ads before playback.\n` +
        `2️⃣ <b>Multi-Language Audio:</b> Hindi, English, Tamil, Telugu, Kannada, Malayalam dual audio tracks.\n` +
        `3️⃣ <b>Built-in Video Downloader:</b> Download movies to phone storage for offline viewing.\n` +
        `4️⃣ <b>Casting & Android TV:</b> Supports Chromecast and TV box remotes.\n` +
        `5️⃣ <b>Auto Subtitles:</b> Multi-language SRT subtitles supported.\n\n` +
        `Ready to install? Grab your copy below!`;

      bot.sendMessage(chatId, featText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡️ Download Ad-Free APK (76MB)', callback_data: 'get_castle_adfree' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
          ],
        },
      });
    }

    // 4. Installation Guide
    else if (data === 'castle_guide') {
      bot.answerCallbackQuery(query.id).catch(() => {});

      const guideText =
        `📖 <b>How to Install Castle APK on Android:</b>\n\n` +
        `1️⃣ Click the <b>Direct Download Link</b> to download the <code>.apk</code> file.\n` +
        `2️⃣ Open your phone's <b>Downloads</b> or File Manager.\n` +
        `3️⃣ Tap on the downloaded <code>Castle_AdFree_v1.0.apk</code> file.\n` +
        `4️⃣ If prompted with <i>"Install Unknown Apps"</i>, enable permission for your browser or file manager.\n` +
        `5️⃣ Tap <b>Install</b> and open the app to enjoy unlimited movies & shows! 🎉\n\n` +
        `💡 <i>Tip: If Google Play Protect shows a prompt, tap "More Details" -> "Install Anyway".</i>`;

      bot.sendMessage(chatId, guideText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡️ Download Ad-Free APK (76MB)', callback_data: 'get_castle_adfree' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
          ],
        },
      });
    }

    // 5. Back to Main Menu
    else if (data === 'main_menu') {
      bot.answerCallbackQuery(query.id).catch(() => {});
      bot.sendMessage(chatId, `🏰 <b>Castle APK Downloader & Cinema Menu:</b>`, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard(),
      });
    }

    // 6. Search Prompt
    else if (data === 'search_prompt') {
      bot.answerCallbackQuery(query.id).catch(() => {});
      bot.sendMessage(
        chatId,
        `🔍 <b>Movie & Series Search:</b>\n\n` +
        `Simply type any title in the chat (e.g. <code>The Batman</code>, <code>Money Heist</code>, <code>Stranger Things</code>, <code>Mirzapur</code>) to search!`,
        { parse_mode: 'HTML' }
      );
    }

    // 7. View Movie/Show Details
    else if (data.startsWith('view_')) {
      const parts = data.split('_');
      const id = parts[1];
      const ott = parts[2] || 'nf';

      bot.answerCallbackQuery(query.id, { text: 'Loading details...' }).catch(() => {});
      const details = await getContentDetails(id, ott);

      let caption = `🎬 <b>${escapeHtml(details.title)}</b> ${details.year ? `(${escapeHtml(details.year)})` : ''}\n\n`;
      if (details.runtime) caption += `⏱️ <b>Runtime:</b> ${escapeHtml(details.runtime)}\n`;
      if (details.quality) caption += `📺 <b>Quality:</b> ${escapeHtml(details.quality)}\n`;
      if (details.rating) caption += `🔞 <b>Rating:</b> ${escapeHtml(details.rating)}\n`;
      
      const langNames = details.languages.map(l => l.l).join(', ');
      if (langNames) caption += `🗣️ <b>Audio:</b> ${escapeHtml(langNames)}\n`;

      if (details.synopsis) {
        const cleanSynopsis = details.synopsis.length > 300 ? details.synopsis.substring(0, 300) + '...' : details.synopsis;
        caption += `\n📝 <b>Plot:</b> <i>${escapeHtml(cleanSynopsis)}</i>\n`;
      }

      const buttons = [];

      if (details.type === 's') {
        buttons.push([{ text: '📺 Browse Episodes & Seasons', callback_data: `eps_${id}_${ott}` }]);
      } else {
        buttons.push([
          { text: '📥 Send as Telegram Video File', callback_data: `pickaudio_${id}_${ott}` },
        ]);
        buttons.push([
          { text: '⚡ Direct Download Links (1080p/720p)', callback_data: `getlinks_${id}_${ott}` },
        ]);
      }
      buttons.push([
        { text: '🛡️ Watch in Castle Ad-Free App', callback_data: 'get_castle_adfree' },
      ]);

      if (details.poster && details.poster.startsWith('http')) {
        try {
          await bot.sendPhoto(chatId, details.poster, {
            caption,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          });
          return;
        } catch (imgErr) {}
      }

      await bot.sendMessage(chatId, caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 8. Browse Episodes
    else if (data.startsWith('eps_')) {
      const [, id, ott] = data.split('_');
      bot.answerCallbackQuery(query.id, { text: 'Loading episodes...' }).catch(() => {});

      const epData = await getEpisodes(id, ott);
      if (!epData.episodes || epData.episodes.length === 0) {
        return bot.sendMessage(chatId, '⚠️ No episodes found for this series.');
      }

      const buttons = epData.episodes.slice(0, 15).map((ep, idx) => ([
        {
          text: `▶️ Ep ${idx + 1}: ${ep.t || `Episode ${idx + 1}`}`,
          callback_data: `viewep_${ep.id}_${ott}`,
        },
      ]));

      bot.sendMessage(chatId, `📺 <b>Select an Episode to watch/download:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 9. View Single Episode Stream Options
    else if (data.startsWith('viewep_')) {
      const [, id, ott] = data.split('_');
      bot.answerCallbackQuery(query.id).catch(() => {});

      const buttons = [
        [{ text: '📥 Send as Telegram Video File', callback_data: `pickaudio_${id}_${ott}` }],
        [{ text: '⚡ Direct Download Links', callback_data: `getlinks_${id}_${ott}` }],
      ];

      bot.sendMessage(chatId, `🎬 <b>Episode Selected</b>\nChoose your download option:`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 10. Show Fast Download Links
    else if (data.startsWith('getlinks_')) {
      const [, id, ott] = data.split('_');
      bot.answerCallbackQuery(query.id, { text: 'Extracting stream links...' }).catch(() => {});

      const stream = await getStreamDetails(id, ott);

      let msgText = `⚡ <b>Direct Download & Stream Links for ${escapeHtml(stream.title)}:</b>\n\n`;
      msgText += `🎬 <b>Master Playlist (VLC / MX Player):</b>\n<code>${escapeHtml(stream.masterUrl)}</code>\n\n`;

      if (stream.videoQualities && stream.videoQualities.length > 0) {
        msgText += `📺 <b>Quality Streams:</b>\n`;
        stream.videoQualities.forEach((q) => {
          msgText += `• <b>${escapeHtml(q.label)}</b> (${escapeHtml(q.resolution)}):\n<code>${escapeHtml(q.uri)}</code>\n\n`;
        });
      }

      if (stream.audioTracks && stream.audioTracks.length > 0) {
        msgText += `🗣️ <b>Available Audio Tracks:</b>\n`;
        stream.audioTracks.forEach((a) => {
          msgText += `• ${escapeHtml(a.name)}\n`;
        });
      }

      bot.sendMessage(chatId, msgText, { parse_mode: 'HTML' });
    }

    // 11. Pick Audio Track before Telegram Video Upload
    else if (data.startsWith('pickaudio_')) {
      const [, id, ott] = data.split('_');
      bot.answerCallbackQuery(query.id, { text: 'Checking audio tracks...' }).catch(() => {});

      const stream = await getStreamDetails(id, ott);
      const audioButtons = stream.audioTracks.map((audio, idx) => ([
        {
          text: `🔊 ${audio.name || 'Default Audio'}`,
          callback_data: `dl_${id}_${ott}_${idx}_720p`,
        },
      ]));

      bot.sendMessage(chatId, `🗣️ <b>Choose Audio Language to include in your video:</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: audioButtons },
      });
    }

    // 12. Download & Upload Video directly to Telegram
    else if (data.startsWith('dl_')) {
      const [, id, ott, audioIdxStr, quality] = data.split('_');
      const audioIdx = parseInt(audioIdxStr, 10) || 0;

      bot.answerCallbackQuery(query.id, { text: 'Starting download process...' }).catch(() => {});

      const statusMsg = await bot.sendMessage(chatId, `⏳ <b>Initializing stream extraction...</b>`, { parse_mode: 'HTML' });

      const stream = await getStreamDetails(id, ott);
      const chosenAudio = stream.audioTracks[audioIdx] || stream.audioTracks[0];

      let videoStream = stream.videoQualities.find(q => q.label === quality) || stream.videoQualities[0] || { uri: stream.masterUrl };

      let lastPercent = 0;
      let lastUpdate = Date.now();

      await bot.editMessageText(
        `📥 <b>Downloading & Processing Video:</b>\n` +
        `• Title: <b>${escapeHtml(stream.title)}</b>\n` +
        `• Audio: <b>${escapeHtml(chosenAudio ? chosenAudio.name : 'Default')}</b>\n` +
        `• Progress: <b>0%</b> ⏳`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML',
        }
      ).catch(() => {});

      const filePath = await downloadAndMuxVideo({
        videoUrl: videoStream.uri,
        audioUrl: chosenAudio ? chosenAudio.uri : null,
        referer: stream.referer,
        title: stream.title,
        onProgress: async (percent) => {
          const now = Date.now();
          if (percent > lastPercent + 10 && now - lastUpdate > 3000) {
            lastPercent = percent;
            lastUpdate = now;
            try {
              await bot.editMessageText(
                `📥 <b>Downloading & Processing Video:</b>\n` +
                `• Title: <b>${escapeHtml(stream.title)}</b>\n` +
                `• Audio: <b>${escapeHtml(chosenAudio ? chosenAudio.name : 'Default')}</b>\n` +
                `• Progress: <b>${percent}%</b> ⏳`,
                {
                  chat_id: chatId,
                  message_id: statusMsg.message_id,
                  parse_mode: 'HTML',
                }
              );
            } catch (e) {}
          }
        },
      });

      await bot.editMessageText(`📤 <b>Uploading video file to Telegram...</b> 🚀`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML',
      }).catch(() => {});

      const stats = fs.statSync(filePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);

      try {
        await bot.sendVideo(
          chatId,
          filePath,
          {
            caption: `🍿 <b>${escapeHtml(stream.title)}</b>\n🗣️ <b>Audio:</b> ${escapeHtml(chosenAudio ? chosenAudio.name : 'Default')}\n📦 <b>Size:</b> ${fileSizeMB} MB\n\nEnjoy your movie! 🎉`,
            parse_mode: 'HTML',
            supports_streaming: true,
          },
          { filename: `${stream.title || 'Movie'}.mp4` }
        );
        try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch (e) {}
      } catch (uploadErr) {
        console.error('[Upload Error]:', uploadErr.message);
        await bot.editMessageText(
          `⚠️ <b>File size (${fileSizeMB} MB) exceeds Telegram's bot upload limit (50 MB).</b>\n\n` +
          `⚡ <b>Use Direct Fast Stream/Download Link:</b>\n` +
          `<code>${escapeHtml(videoStream.uri)}</code>\n\n` +
          `💡 <i>Tip: Paste this link into VLC Media Player, MX Player, or download Castle APK for ad-free playback!</i>`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'HTML',
          }
        ).catch(() => {});
      }

      cleanupFile(filePath);
    }
  } catch (err) {
    console.error('[Callback Error]:', err.message);
    bot.sendMessage(chatId, `⚠️ Error: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
});
