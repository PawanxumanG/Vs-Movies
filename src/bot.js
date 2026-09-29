require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const {
  searchContent,
  getContentDetails,
  getEpisodes,
  getStreamDetails,
} = require('./netmirror');
const { downloadAndMuxVideo, cleanupFile } = require('./downloader');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in .env!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Prevent unhandled promise crashes on Telegram API errors
bot.on('polling_error', (error) => {
  console.error('[Telegram Polling Error]:', error.code, error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
});

console.log('🤖 ======================================================');
console.log('🚀 NETMIRROR MOVIE & SERIES TELEGRAM BOT RUNNING');
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

// /start & /help Command
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Movie Lover';

  const welcomeText = 
    `🎬 <b>Welcome to NetMirror Cinema Bot, ${escapeHtml(firstName)}!</b>\n\n` +
    `🍿 <b>How to use:</b>\n` +
    `• Simply send the name of any <b>Movie</b> or <b>Web Series</b> (e.g. <code>The Batman</code>, <code>Stranger Things</code>, <code>Mirzapur</code>)\n` +
    `• Or use <code>/search &lt;name&gt;</code>\n\n` +
    `⚡ <b>Features:</b>\n` +
    `• 📥 <b>Direct Telegram Video File Upload</b>\n` +
    `• ⚡ <b>High-Speed 1080p/720p/480p Download Links</b>\n` +
    `• 🇮🇳 <b>Dual Audio Selector</b> (Hindi / English / Tamil)\n` +
    `• 📺 <b>Full Episode & Season Browser</b>\n\n` +
    `🔍 <i>Try typing a movie name now!</i>`;

  bot.sendMessage(chatId, welcomeText, { parse_mode: 'HTML' });
});

// Search handler for any text message
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/start') || text.startsWith('/help')) return;

  const query = text.startsWith('/search') ? text.replace('/search', '').trim() : text.trim();
  if (!query) {
    return bot.sendMessage(chatId, '⚠️ Please provide a movie or series name to search.');
  }

  let loadingMsg;
  try {
    loadingMsg = await bot.sendMessage(chatId, `🔍 Searching NetMirror for <b>"${escapeHtml(query)}"</b>...`, { parse_mode: 'HTML' });
  } catch (e) {}

  try {
    const results = await searchContent(query);

    if (loadingMsg) {
      try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
    }

    if (!results || results.length === 0) {
      return bot.sendMessage(chatId, `❌ No results found for <b>"${escapeHtml(query)}"</b>\n\n💡 <i>Tip: Try searching with the exact English title or simpler keywords.</i>`, { parse_mode: 'HTML' });
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
    // 1. View Movie/Show Details
    if (data.startsWith('view_')) {
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
        // TV Series -> Show Episodes button
        buttons.push([{ text: '📺 Browse Episodes & Seasons', callback_data: `eps_${id}_${ott}` }]);
      } else {
        // Movie -> Direct download & stream options
        buttons.push([
          { text: '📥 Send as Telegram Video File', callback_data: `pickaudio_${id}_${ott}` },
        ]);
        buttons.push([
          { text: '⚡ Direct Download Links (1080p/720p)', callback_data: `getlinks_${id}_${ott}` },
        ]);
      }

      // If poster exists, send photo, else send text
      if (details.poster && details.poster.startsWith('http')) {
        try {
          await bot.sendPhoto(chatId, details.poster, {
            caption,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          });
          return;
        } catch (imgErr) {
          // Fallback to text
        }
      }

      await bot.sendMessage(chatId, caption, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // 2. Browse Episodes (for TV series)
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

    // 3. View Single Episode Stream Options
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

    // 4. Show Instant Fast Download Links
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

    // 5. Pick Audio Track before Telegram Video Upload
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

    // 6. Download & Upload Video directly to Telegram!
    else if (data.startsWith('dl_')) {
      const [, id, ott, audioIdxStr, quality] = data.split('_');
      const audioIdx = parseInt(audioIdxStr, 10) || 0;

      bot.answerCallbackQuery(query.id, { text: 'Starting download process...' }).catch(() => {});

      const statusMsg = await bot.sendMessage(chatId, `⏳ <b>Initializing stream extraction...</b>`, { parse_mode: 'HTML' });

      const stream = await getStreamDetails(id, ott);
      const chosenAudio = stream.audioTracks[audioIdx] || stream.audioTracks[0];

      // Pick video quality stream (default 720p or highest available)
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

      // Trigger FFmpeg download & muxing
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

      // Uploading to Telegram
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
        // If file is > 50MB (standard Telegram bot limit)
        await bot.editMessageText(
          `⚠️ <b>File size (${fileSizeMB} MB) exceeds Telegram's direct upload limit (50 MB).</b>\n\n` +
          `⚡ <b>Use Direct Fast Stream/Download Link:</b>\n` +
          `<code>${escapeHtml(videoStream.uri)}</code>\n\n` +
          `💡 <i>Tip: Paste this link into VLC Media Player, MX Player, or 1DM Downloader for high-speed download!</i>`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'HTML',
          }
        ).catch(() => {});
      }

      // Cleanup local temp file
      cleanupFile(filePath);
    }
  } catch (err) {
    console.error('[Callback Error]:', err.message);
    bot.sendMessage(chatId, `⚠️ Error: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
});
