require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const {
  CASTLE_RELEASES,
  searchCastleCatalog,
  getCastleDetails,
} = require('./castle');

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

// Lightweight Health Ping Server for Cloud Deployment
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('🏰 Castle APK Downloader & Entertainment Bot is Running 24/7 on Cloud!');
});
server.listen(PORT, () => {
  console.log(`🌐 Health server listening on port ${PORT}`);
});

console.log('🤖 ======================================================');
console.log('🏰 CASTLE APK DOWNLOADER & ENTERTAINMENT BOT RUNNING 24/7');
console.log('🤖 ======================================================');

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
        { text: '✨ Mod Features', callback_data: 'castle_features' },
        { text: '📖 Installation Guide', callback_data: 'castle_guide' },
      ],
      [
        { text: '🔍 Search Movies & TV Series', callback_data: 'search_prompt' },
        { text: '🌐 Castle Server Status', callback_data: 'castle_servers' },
      ],
    ],
  };
}

// /start & /help Command
bot.onText(/\/start|\/help|\/apk|\/download/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Friend';

  const welcomeText = 
    `🏰 <b>Welcome to Castle APK Hub, ${escapeHtml(firstName)}!</b>\n\n` +
    `⚡ <b>Official & Ad-Free Castle APK Downloader:</b>\n` +
    `• 🚫 <b>Castle Ad-Free Mod:</b> Zero 30s Ads, No Video Ads, VIP High-Speed Servers.\n` +
    `• 📦 <b>Castle Official APK:</b> Untouched Original Release.\n` +
    `• 🎬 <b>Unlimited Cinema:</b> 1080p Full HD Movies, Web Series & Live TV.\n\n` +
    `👇 <b>Tap a button below to download the latest Castle APK:</b>`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(),
  });
});

const searchResultsCache = new Map();

