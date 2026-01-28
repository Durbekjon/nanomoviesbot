import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Bot,
  Context,
  InlineKeyboard,
  InputFile,
  GrammyError,
  HttpError,
} from 'grammy';
import { UsersService } from '../users/users.service';

import { RedisService } from '../redis/redis.service';
import { MoviesService } from '../movies/movies.service';
import { FeedbackService } from '../feedback/feedback.service';
import { ChannelsService } from '../channels/channels.service';
import { MovieRequestsService } from '../movie-requests/movie-requests.service';
import { Channel, Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { MESSAGES } from './messages';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly bot: Bot<Context>;
  private readonly logger = new Logger(BotService.name);
  private superAdminIds: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly moviesService: MoviesService,
    private readonly redisService: RedisService,
    private readonly feedbackService: FeedbackService,
    private readonly channelsService: ChannelsService,
    private readonly movieRequestsService: MovieRequestsService,
  ) {
    const token = this.configService.get<string>('BOT_TOKEN');
    if (!token) {
      throw new Error('BOT_TOKEN environment variable is not defined');
    }
    this.bot = new Bot(token);

    const adminIdsStr = this.configService.get<string>('SUPERADMIN_IDS') || '';
    this.superAdminIds = adminIdsStr.split(',').map((id) => id.trim());
  }

  async onModuleInit() {
    this.logger.log('Initializing Bot...');

    // Middleware: Channel Subscription Guard
    this.bot.on('inline_query', async (ctx) => {
      const query = ctx.inlineQuery.query;
      const movies = await this.moviesService.findByTitle(query);

      const results = movies.map((m) => ({
        type: 'video',
        id: `movie_${m.id}`,
        video_file_id: m.fileId,
        title: m.title,
        caption: MESSAGES.movie_caption_with_code(m.title, m.code),
        description: `Code: ${m.code}`,
        reply_markup: new InlineKeyboard().url(
          'Watch in Bot',
          `https://t.me/${ctx.me.username}?start=movie_${m.code}`,
        ),
      }));

      await ctx.answerInlineQuery(results as any, {
        cache_time: 300,
      });
    });

    this.bot.catch((err) => {
      const ctx = err.ctx;
      this.logger.error(`Error while handling update ${ctx.update.update_id}:`);
      const e = err.error;
      if (e instanceof GrammyError) {
        this.logger.error(`Error in request: ${e.description}`);
      } else if (e instanceof HttpError) {
        this.logger.error(`Could not contact Telegram: ${e}`);
      } else {
        this.logger.error(`Unknown error: ${e}`);
      }
    });

    this.bot.hears(/^\/fulfill_(\d+)$/, async (ctx) => {
      const id = parseInt(ctx.match[1]);
      const request = await this.movieRequestsService.updateStatus(
        id,
        'FULFILLED',
      );
      await ctx.reply(`✅ Request for "${request.title}" marked as FULFILLED.`);
      try {
        await this.bot.api.sendMessage(
          request.userId.toString(),
          `✅ Xushxabar! Siz so'ragan "${request.title}" filmi botga qo'shildi! Uni qidiruv orqali topishingiz mumkin.`,
        );
      } catch (e) {}
    });

    this.bot.hears(/^\/reject_(\d+)$/, async (ctx) => {
      const id = parseInt(ctx.match[1]);
      const request = await this.movieRequestsService.updateStatus(
        id,
        'REJECTED',
      );
      await ctx.reply(`❌ Request for "${request.title}" marked as REJECTED.`);
    });

    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return next();

      // Allow specific updates to pass through (like callbacks for check, or if user is admin)
      if (this.superAdminIds.includes(ctx.from.id.toString())) return next();

      // Also check DB role
      const user = await this.usersService.findById(ctx.from.id);
      if (user && (user.role === Role.ADMIN || user.role === Role.SUPERADMIN))
        return next();

      // Check subscription
      const channels = await this.channelsService.findAll();
      const notSubscribed: Channel[] = [];

      for (const channel of channels) {
        try {
          const member = await ctx.api.getChatMember(
            Number(channel.channelId),
            ctx.from.id,
          );
          if (member.status === 'left' || member.status === 'kicked') {
            notSubscribed.push(channel);
          }
        } catch (e) {
          // If bot is not admin in channel or channel is invalid, ignore for now to avoid locking users out
          // or log it.
        }
      }

      if (notSubscribed.length > 0) {
        const keyboard = new InlineKeyboard();
        notSubscribed.forEach((ch) => {
          keyboard.url(ch.title, ch.inviteLink).row();
        });
        keyboard.text(MESSAGES.check_subscription_btn, 'check_subscription');

        if (
          ctx.callbackQuery &&
          ctx.callbackQuery.data === 'check_subscription'
        ) {
          await ctx.answerCallbackQuery({
            text: MESSAGES.not_subscribed_all,
            show_alert: true,
          });
          return;
        }

        if (ctx.message || ctx.callbackQuery) {
          if (ctx.message) {
            await ctx.reply(MESSAGES.must_subscribe, {
              reply_markup: keyboard,
            });
          } else if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({
              text: MESSAGES.subscribe_first,
              show_alert: true,
            });
            await ctx.reply(MESSAGES.must_subscribe, {
              reply_markup: keyboard,
            });
          }
        }
        return; // Stop propagation
      }

      if (
        ctx.callbackQuery &&
        ctx.callbackQuery.data === 'check_subscription'
      ) {
        await ctx.answerCallbackQuery({ text: MESSAGES.access_granted });
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(MESSAGES.welcome_back);
        return;
      }

      await next();
    });

    // Command: Start
    this.bot.command('start', async (ctx) => {
      const { id, first_name, username } = ctx.from!;
      const referralPayload = ctx.match;

      let referralSource: string | undefined = undefined;
      if (typeof referralPayload === 'string' && referralPayload.length > 0) {
        referralSource = referralPayload;
      }

      const user = await this.usersService.createOrUpdate({
        id: BigInt(id),
        firstName: first_name,
        username: username,
        referralSource: referralSource,
      });

      await this.redisService.set(`state:${id}`, 'IDLE');

      if (ctx.match?.startsWith('movie_')) {
        // Handle deep link for specific movie
        const code = parseInt(ctx.match.split('_')[1]);
        const movie = await this.moviesService.findByCode(code);
        if (movie) {
          await this.moviesService.addView(BigInt(id), movie.id);
          const avgRating = await this.moviesService.getAverageRating(movie.id);
          const keyboard = new InlineKeyboard();
          for (let i = 1; i <= 5; i++) {
            keyboard.text('⭐️'.repeat(i), `rate_${movie.id}_${i}`).row();
          }
          await ctx.replyWithVideo(movie.fileId, {
            caption:
              MESSAGES.movie_caption_with_code(movie.title, movie.code) +
              `\n\n` +
              MESSAGES.average_rating(avgRating),
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          });
          return;
        }
      }

      // Check if Admin (Superadmin env OR DB Admin)
      const isSuperAdmin = this.superAdminIds.includes(id.toString());
      const isAdmin =
        user.role === Role.ADMIN ||
        user.role === Role.SUPERADMIN ||
        isSuperAdmin;

      if (isAdmin) {
        await this.sendAdminPanel(ctx);
        return;
      }

      const keyboard = new InlineKeyboard()
        .text(MESSAGES.search_movie_btn, 'search_movie')
        .row()
        .text(MESSAGES.random_movie_btn, 'random_movie')
        .row()
        .text(MESSAGES.contact_feedback_btn, 'feedback')
        .row();

      const logoPath = path.join(__dirname, 'static', 'logo.png');
      await ctx.replyWithPhoto(new InputFile(logoPath), {
        caption: MESSAGES.welcome(first_name),
        reply_markup: keyboard,
      });
    });

    // --- ADMIN HANDLERS ---

    this.bot.callbackQuery('admin_panel', async (ctx) => {
      await this.sendAdminPanel(ctx, true);
    });

    this.bot.callbackQuery('user_mode', async (ctx) => {
      const keyboard = new InlineKeyboard()
        .text(MESSAGES.search_movie_btn, 'search_movie')
        .text(MESSAGES.categories_btn, 'categories')
        .row()
        .text(MESSAGES.trending_btn, 'trending')
        .text(MESSAGES.random_movie_btn, 'random_movie')
        .row()
        .text(MESSAGES.request_movie_btn, 'request_movie')
        .text(MESSAGES.contact_feedback_btn, 'feedback')
        .row()
        .text(MESSAGES.admin_panel_btn, 'admin_panel');

      const logoPath = path.join(__dirname, '..', '..', 'static', 'logo.png');
      await ctx.replyWithPhoto(new InputFile(logoPath), {
        caption: MESSAGES.welcome_user_mode(ctx.from.first_name),
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('admin_stats', async (ctx) => {
      const userCount = await this.usersService.count();
      const movieCount = await this.moviesService.countMovies();
      const viewCount = await this.moviesService.countTotalViews();
      const pendingRequests = await this.movieRequestsService.countPending();

      const text =
        MESSAGES.stats_text(userCount, movieCount, viewCount) +
        `\n\n📥 Pending Requests: ${pendingRequests}`;

      const keyboard = new InlineKeyboard().text(MESSAGES.back, 'admin_panel');

      await this.safeEditMessage(ctx, text, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('admin_requests', async (ctx) => {
      const requests = await this.movieRequestsService.findAllPending();
      if (requests.length === 0) {
        await ctx.answerCallbackQuery('No pending requests.');
        return;
      }
      let text = MESSAGES.admin_request_list + '\n\n';
      requests.forEach((r) => {
        const userTag = `@${r.user.username || 'n/a'} (\`${r.userId}\`)`;
        text += MESSAGES.admin_request_item(r.title, userTag);
        text += `\nResolve: /fulfill_${r.id} | /reject_${r.id}\n\n`;
      });
      const keyboard = new InlineKeyboard().text(MESSAGES.back, 'admin_panel');
      await this.safeEditMessage(ctx, text, keyboard);
      await ctx.answerCallbackQuery();
    });

    // Add Movie
    this.bot.callbackQuery('admin_add_movie', async (ctx) => {
      await this.redisService.set(
        `state:${ctx.from.id}`,
        'WAITING_MOVIE_UPLOAD',
      );
      await ctx.reply(MESSAGES.ask_movie_file);
      await ctx.answerCallbackQuery();
    });

    // Add Channel
    this.bot.callbackQuery('admin_add_channel', async (ctx) => {
      await this.redisService.set(`state:${ctx.from.id}`, 'WAITING_CHANNEL_ID');
      await ctx.reply(MESSAGES.ask_channel_id);
      await ctx.answerCallbackQuery();
    });

    // Feedbacks
    this.bot.callbackQuery('admin_feedbacks', async (ctx) => {
      const feedbacks = await this.feedbackService.findAllUnresolved();
      if (feedbacks.length === 0) {
        await ctx.answerCallbackQuery(MESSAGES.no_feedbacks);
        await ctx.reply(MESSAGES.no_feedbacks_msg);
        return;
      }

      await ctx.answerCallbackQuery();
      for (const fb of feedbacks.slice(0, 10)) {
        // Show last 10
        const keyboard = new InlineKeyboard()
          .text(MESSAGES.resolve_btn, `resolve_feedback_${fb.id}`)
          .text(MESSAGES.delete_btn, `delete_feedback_${fb.id}`)
          .row();

        const userTag = fb.user.username
          ? `@${fb.user.username}`
          : `[${fb.userId}](tg://user?id=${fb.userId})`;
        await ctx.reply(
          MESSAGES.feedback_detail(
            userTag,
            fb.message,
            fb.createdAt.toLocaleString(),
          ),
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          },
        );
      }

      await ctx.reply(MESSAGES.feedback_action_prompt, {
        reply_markup: new InlineKeyboard().text(MESSAGES.back, 'admin_panel'),
      });
    });

    this.bot.on('callback_query:data', async (ctx, next) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith('resolve_feedback_')) {
        const id = parseInt(data.replace('resolve_feedback_', ''));
        await this.feedbackService.resolve(id);
        await ctx.answerCallbackQuery(MESSAGES.marked_resolved);
        try {
          await ctx.editMessageText(
            ctx.callbackQuery.message!.text + MESSAGES.resolved_status,
            { parse_mode: 'Markdown' },
          );
        } catch (e: any) {
          if (!e.description?.includes('message is not modified')) throw e;
        }
      } else if (data.startsWith('delete_feedback_')) {
        const id = parseInt(data.replace('delete_feedback_', ''));
        await this.feedbackService.delete(id);
        await ctx.answerCallbackQuery(MESSAGES.deleted_feedback);
        try {
          await ctx.deleteMessage();
        } catch (e) {}
      } else {
        return next();
      }
    });

    // Manage Channels
    this.bot.callbackQuery('admin_manage_channels', async (ctx) => {
      const channels = await this.channelsService.findAll();
      const keyboard = new InlineKeyboard()
        .text(MESSAGES.add_channel_btn, 'admin_add_channel')
        .row();

      channels.forEach((ch) => {
        keyboard.text(ch.title, `manage_channel_${ch.id}`).row();
      });
      keyboard.text(MESSAGES.back, 'admin_panel');

      await this.safeEditMessage(ctx, MESSAGES.manage_channels_title, keyboard);
      await ctx.answerCallbackQuery();
    });

    // Manage Movies
    this.bot.callbackQuery('admin_manage_movies', async (ctx) => {
      const keyboard = new InlineKeyboard()
        .text(MESSAGES.add_movie_btn, 'admin_add_movie')
        .row()
        .text(MESSAGES.manage_by_code_btn, 'admin_manage_movie_by_code')
        .row()
        .text(MESSAGES.back, 'admin_panel');

      await this.safeEditMessage(ctx, MESSAGES.manage_movies_title, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('admin_manage_movie_by_code', async (ctx) => {
      await this.redisService.set(
        `state:${ctx.from.id}`,
        'WAITING_MOVIE_EDIT_CODE',
      );
      await ctx.reply(MESSAGES.ask_movie_code_manage);
      await ctx.answerCallbackQuery();
    });

    // Manage Admins (Superadmin Only)
    this.bot.callbackQuery(/^admin_manage_admins(_\d+)?$/, async (ctx) => {
      if (!this.superAdminIds.includes(ctx.from.id.toString())) {
        await ctx.answerCallbackQuery(MESSAGES.unauthorized);
        return;
      }

      const match = ctx.callbackQuery.data.match(/admin_manage_admins_(\d+)/);
      const page = match ? parseInt(match[1]) : 0;
      const limit = 6;

      const admins = await this.usersService.findAdmins(page, limit);
      const totalAdmins = await this.usersService.countAdmins();
      const totalPages = Math.ceil(totalAdmins / limit);

      const keyboard = new InlineKeyboard()
        .text(MESSAGES.add_admin_btn, 'admin_make_admin')
        .row();

      admins.forEach((admin) => {
        const label = admin.firstName || admin.username || admin.id.toString();
        keyboard.text(label, `manage_admin_${admin.id}`).row();
      });

      // Pagination row
      if (page > 0) {
        keyboard.text('⬅️ Prev', `admin_manage_admins_${page - 1}`);
      }
      keyboard.text(MESSAGES.page(page + 1, totalPages || 1), MESSAGES.ignore);
      if (page + 1 < totalPages) {
        keyboard.text('➡️ Next', `admin_manage_admins_${page + 1}`);
      }
      keyboard.row();
      keyboard.text(MESSAGES.back, 'admin_panel');

      await this.safeEditMessage(ctx, MESSAGES.manage_admins_title, keyboard);
      await ctx.answerCallbackQuery();
    });
    // Manage Categories
    this.bot.callbackQuery('admin_manage_categories', async (ctx) => {
      const categories = await this.moviesService.getAllCategories();
      const keyboard = new InlineKeyboard()
        .text("➕ Janr qo'shish", 'admin_add_category')
        .row();

      categories.forEach((cat) => {
        keyboard
          .text(cat.name, `ignore`)
          .text('🗑️', `delete_cat_${cat.id}`)
          .row();
      });
      keyboard.text(MESSAGES.back, 'admin_panel');

      await this.safeEditMessage(ctx, '🎬 *Janrlarni boshqarish*', keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('admin_add_category', async (ctx) => {
      await this.redisService.set(
        `state:${ctx.from.id}`,
        'WAITING_CATEGORY_NAME',
      );
      await ctx.reply('Iltimos, yangi janr nomini yuboring:');
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery(/^delete_cat_(\d+)$/, async (ctx) => {
      const id = parseInt(ctx.match[1]);
      await this.moviesService.deleteCategory(id);
      await ctx.answerCallbackQuery("Janr o'chirildi.");
      // Refresh list
      const categories = await this.moviesService.getAllCategories();
      const keyboard = new InlineKeyboard()
        .text("➕ Janr qo'shish", 'admin_add_category')
        .row();
      categories.forEach((cat) => {
        keyboard
          .text(cat.name, `ignore`)
          .text('🗑️', `delete_cat_${cat.id}`)
          .row();
      });
      keyboard.text(MESSAGES.back, 'admin_panel');
      await this.safeEditMessage(ctx, '🎬 *Janrlarni boshqarish*', keyboard);
    });

    this.bot.callbackQuery(/^manage_admin_(\d+)$/, async (ctx) => {
      const adminId = BigInt(ctx.match[1]);
      const admin = await this.usersService.findById(adminId);

      if (!admin) {
        await ctx.answerCallbackQuery('Admin not found.');
        return;
      }

      await this.redisService.set(
        `temp_edit_admin:${ctx.from.id}`,
        admin.id.toString(),
      );

      const keyboard = new InlineKeyboard()
        .text(MESSAGES.remove_access_btn, 'delete_admin_access')
        .row()
        .text(MESSAGES.back, 'admin_manage_admins');

      const info = MESSAGES.admin_detail(
        admin.firstName || 'N/A',
        admin.username || 'n/a',
        admin.id.toString(),
        admin.role,
      );

      await this.safeEditMessage(ctx, info, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('delete_admin_access', async (ctx) => {
      if (!this.superAdminIds.includes(ctx.from.id.toString())) {
        await ctx.answerCallbackQuery(MESSAGES.unauthorized);
        return;
      }

      const adminIdStr = await this.redisService.get(
        `temp_edit_admin:${ctx.from.id}`,
      );
      if (!adminIdStr) {
        await ctx.answerCallbackQuery(
          MESSAGES.session_expired || 'Session expired.',
        );
        return;
      }

      if (this.superAdminIds.includes(adminIdStr)) {
        await ctx.answerCallbackQuery(MESSAGES.cannot_remove_superadmin);
        return;
      }

      await this.usersService.setRole(BigInt(adminIdStr), Role.USER);
      await ctx.answerCallbackQuery(MESSAGES.access_removed);
      await ctx.reply(MESSAGES.access_removed_for(adminIdStr));
      await this.redisService.del(`temp_edit_admin:${ctx.from.id}`);
      await this.sendAdminPanel(ctx);
    });

    // List Users
    this.bot.callbackQuery('admin_list_users', async (ctx) => {
      await ctx.reply(MESSAGES.generating_user_list);
      const users = await this.usersService.findAll();
      const csvContent =
        ['ID,Username,FirstName,Role,CreatedAt'].join(',') +
        '\n' +
        users
          .map(
            (u) =>
              `${u.id},${u.username || ''},${u.firstName || ''},${u.role},${u.createdAt.toISOString()}`,
          )
          .join('\n');

      const filePath = path.join(__dirname, 'users_export.csv');
      fs.writeFileSync(filePath, csvContent);

      await ctx.replyWithDocument(new InputFile(filePath));
      fs.unlinkSync(filePath); // Cleanup
      await ctx.answerCallbackQuery();
    });

    // Make Admin
    this.bot.callbackQuery('admin_make_admin', async (ctx) => {
      if (!this.superAdminIds.includes(ctx.from.id.toString())) {
        await ctx.answerCallbackQuery(MESSAGES.unauthorized);
        return;
      }
      await this.redisService.set(`state:${ctx.from.id}`, 'WAITING_PROMOTE_ID');
      await ctx.reply(MESSAGES.ask_promote_id);
      await ctx.answerCallbackQuery();
    });

    // General Callback for managing specific channel
    this.bot.on('callback_query:data', async (ctx, next) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith('manage_channel_')) {
        const channelId = parseInt(data.replace('manage_channel_', ''));
        const channel = await this.channelsService.findById(channelId);
        if (!channel) {
          await ctx.answerCallbackQuery(
            MESSAGES.channel_not_found || 'Channel not found.',
          );
          return;
        }

        await this.redisService.set(
          `temp_edit_channel:${ctx.from.id}`,
          channelId.toString(),
        );

        const keyboard = new InlineKeyboard()
          .text(MESSAGES.edit_title_btn, 'edit_channel_title')
          .text(MESSAGES.edit_link_btn, 'edit_channel_link')
          .row()
          .text(MESSAGES.delete_channel_btn, 'delete_channel')
          .row()
          .text(MESSAGES.back, 'admin_manage_channels');

        const text = MESSAGES.channel_detail(
          channel.title,
          channel.channelId.toString(),
          channel.inviteLink,
        );

        await this.safeEditMessage(ctx, text, keyboard);
        await ctx.answerCallbackQuery();
      } else if (data === 'edit_channel_title') {
        const channelIdStr = await this.redisService.get(
          `temp_edit_channel:${ctx.from.id}`,
        );
        if (channelIdStr) {
          await this.redisService.set(
            `state:${ctx.from.id}`,
            'WAITING_EDIT_CHANNEL_TITLE',
          );
          await ctx.reply(MESSAGES.ask_new_channel_title);
        }
        await ctx.answerCallbackQuery();
      } else if (data === 'edit_channel_link') {
        const channelIdStr = await this.redisService.get(
          `temp_edit_channel:${ctx.from.id}`,
        );
        if (channelIdStr) {
          await this.redisService.set(
            `state:${ctx.from.id}`,
            'WAITING_EDIT_CHANNEL_LINK',
          );
          await ctx.reply(MESSAGES.ask_new_channel_link);
        }
        await ctx.answerCallbackQuery();
      } else if (data === 'delete_channel') {
        const channelIdStr = await this.redisService.get(
          `temp_edit_channel:${ctx.from.id}`,
        );
        if (channelIdStr) {
          await this.channelsService.delete(parseInt(channelIdStr));
          await ctx.reply(MESSAGES.channel_deleted);
          await this.redisService.del(`temp_edit_channel:${ctx.from.id}`);
          await this.sendAdminPanel(ctx); // Go back to Home
        }
        await ctx.answerCallbackQuery();
      } else if (data === 'edit_movie_title') {
        const movieIdStr = await this.redisService.get(
          `temp_edit_movie:${ctx.from.id}`,
        );
        if (movieIdStr) {
          await this.redisService.set(
            `state:${ctx.from.id}`,
            'WAITING_EDIT_MOVIE_TITLE',
          );
          await ctx.reply(MESSAGES.ask_new_movie_title);
        }
        await ctx.answerCallbackQuery();
      } else if (data === 'delete_movie') {
        const movieIdStr = await this.redisService.get(
          `temp_edit_movie:${ctx.from.id}`,
        );
        if (movieIdStr) {
          await this.moviesService.delete(parseInt(movieIdStr));
          await ctx.reply(MESSAGES.movie_deleted);
          await this.redisService.del(`temp_edit_movie:${ctx.from.id}`);
          await this.sendAdminPanel(ctx);
        }
        await ctx.answerCallbackQuery();
      } else {
        return next();
      }
    });

    // --- USER HANDLERS ---

    this.bot.callbackQuery('feedback', async (ctx) => {
      await this.redisService.set(`state:${ctx.from.id}`, 'WAITING_FEEDBACK');
      await ctx.reply(MESSAGES.ask_feedback);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('random_movie', async (ctx) => {
      const movie = await this.moviesService.getRandom();
      if (!movie) {
        await ctx.answerCallbackQuery(MESSAGES.no_movies);
        return;
      }
      await this.moviesService.addView(BigInt(ctx.from.id), movie.id);
      const avgRating = await this.moviesService.getAverageRating(movie.id);

      const keyboard = new InlineKeyboard();
      for (let i = 1; i <= 5; i++) {
        keyboard.text('⭐️'.repeat(i), `rate_${movie.id}_${i}`).row();
      }

      await ctx.replyWithVideo(movie.fileId, {
        caption:
          MESSAGES.movie_caption_with_code(movie.title, movie.code) +
          `\n\n` +
          MESSAGES.average_rating(avgRating),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery(/^rate_(\d+)_(\d+)$/, async (ctx) => {
      const movieId = parseInt(ctx.match[1]);
      const score = parseInt(ctx.match[2]);
      await this.moviesService.addRating(BigInt(ctx.from.id), movieId, score);
      await ctx.answerCallbackQuery(MESSAGES.rating_thanks);

      // Optionally update the message with new average rating
      const avgRating = await this.moviesService.getAverageRating(movieId);
      const movie = await this.moviesService.findById(movieId);
      if (movie && ctx.callbackQuery.message) {
        try {
          await ctx.editMessageCaption({
            caption:
              MESSAGES.movie_caption_with_code(movie.title, movie.code) +
              `\n\n` +
              MESSAGES.average_rating(avgRating),
            parse_mode: 'Markdown',
            reply_markup: ctx.callbackQuery.message.reply_markup,
          });
        } catch (e: any) {
          if (!e.description?.includes('message is not modified')) throw e;
        }
      }
    });

    this.bot.callbackQuery('search_movie', async (ctx) => {
      await this.redisService.set(`state:${ctx.from.id}`, 'WAITING_MOVIE_CODE');
      await ctx.reply(MESSAGES.ask_movie_code);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('categories', async (ctx) => {
      const categories = await this.moviesService.getAllCategories();
      if (categories.length === 0) {
        await ctx.answerCallbackQuery(MESSAGES.no_categories);
        return;
      }
      const keyboard = new InlineKeyboard();
      categories.forEach((cat) => {
        keyboard.text(cat.name, `cat_${cat.id}`).row();
      });
      keyboard.text(MESSAGES.back, 'user_mode');
      await this.safeEditMessage(ctx, MESSAGES.select_category, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery(/^cat_(\d+)$/, async (ctx) => {
      const catId = parseInt(ctx.match[1]);
      const movies = await this.moviesService.findByCategory(catId);
      if (movies.length === 0) {
        await ctx.answerCallbackQuery(MESSAGES.no_movies_in_category);
        return;
      }

      // Show list of movies in category (pagination could be added later)
      let text = `🎬 *Movies*: \n\n`;
      const keyboard = new InlineKeyboard();
      movies.forEach((m) => {
        text += `- ${m.title} (Code: \`${m.code}\`)\n`;
      });
      keyboard.text(MESSAGES.back, 'categories');

      await this.safeEditMessage(ctx, text, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('trending', async (ctx) => {
      const topMovies = await this.moviesService.getTopMovies();
      if (topMovies.length === 0) {
        await ctx.answerCallbackQuery(MESSAGES.no_movies);
        return;
      }

      let text = MESSAGES.trending_title + '\n\n';
      topMovies.forEach((m, i) => {
        text += `${i + 1}. ${m.title} (Code: \`${m.code}\`)\n`;
      });

      const keyboard = new InlineKeyboard().text(MESSAGES.back, 'user_mode');
      await this.safeEditMessage(ctx, text, keyboard);
      await ctx.answerCallbackQuery();
    });

    this.bot.callbackQuery('request_movie', async (ctx) => {
      await this.redisService.set(
        `state:${ctx.from.id}`,
        'WAITING_REQUEST_TITLE',
      );
      await ctx.reply(MESSAGES.ask_request_title);
      await ctx.answerCallbackQuery();
    });

    // --- MESSAGE HANDLERS ---

    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from.id;
      const state = await this.redisService.get(`state:${userId}`);

      // Helper to check admin
      const isSuperAdmin = this.superAdminIds.includes(userId.toString());
      // We should check DB role too usually, but for performance maybe stick to cached state or just check DB if critical
      // For simplicity in message handler, we assume if they are in a WAITING_ADMIN state they have permission (checked before entering state)
      // modifying this to be safe: check role again if critical action
      // But let's keep it simple for now.

      if (state === 'WAITING_MOVIE_CODE') {
        const text = ctx.message.text;
        const code = parseInt(text, 10);
        if (isNaN(code)) {
          await ctx.reply(MESSAGES.invalid_code);
          return;
        }
        const movie = await this.moviesService.findByCode(code);
        if (!movie) {
          await ctx.reply(MESSAGES.movie_not_found);
          return;
        }
        await this.moviesService.addView(BigInt(userId), movie.id);
        const avgRating = await this.moviesService.getAverageRating(movie.id);

        const keyboard = new InlineKeyboard();
        for (let i = 1; i <= 5; i++) {
          keyboard.text('⭐️'.repeat(i), `rate_${movie.id}_${i}`).row();
        }

        await ctx.replyWithVideo(movie.fileId, {
          caption:
            MESSAGES.movie_caption(movie.title) +
            `\n\n` +
            MESSAGES.average_rating(avgRating),
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
        await this.redisService.set(`state:${userId}`, 'IDLE');
      } else if (state === 'WAITING_REQUEST_TITLE') {
        const title = ctx.message.text;
        await this.movieRequestsService.create(BigInt(userId), title);
        await ctx.reply(MESSAGES.request_received);
        await this.redisService.set(`state:${userId}`, 'IDLE');

        // Notify Admins
        for (const adminId of this.superAdminIds) {
          try {
            await this.bot.api.sendMessage(
              adminId,
              `📥 *New Movie Request*:\n${title}\nFrom: @${ctx.from.username || 'unknown'} (${userId})`,
              { parse_mode: 'Markdown' },
            );
          } catch (e) {}
        }
      } else if (state === 'WAITING_FEEDBACK') {
        await this.feedbackService.create(BigInt(userId), ctx.message.text);
        await ctx.reply(MESSAGES.feedback_sent);
        await this.redisService.set(`state:${userId}`, 'IDLE');
        for (const adminId of this.superAdminIds) {
          try {
            await this.bot.api.sendMessage(
              adminId,
              MESSAGES.new_feedback_admin(
                ctx.from.username || 'unknown',
                userId.toString(),
                ctx.message.text,
              ),
            );
          } catch (e) {}
        }
      } else if (state === 'WAITING_MOVIE_UPLOAD') {
        await ctx.reply(MESSAGES.ask_movie_file_not_text);
      } else if (state === 'WAITING_CHANNEL_ID') {
        // ... (existing channel logic)
        try {
          const channelIdText = ctx.message.text;
          if (!/^-?\d+$/.test(channelIdText)) {
            await ctx.reply(MESSAGES.invalid_channel_id);
            return;
          }
          const channelId = BigInt(channelIdText);

          let title = 'New Channel';
          let inviteLink = '';

          try {
            const chat = await ctx.api.getChat(Number(channelId));
            title = chat.title || title;
            inviteLink = chat.invite_link || '';
            if (chat.username) inviteLink = `https://t.me/${chat.username}`;

            if (inviteLink) {
              await this.channelsService.addChannel(
                channelId,
                title,
                inviteLink,
              );
              await ctx.reply(MESSAGES.channel_added(title, inviteLink));
              await this.redisService.set(`state:${userId}`, 'IDLE');
              return;
            }
          } catch (e) {}

          await this.redisService.set(
            `state:${userId}`,
            'WAITING_CHANNEL_LINK',
          );
          await this.redisService.set(
            `temp_channel_id:${userId}`,
            channelId.toString(),
          );
          await ctx.reply(MESSAGES.ask_channel_link);
        } catch (e) {
          await ctx.reply(MESSAGES.error);
        }
      } else if (state === 'WAITING_CHANNEL_LINK') {
        const link = ctx.message.text;
        const channelIdStr = await this.redisService.get(
          `temp_channel_id:${userId}`,
        );
        if (!channelIdStr) {
          await ctx.reply(MESSAGES.session_expired);
          await this.redisService.set(`state:${userId}`, 'IDLE');
          return;
        }
        await this.channelsService.addChannel(
          BigInt(channelIdStr),
          `Channel ${channelIdStr}`,
          link,
        );
        await ctx.reply(MESSAGES.channel_added_simple);
        await this.redisService.set(`state:${userId}`, 'IDLE');
        await this.redisService.del(`temp_channel_id:${userId}`);
      } else if (state === 'WAITING_MOVIE_EDIT_CODE') {
        const code = parseInt(ctx.message.text);
        if (isNaN(code)) {
          await ctx.reply(MESSAGES.invalid_code);
          return;
        }

        const movie = await this.moviesService.findByCode(code);
        if (!movie) {
          await ctx.reply(MESSAGES.movie_not_found_admin);
          return;
        }

        await this.redisService.set(
          `temp_edit_movie:${userId}`,
          movie.id.toString(),
        );
        await this.redisService.set(`state:${userId}`, 'IDLE'); // Clear state, show menu

        const keyboard = new InlineKeyboard()
          .text(MESSAGES.edit_title_btn, 'edit_movie_title')
          .row()
          .text(MESSAGES.delete_btn, 'delete_movie')
          .row()
          .text(MESSAGES.back, 'admin_manage_movies');

        await ctx.reply(MESSAGES.manage_movie_detail(movie.title, movie.code), {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } else if (state === 'WAITING_PROMOTE_ID') {
        const targetIdText = ctx.message.text;
        if (!/^\d+$/.test(targetIdText)) {
          await ctx.reply(MESSAGES.invalid_id);
          return;
        }

        const targetId = BigInt(targetIdText);
        try {
          // Ensure user exists locally or creating them is tough without more info.
          // We assume they started the bot.
          const targetUser = await this.usersService.findById(Number(targetId));
          // Note: findById takes number|bigint in service.

          if (!targetUser) {
            await ctx.reply(MESSAGES.user_not_found);
            return;
          }

          await this.usersService.setRole(targetId, Role.ADMIN);
          await ctx.reply(MESSAGES.user_promoted(targetId.toString()));
          await this.redisService.set(`state:${userId}`, 'IDLE');
        } catch (e) {
          await ctx.reply(MESSAGES.promote_error);
        }
      } else if (state === 'WAITING_EDIT_CHANNEL_TITLE') {
        const idStr = await this.redisService.get(
          `temp_edit_channel:${userId}`,
        );
        if (idStr) {
          await this.channelsService.update(parseInt(idStr), {
            title: ctx.message.text,
          });
          await ctx.reply(MESSAGES.channel_title_updated);
          await this.redisService.set(`state:${userId}`, 'IDLE');
          await this.sendAdminPanel(ctx);
        }
      } else if (state === 'WAITING_EDIT_CHANNEL_LINK') {
        const idStr = await this.redisService.get(
          `temp_edit_channel:${userId}`,
        );
        if (idStr) {
          await this.channelsService.update(parseInt(idStr), {
            inviteLink: ctx.message.text,
          });
          await ctx.reply(MESSAGES.channel_link_updated);
          await this.redisService.set(`state:${userId}`, 'IDLE');
          await this.sendAdminPanel(ctx);
        }
      } else if (state === 'WAITING_EDIT_MOVIE_TITLE') {
        const idStr = await this.redisService.get(`temp_edit_movie:${userId}`);
        if (idStr) {
          await this.moviesService.update(parseInt(idStr), {
            title: ctx.message.text,
          });
          await ctx.reply(MESSAGES.movie_title_updated);
          await this.redisService.set(`state:${userId}`, 'IDLE');
          await this.sendAdminPanel(ctx);
        }
      } else if (state === 'WAITING_CATEGORY_NAME') {
        const name = ctx.message.text;
        await this.moviesService.addCategory(name);
        await ctx.reply(`✅ Janr "${name}" qo'shildi.`);
        await this.redisService.set(`state:${userId}`, 'IDLE');
        await this.sendAdminPanel(ctx);
      } else if (state === 'WAITING_MOVIE_TITLE') {
        const title = ctx.message.text;
        await this.redisService.set(`temp_movie_title:${userId}`, title);
        await this.redisService.set(
          `state:${userId}`,
          'WAITING_MOVIE_CATEGORY',
        );

        const categories = await this.moviesService.getAllCategories();
        const keyboard = new InlineKeyboard();
        categories.forEach((cat) => {
          keyboard.text(cat.name, `set_movie_category_${cat.id}`).row();
        });
        keyboard
          .text(MESSAGES.skip_category_btn, 'set_movie_category_none')
          .row();

        await ctx.reply(MESSAGES.ask_movie_category, {
          reply_markup: keyboard,
        });
      }
    });

    this.bot.on('message:video', async (ctx) => {
      const userId = ctx.from.id;
      const state = await this.redisService.get(`state:${userId}`);

      if (state === 'WAITING_MOVIE_UPLOAD') {
        const video = ctx.message.video;
        await this.redisService.set(
          `temp_movie_file_id:${userId}`,
          video.file_id,
        );
        await this.redisService.set(`state:${userId}`, 'WAITING_MOVIE_TITLE');
        await ctx.reply(MESSAGES.ask_new_movie_title);
      }
    });

    this.bot.on('callback_query:data', async (ctx, next) => {
      const userId = ctx.from!.id;
      const data = ctx.callbackQuery.data;

      if (data.startsWith('set_movie_category_')) {
        const categoryIdStr = data.split('_')[3];
        const fileId = await this.redisService.get(
          `temp_movie_file_id:${userId}`,
        );
        const title = await this.redisService.get(`temp_movie_title:${userId}`);

        if (!fileId || !title) {
          await ctx.answerCallbackQuery(MESSAGES.session_expired);
          await this.redisService.set(`state:${userId}`, 'IDLE');
          return;
        }

        const code = Math.floor(1000 + Math.random() * 9000);
        const movieData: any = {
          title: title,
          fileId: fileId,
          code: code,
        };

        if (categoryIdStr !== 'none') {
          movieData.categoryId = parseInt(categoryIdStr);
        }

        await this.moviesService.create(movieData);
        await ctx.answerCallbackQuery();
        await ctx.reply(MESSAGES.movie_saved(title, code));
        await this.redisService.set(`state:${userId}`, 'IDLE');
        await this.redisService.del(`temp_movie_file_id:${userId}`);
        await this.redisService.del(`temp_movie_title:${userId}`);
      } else {
        return next();
      }
    });

    // Start
    this.bot
      .start({
        onStart: (bot) => this.logger.log(`Bot started as @${bot.username}`),
      })
      .catch((err) => this.logger.error('Bot failed to start', err));
  }

  async onModuleDestroy() {
    await this.bot.stop();
  }

  getBot(): Bot<Context> {
    return this.bot;
  }

  private async sendAdminPanel(ctx: Context, isEdit = false) {
    const userId = ctx.from!.id;
    const isSuperAdmin = this.superAdminIds.includes(userId.toString());

    const keyboard = new InlineKeyboard()
      .text(MESSAGES.stats_btn, 'admin_stats')
      .text(MESSAGES.users_btn, 'admin_list_users')
      .row()
      .text(MESSAGES.movies_btn, 'admin_manage_movies')
      .text(MESSAGES.channels_btn, 'admin_manage_channels')
      .row()
      .text(MESSAGES.feedbacks_btn, 'admin_feedbacks')
      .text('📥 Requests', 'admin_requests')
      .row()
      .text(MESSAGES.categories_btn, 'admin_manage_categories');

    if (isSuperAdmin) {
      keyboard.text(MESSAGES.admins_btn, 'admin_manage_admins').row();
    }

    keyboard.text(MESSAGES.user_mode_btn, 'user_mode').row();

    const text = MESSAGES.admin_panel_title;
    await this.safeEditMessage(ctx, text, keyboard, isEdit);
  }

  private async safeEditMessage(
    ctx: Context,
    text: string,
    keyboard: InlineKeyboard,
    isEdit: boolean = true,
  ) {
    if (isEdit && ctx.callbackQuery && ctx.callbackQuery.message) {
      const hasMedia = !!(
        ctx.callbackQuery.message.photo ||
        ctx.callbackQuery.message.video ||
        ctx.callbackQuery.message.animation
      );

      if (hasMedia) {
        try {
          await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } else {
        try {
          await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          });
        } catch (e: any) {
          if (e.description?.includes('message is not modified')) {
            // Ignore
          } else {
            throw e;
          }
        }
      }
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }
}