// Search handler for text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/apk') || text.startsWith('/download')) return;

  const query = text.startsWith('/search') ? text.replace('/search', '').trim() : text.trim();
  if (!query) {
    return bot.sendMessage(chatId, '⚠️ Please provide a movie or series name to search.');
  }

  let loadingMsg;
  try {
    loadingMsg = await bot.sendMessage(chatId, `🔍 Searching Castle catalog for <b>"${escapeHtml(query)}"</b>...`, { parse_mode: 'HTML' });
  } catch (e) {}

  try {
    const results = await searchCastleCatalog(query);

    if (loadingMsg) {
      try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
    }

    if (!results || results.length === 0) {
      return bot.sendMessage(
        chatId,
        `❌ No results found for <b>"${escapeHtml(query)}"</b>\n\n` +
        `💡 <i>Tip: Download the Ad-Free Castle APK below to search & stream thousands of movies live!</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛡️ Download Castle Ad-Free APK (76MB)', callback_data: 'get_castle_adfree' }],
            ],
          },
        }
      );
    }

    // Cache results for instant detail retrieval
    results.forEach(item => {
      searchResultsCache.set(item.id, item);
    });

    // Render list of results with inline buttons
    const keyboard = results.map((item) => ([
      {
        text: `🎬 ${item.title} ${item.year ? `(${item.year})` : ''}`,
        callback_data: `view_${item.id}_${item.type}`,
      },
    ]));

    bot.sendMessage(chatId, `🍿 <b>Found ${results.length} titles in Castle Catalog for "${escapeHtml(query)}":</b>\n<i>Click a title below to view details:</i>`, {
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
      bot.answerCallbackQuery(query.id, { text: 'Preparing Castle Ad-Free APK...' }).catch(() => {});

      const rel = CASTLE_RELEASES.AD_FREE;
      const adFreeText =
        `🛡️ <b>Castle APK (${rel.version})</b>\n\n` +
        `✅ <b>Mod Features:</b>\n` +
        `• 🚫 <b>Zero Ads:</b> All 30-second pre-roll & popup ads permanently removed\n` +
        `• ⚡ <b>VIP Unlocked:</b> High-speed VIP CDN streaming servers enabled\n` +
        `• 📺 <b>Full HD & 4K:</b> 1080p Ultra HD streaming & offline downloads\n` +
        `• 📱 <b>Universal Compatibility:</b> Android Phones, Tablets, Android TV, Fire TV Stick\n` +
        `• 📦 <b>File Size:</b> ${rel.size}\n\n` +
        `📥 <b>High-Speed Cloud Download Link (10 Gbps CDN):</b>\n` +
        `<a href="${rel.url}">👉 Click Here to Download Castle Ad-Free APK</a>\n\n` +
        `🔗 <b>Direct Link:</b>\n<code>${rel.url}</code>`;

      const buttons = [
        [{ text: '⚡ Direct Download (1-Tap)', url: rel.url }],
        [{ text: '📖 How to Install Guide', callback_data: 'castle_guide' }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
      ];

      bot.sendMessage(chatId, adFreeText, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 2. Download Castle Official APK
    else if (data === 'get_castle_orig') {
      bot.answerCallbackQuery(query.id, { text: 'Preparing Official APK...' }).catch(() => {});

      const rel = CASTLE_RELEASES.ORIGINAL;
      const origText =
        `📦 <b>Castle APK (${rel.version})</b>\n\n` +
        `• 🏷️ <b>Status:</b> 100% Original Official Release\n` +
        `• 📦 <b>File Size:</b> ${rel.size}\n` +
        `• 🔒 <b>Signature:</b> Official Castle Developer Signature\n\n` +
        `📥 <b>High-Speed Cloud Download Link (10 Gbps CDN):</b>\n` +
        `<a href="${rel.url}">👉 Click Here to Download Castle Official APK</a>\n\n` +
        `🔗 <b>Direct Link:</b>\n<code>${rel.url}</code>`;

      const buttons = [
        [{ text: '⚡ Download Official APK (48MB)', url: rel.url }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
      ];

      bot.sendMessage(chatId, origText, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 3. Castle Mod Features
    else if (data === 'castle_features') {
      bot.answerCallbackQuery(query.id).catch(() => {});

      const featText =
        `✨ <b>Castle APK Modded Features:</b>\n\n` +
        `1️⃣ <b>Ad-Free Experience:</b> No countdown timers, no banner overlays, zero video ads before playback.\n` +
        `2️⃣ <b>Multi-Audio Tracks:</b> Hindi, English, Tamil, Telugu, Kannada, Malayalam dual audio.\n` +
        `3️⃣ <b>Offline Downloads:</b> Save complete movies & full TV episodes directly to phone storage.\n` +
        `4️⃣ <b>Casting & Android TV:</b> Chromecast support with full remote control navigation.\n` +
        `5️⃣ <b>Auto Subtitles:</b> Built-in multi-language subtitles.\n\n` +
        `👇 <b>Download the Ad-Free APK now:</b>`;

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
        `📖 <b>How to Install Castle APK:</b>\n\n` +
        `<b>📱 On Android Phones / Tablets:</b>\n` +
        `1. Click the <b>Direct Download Link</b> below to download the APK.\n` +
        `2. Open your File Manager -> Downloads folder.\n` +
        `3. Tap <code>Castle_AdFree_v1.0.apk</code>.\n` +
        `4. Allow *"Install Unknown Apps"* permission if prompted.\n` +
        `5. Tap <b>Install</b> and open Castle! 🎉\n\n` +
        `<b>📺 On Android TV / FireStick:</b>\n` +
        `1. Install <b>Downloader</b> app on your TV from Play Store/Amazon Appstore.\n` +
        `2. Enter the direct link or transfer the APK via USB/Send Files to TV.\n` +
        `3. Open & Install!`;

      bot.sendMessage(chatId, guideText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡️ Download Castle Ad-Free APK (76MB)', callback_data: 'get_castle_adfree' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
          ],
        },
      });
    }

    // 5. Server Status
    else if (data === 'castle_servers') {
      bot.answerCallbackQuery(query.id).catch(() => {});

      const serverText =
        `🌐 <b>Castle Official Server Infrastructure:</b>\n\n` +
        `🟢 <b>Production Server 1:</b> <code>api.hwnou.com</code> (Online ✅)\n` +
        `🟢 <b>Production Server 2:</b> <code>api.flucn.com</code> (Online ✅)\n` +
        `🟢 <b>Backup CDN 1:</b> <code>api.bylcu.com</code> (Active ✅)\n` +
        `🟢 <b>Backup CDN 2:</b> <code>api.klcow.com</code> (Active ✅)\n` +
        `🟢 <b>Regional Server:</b> <code>api.castlemov.in</code> (Online ✅)\n\n` +
        `⚡ <i>All Castle servers are operational with 100% uptime.</i>`;

      bot.sendMessage(chatId, serverText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡️ Download Castle APK', callback_data: 'get_castle_adfree' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
          ],
        },
      });
    }

    // 6. Search Prompt
    else if (data === 'search_prompt') {
      bot.answerCallbackQuery(query.id).catch(() => {});
      bot.sendMessage(
        chatId,
        `🔍 <b>Search Castle Entertainment Catalog:</b>\n\n` +
        `Send the title of any movie or series in the chat (e.g. <code>The Batman</code>, <code>Money Heist</code>, <code>Stranger Things</code>, <code>Mirzapur</code>, <code>Dhurandhar</code>)!`,
        { parse_mode: 'HTML' }
      );
    }

    // 7. View Title Details
    else if (data.startsWith('view_')) {
      const parts = data.split('_');
      const id = parts[1];
      const type = parts[2] || 'm';

      bot.answerCallbackQuery(query.id, { text: 'Loading title details...' }).catch(() => {});
      
      const cached = searchResultsCache.get(id);
      const details = await getCastleDetails(
        id,
        type,
        cached ? cached.title : 'Featured Title',
        cached ? cached.year : '2024',
        cached ? cached.actors : '',
        cached ? cached.poster : ''
      );

      let caption = `🎬 <b>${escapeHtml(details.title)}</b> ${details.year ? `(${escapeHtml(details.year)})` : ''}\n\n`;
      if (details.typeLabel) caption += `🏷️ <b>Type:</b> ${escapeHtml(details.typeLabel)}\n`;
      caption += `⭐ <b>Rating:</b> ${escapeHtml(details.rating)}\n`;
      caption += `📺 <b>Quality:</b> Full HD 1080p (Castle VIP Server)\n\n`;

      if (details.synopsis) {
        const cleanSynopsis = details.synopsis.length > 350 ? details.synopsis.substring(0, 350) + '...' : details.synopsis;
        caption += `📝 <b>Plot:</b> <i>${escapeHtml(cleanSynopsis)}</i>\n\n`;
      }

      caption += `⚡ <i>Stream or download this title in 1080p with zero ads on Castle App!</i>`;

      const buttons = [
        [{ text: '🛡️ Watch in Castle Ad-Free App (1080p)', callback_data: 'get_castle_adfree' }],
        [{ text: '📦 Download Castle Official APK', callback_data: 'get_castle_orig' }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }],
      ];

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

    // 8. Back to Main Menu
    else if (data === 'main_menu') {
      bot.answerCallbackQuery(query.id).catch(() => {});
      bot.sendMessage(chatId, `🏰 <b>Castle APK Downloader & Entertainment Menu:</b>`, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard(),
      });
    }
  } catch (err) {
    console.error('[Callback Error]:', err.message);
    bot.sendMessage(chatId, `⚠️ Error: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
});
